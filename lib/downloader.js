/**
 * downloader — thin, safe wrapper around the yt-dlp binary.
 *
 * Everything here is configurable with environment variables (all optional):
 *   YTDLP_BIN              path/name of the binary            (default: yt-dlp)
 *   MAX_DOWNLOAD_MB        refuse files bigger than this      (default: 100)
 *   YTDLP_MAX_HEIGHT       max video height                   (default: 720)
 *   DL_MAX_CONCURRENT      downloads running at once          (default: 2)
 *   DL_TIMEOUT_SECONDS     kill a stuck download after        (default: 180)
 *   YTDLP_JS_RUNTIME       e.g. "node" — needed by recent yt-dlp for YouTube
 *   YTDLP_COOKIES_FILE     path to a Netscape cookies.txt     (optional)
 *   YTDLP_COOKIES_B64      same file, base64-encoded          (optional)
 *   YTDLP_EXTRA_ARGS       extra flags appended to every call (optional)
 */

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const num = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : d;
};

const BIN = () => process.env.YTDLP_BIN || 'yt-dlp';
const MAX_DOWNLOAD_MB = () => num(process.env.MAX_DOWNLOAD_MB, 100);
const MAX_HEIGHT = () => num(process.env.YTDLP_MAX_HEIGHT, 720);
const MAX_CONCURRENT = () => num(process.env.DL_MAX_CONCURRENT, 2);
const TIMEOUT_MS = () => num(process.env.DL_TIMEOUT_SECONDS, 180) * 1000;
const TMP_ROOT = path.join(os.tmpdir(), 'megamind-dl');

class DownloadError extends Error {
    constructor(userMessage, detail) {
        super(userMessage);
        this.name = 'DownloadError';
        this.userMessage = userMessage;
        this.detail = detail || '';
    }
}

// ---------------------------------------------------------------- helpers

const URL_RE = /https?:\/\/[^\s<>"']+/i;

function extractUrl(text) {
    const m = String(text || '').match(URL_RE);
    return m ? m[0] : null;
}

function isUrl(text) {
    return /^https?:\/\/\S+$/i.test(String(text || '').trim());
}

function ensureTmp() {
    fs.mkdirSync(TMP_ROOT, { recursive: true });
}

// ---------------------------------------------------------------- concurrency

let active = 0;
const waiting = [];

function acquire() {
    return new Promise((resolve) => {
        if (active < MAX_CONCURRENT()) {
            active++;
            resolve();
        } else {
            waiting.push(resolve);
        }
    });
}

function release() {
    const next = waiting.shift();
    if (next) next(); // hand the slot straight to the next waiter
    else active--;
}

// ---------------------------------------------------------------- cookies

let cookiesPath; // undefined = not resolved yet, null = none

function getCookies() {
    if (cookiesPath !== undefined) return cookiesPath;
    cookiesPath = null;
    try {
        ensureTmp();
        const target = path.join(TMP_ROOT, 'cookies.txt');
        // Always use a writable copy: yt-dlp tries to save cookies back.
        if (process.env.YTDLP_COOKIES_B64) {
            fs.writeFileSync(target, Buffer.from(process.env.YTDLP_COOKIES_B64, 'base64'), { mode: 0o600 });
            cookiesPath = target;
        } else if (process.env.YTDLP_COOKIES_FILE && fs.existsSync(process.env.YTDLP_COOKIES_FILE)) {
            fs.copyFileSync(process.env.YTDLP_COOKIES_FILE, target);
            fs.chmodSync(target, 0o600);
            cookiesPath = target;
        }
    } catch (err) {
        console.error('⚠️  Could not prepare yt-dlp cookies:', err.message);
    }
    return cookiesPath;
}

// ---------------------------------------------------------------- yt-dlp

function commonArgs() {
    const args = [
        '--no-playlist',
        '--no-warnings',
        '--no-color',
        '--restrict-filenames',
        '--no-mtime',
        '--socket-timeout', '20',
        '--retries', '2',
        '--max-filesize', `${MAX_DOWNLOAD_MB()}M`
    ];
    if (process.env.YTDLP_JS_RUNTIME) args.push('--js-runtimes', process.env.YTDLP_JS_RUNTIME);
    const cookies = getCookies();
    if (cookies) args.push('--cookies', cookies);
    if (process.env.YTDLP_EXTRA_ARGS) args.push(...process.env.YTDLP_EXTRA_ARGS.split(/\s+/).filter(Boolean));
    return args;
}

function runYtdlp(args, timeoutMs = TIMEOUT_MS()) {
    return new Promise((resolve, reject) => {
        execFile(
            BIN(),
            args,
            { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) {
                    err.stdout = String(stdout || '');
                    err.stderr = String(stderr || '');
                    return reject(err);
                }
                resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
            }
        );
    });
}

function mapError(err) {
    const text = `${err.stderr || ''}\n${err.message || ''}`;

    if (err.code === 'ENOENT') {
        return new DownloadError('yt-dlp is not installed on this server. Deploy with the Dockerfile (see setup notes).', text);
    }
    if (err.killed || err.signal === 'SIGTERM') {
        return new DownloadError('⏱️ That took too long and was cancelled. Try a shorter video.', text);
    }
    if (/confirm you.?re not a bot|sign in to confirm|cookies/i.test(text)) {
        return new DownloadError('🔒 YouTube blocked the server. The owner needs to add a cookies file (YTDLP_COOKIES_B64).', text);
    }
    if (/private|login required|log in|sign in|members-only|age/i.test(text) && /video|reel|post|account|content/i.test(text)) {
        return new DownloadError('🔒 That link is private, age-restricted or needs a login.', text);
    }
    if (/unsupported url/i.test(text)) {
        return new DownloadError('❌ That link isn’t supported.', text);
    }
    if (/video unavailable|not available|removed|deleted|does not exist|404/i.test(text)) {
        return new DownloadError('❌ That video is unavailable or was removed.', text);
    }
    if (/ffmpeg|ffprobe/i.test(text)) {
        return new DownloadError('❌ ffmpeg is missing on the server, so the file couldn’t be converted.', text);
    }
    if (/http error 429|too many requests|rate.?limit/i.test(text)) {
        return new DownloadError('⚠️ The site is rate-limiting the server. Try again in a few minutes.', text);
    }
    return new DownloadError('❌ Download failed. Check the link and try again.', text);
}

/**
 * Download media for a URL or a search phrase.
 * kind: 'audio' (mp3) | 'video' (mp4)
 * Returns { file, size, title, duration, uploader, url, cleanup }.
 * The caller MUST call cleanup() when finished sending the file.
 */
async function download(kind, input) {
    const target = isUrl(input) ? input.trim() : `ytsearch1:${String(input).trim()}`;

    await acquire();
    ensureTmp();
    const dir = path.join(TMP_ROOT, crypto.randomBytes(6).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    const cleanup = () => {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    };

    try {
        const args = [
            ...commonArgs(),
            '-o', path.join(dir, '%(id)s.%(ext)s'),
            '--print', 'after_move:%(title)s|||%(duration)s|||%(uploader)s|||%(webpage_url)s'
        ];

        if (kind === 'audio') {
            args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '5');
        } else {
            args.push(
                '-f', 'bv*+ba/b',
                '-S', `res:${MAX_HEIGHT()},vcodec:h264,acodec:m4a`,
                '--merge-output-format', 'mp4'
            );
        }
        args.push(target);

        let out;
        try {
            out = await runYtdlp(args);
        } catch (err) {
            throw mapError(err);
        }

        const files = fs.readdirSync(dir)
            .filter((f) => !/\.(part|ytdl|json|txt|temp)$/i.test(f))
            .map((f) => ({ f, size: fs.statSync(path.join(dir, f)).size }))
            .sort((a, b) => b.size - a.size);

        if (!files.length || files[0].size === 0) {
            throw new DownloadError(
                `❌ Couldn’t get that file — it may be bigger than ${MAX_DOWNLOAD_MB()} MB or unavailable.`,
                out.stderr
            );
        }

        const lastLine = out.stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
        const [title, duration, uploader, url] = lastLine.split('|||');

        return {
            file: path.join(dir, files[0].f),
            size: files[0].size,
            title: title && title !== 'NA' ? title : 'Download',
            duration: Number(duration) || 0,
            uploader: uploader && uploader !== 'NA' ? uploader : '',
            url: url && url !== 'NA' ? url : (isUrl(input) ? input.trim() : ''),
            cleanup
        };
    } catch (err) {
        cleanup();
        throw err;
    } finally {
        release();
    }
}

/** Search YouTube. Returns [{ id, title, duration, channel, url }] */
async function search(query, limit = 5) {
    const args = [
        '--no-warnings', '--no-color', '--flat-playlist',
        '--print', '%(id)s|||%(title)s|||%(duration_string)s|||%(channel)s',
        `ytsearch${limit}:${String(query).trim()}`
    ];
    if (process.env.YTDLP_JS_RUNTIME) args.push('--js-runtimes', process.env.YTDLP_JS_RUNTIME);
    const cookies = getCookies();
    if (cookies) args.push('--cookies', cookies);

    let out;
    try {
        out = await runYtdlp(args, 60 * 1000);
    } catch (err) {
        throw mapError(err);
    }

    return out.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const [id, title, duration, channel] = line.split('|||');
            return {
                id,
                title: title || 'Untitled',
                duration: duration && duration !== 'NA' ? duration : '',
                channel: channel && channel !== 'NA' ? channel : '',
                url: `https://www.youtube.com/watch?v=${id}`
            };
        })
        .filter((r) => r.id);
}

async function version() {
    try {
        const out = await runYtdlp(['--version'], 15 * 1000);
        return out.stdout.trim();
    } catch (err) {
        throw mapError(err);
    }
}

async function updateYtdlp() {
    try {
        const out = await runYtdlp(['-U'], 120 * 1000);
        return (out.stdout + out.stderr).trim();
    } catch (err) {
        throw mapError(err);
    }
}

// ---------------------------------------------------------------- housekeeping

function sweepOld() {
    try {
        if (!fs.existsSync(TMP_ROOT)) return;
        const cutoff = Date.now() - 60 * 60 * 1000;
        for (const name of fs.readdirSync(TMP_ROOT)) {
            const p = path.join(TMP_ROOT, name);
            try {
                if (name !== 'cookies.txt' && fs.statSync(p).mtimeMs < cutoff) {
                    fs.rmSync(p, { recursive: true, force: true });
                }
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

sweepOld();
setInterval(sweepOld, 30 * 60 * 1000).unref();

module.exports = {
    download,
    search,
    version,
    updateYtdlp,
    extractUrl,
    isUrl,
    DownloadError,
    limits: { maxDownloadMb: MAX_DOWNLOAD_MB }
};
