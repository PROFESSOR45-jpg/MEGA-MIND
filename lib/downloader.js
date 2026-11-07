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
 *
 * REMOTE MODE (use this on hosts without yt-dlp/ffmpeg, e.g. Node-only panels):
 *   DL_API_URL             base URL of your downloader service, e.g.
 *                          https://xxxx.apps.bot-hosting.cloud   (no trailing /download)
 *   DL_API_SECRET          the shared secret that service expects
 * When DL_API_URL is set, downloads go through that service instead of a
 * local yt-dlp binary.
 *
 * DOWNLOAD_API_URL / DOWNLOAD_API_SECRET are accepted as aliases, because that
 * is how the mega-dl README and most hosting panels name them.
 */

'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const num = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : d;
};

const BIN = () => process.env.YTDLP_BIN || 'yt-dlp';
const MAX_DOWNLOAD_MB = () => num(process.env.MAX_DOWNLOAD_MB, 100);
const MAX_HEIGHT = () => num(process.env.YTDLP_MAX_HEIGHT, 720);
const MAX_CONCURRENT = () => num(process.env.DL_MAX_CONCURRENT, 2);
const TIMEOUT_MS = () => num(process.env.DL_TIMEOUT_SECONDS, 180) * 1000;

// The bot and the downloader service have to agree on the variable names.
// Both spellings are read, so a panel set up from the mega-dl README works.
const API_URL = () => process.env.DL_API_URL || process.env.DOWNLOAD_API_URL || '';
const API_SECRET = () => process.env.DL_API_SECRET || process.env.DOWNLOAD_API_SECRET || '';
// A remote service may legitimately take longer than a local yt-dlp run.
const API_TIMEOUT_MS = () => num(process.env.DL_API_TIMEOUT_SECONDS, 330) * 1000;

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
        const b64 = process.env.YTDLP_COOKIES_B64 || process.env.COOKIES_B64;
        const file = process.env.YTDLP_COOKIES_FILE || process.env.COOKIES_FILE;
        // A cookies.txt sitting next to the project is picked up automatically.
        const local = path.join(__dirname, '..', 'cookies.txt');

        if (b64) {
            fs.writeFileSync(target, Buffer.from(b64, 'base64'), { mode: 0o600 });
            cookiesPath = target;
        } else if (file && fs.existsSync(file)) {
            fs.copyFileSync(file, target);
            fs.chmodSync(target, 0o600);
            cookiesPath = target;
        } else if (fs.existsSync(local)) {
            fs.copyFileSync(local, target);
            fs.chmodSync(target, 0o600);
            cookiesPath = target;
        }
    } catch (err) {
        console.error('⚠️  Could not prepare yt-dlp cookies:', err.message);
    }
    return cookiesPath;
}

// ---------------------------------------------------------------- media files

// WhatsApp refuses fragmented MP4 (the moof/CMAF layout YouTube DASH streams
// use) and shows them as "video not available".
function inspectMp4(file) {
    const info = { fragmented: false, hasMoov: false, faststart: false };
    let fd;
    try {
        fd = fs.openSync(file, 'r');
        const size = fs.fstatSync(fd).size;
        const header = Buffer.alloc(8);
        let offset = 0;
        let sawMdat = false;
        while (offset < size && offset < 8 * 1024 * 1024) {
            if (fs.readSync(fd, header, 0, 8, offset) < 8) break;
            let boxSize = header.readUInt32BE(0);
            const type = header.toString('latin1', 4, 8);
            let headerSize = 8;
            if (boxSize === 1) {
                const big = Buffer.alloc(8);
                if (fs.readSync(fd, big, 0, 8, offset + 8) < 8) break;
                boxSize = Number(big.readBigUInt64BE(0));
                headerSize = 16;
            } else if (boxSize === 0) {
                boxSize = size - offset;
            }
            if (!boxSize || boxSize < headerSize) break;
            if (type === 'moov') { info.hasMoov = true; info.faststart = !sawMdat; }
            if (type === 'mdat') sawMdat = true;
            if (type === 'moof' || type === 'styp' || type === 'sidx') info.fragmented = true;
            if (info.hasMoov && sawMdat) break;
            offset += boxSize;
        }
    } catch {
        return { fragmented: false, hasMoov: false, faststart: false };
    } finally {
        try { if (fd !== undefined) fs.closeSync(fd); } catch { /* ignore */ }
    }
    return info;
}

function hasFfmpeg() {
    try {
        const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', timeout: 15_000 });
        return r.status === 0;
    } catch {
        return false;
    }
}

let ffmpegChecked = false;
let ffmpegPresent = false;
function ffmpegAvailable() {
    if (!ffmpegChecked) {
        ffmpegPresent = hasFfmpeg();
        ffmpegChecked = true;
    }
    return ffmpegPresent;
}

// Rewrite a fragmented file into a normal progressive MP4.
function remuxMp4(file) {
    return new Promise((resolve) => {
        if (!ffmpegAvailable()) return resolve(false);
        const out = file + '.fixed.mp4';
        let child;
        try {
            child = spawn('ffmpeg', ['-y', '-i', file, '-c', 'copy', '-movflags', '+faststart', out], {
                windowsHide: true,
                stdio: 'ignore'
            });
        } catch {
            return resolve(false);
        }
        child.on('error', () => resolve(false));
        child.on('close', (code) => {
            try {
                if (code === 0 && fs.existsSync(out)) {
                    fs.renameSync(out, file);
                    return resolve(true);
                }
            } catch { /* ignore */ }
            try { if (fs.existsSync(out)) fs.unlinkSync(out); } catch { /* ignore */ }
            resolve(false);
        });
    });
}

// A downloaded MP4 has to be progressive before WhatsApp will play it.
async function ensurePlayable(file) {
    if (path.extname(file).toLowerCase() !== '.mp4') return { ok: true };
    const info = inspectMp4(file);
    if (!info.fragmented && info.hasMoov && info.faststart) return { ok: true };
    await remuxMp4(file);
    const after = inspectMp4(file);
    if (after.fragmented || !after.hasMoov) {
        return { ok: false, reason: 'The downloaded file is a fragmented MP4 that WhatsApp cannot play.' };
    }
    return { ok: true };
}

// ---------------------------------------------------------------- search (no yt-dlp needed)

async function ytSearch(query, limit = 5) {
    let yts;
    try { yts = require('yt-search'); } catch { return null; }
    try {
        const r = await yts(String(query).trim());
        const videos = (r.videos || []).slice(0, limit);
        return videos.map((v) => ({
            id: v.videoId,
            title: v.title || 'Untitled',
            duration: v.timestamp || '',
            seconds: v.seconds || 0,
            channel: v.author?.name || '',
            url: v.url || `https://www.youtube.com/watch?v=${v.videoId}`
        }));
    } catch (err) {
        console.error('yt-search failed:', err.message);
        return null;
    }
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
        '--retries', '2'
    ];
    if (process.env.YTDLP_JS_RUNTIME) args.push('--js-runtimes', process.env.YTDLP_JS_RUNTIME);
    const cookies = getCookies();
    if (cookies) args.push('--cookies', cookies);
    if (process.env.YTDLP_EXTRA_ARGS) args.push(...process.env.YTDLP_EXTRA_ARGS.split(/\s+/).filter(Boolean));
    return args;
}

// The delivered file is the sum of the video and the audio stream, so the size
// budget is split between them. yt-dlp falls through the "/" chain when a
// branch matches nothing.
function videoFormatArgs() {
    const total = Math.max(1, Math.round(MAX_DOWNLOAD_MB()));
    const vid = Math.max(1, Math.round(MAX_DOWNLOAD_MB() * 0.62));
    const aud = Math.max(1, MAX_DOWNLOAD_MB() - Math.round(MAX_DOWNLOAD_MB() * 0.62));
    if (!ffmpegAvailable()) {
        // Without ffmpeg nothing can be merged, so only single-file formats work.
        return ['-f', `b[ext=mp4][filesize<${total}M]/b[filesize<${total}M]/b`];
    }
    return [
        '-f', `bv*[vcodec^=avc1][filesize<${vid}M]+ba[acodec^=mp4a][filesize<${aud}M]`
            + `/bv*[vcodec^=avc1][filesize<${vid}M]+ba[acodec^=mp4a]`
            + `/bv*[vcodec^=avc1][filesize<${vid}M]+ba[ext=m4a]`
            + `/b[filesize<${total}M]/b`,
        '--merge-output-format', 'mp4',
        '-S', `res:${MAX_HEIGHT()}`
    ];
}

// yt-dlp spawns ffmpeg as a child, so killing only the direct child leaves the
// download running in the background and eating disk.
function killTree(child) {
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else {
            try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        }
    } catch { /* ignore */ }
}

function runYtdlp(args, timeoutMs = TIMEOUT_MS()) {
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = spawn(BIN(), args, {
                windowsHide: true,
                detached: process.platform !== 'win32'
            });
        } catch (err) {
            return reject(err);
        }
        let stdout = '';
        let stderr = '';
        let settled = false;
        const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
        child.stdout?.on('data', (d) => { stdout += d; });
        child.stderr?.on('data', (d) => { stderr += d; });
        const timer = setTimeout(() => {
            killTree(child);
            const err = new Error('yt-dlp timed out');
            err.killed = true;
            err.stdout = stdout;
            err.stderr = stderr;
            done(reject, err);
        }, timeoutMs);
        child.on('error', (err) => {
            err.stdout = stdout;
            err.stderr = stderr;
            done(reject, err);
        });
        child.on('close', (code) => {
            if (code !== 0) {
                const err = new Error(`yt-dlp exited with code ${code}`);
                err.exitCode = code;
                err.stdout = stdout;
                err.stderr = stderr;
                return done(reject, err);
            }
            done(resolve, { stdout, stderr });
        });
    });
}

function mapError(err) {
    const text = `${err.stderr || ''}\n${err.message || ''}`;

    if (err.code === 'ENOENT') {
        return new DownloadError('yt-dlp is not installed on this server, and DL_API_URL is not set. Put DL_API_URL and DL_API_SECRET in set.js.', text);
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
    if (/larger than max-filesize|file is larger|requested format is not available/i.test(text)) {
        return new DownloadError(`❌ That file is bigger than ${MAX_DOWNLOAD_MB()} MB.`, text);
    }
    if (/http error 429|too many requests|rate.?limit/i.test(text)) {
        return new DownloadError('⚠️ The site is rate-limiting the server. Try again in a few minutes.', text);
    }
    return new DownloadError('❌ Download failed. Check the link and try again.', text);
}

/**
 * Download media for a URL or a search phrase.
 * kind: 'audio' (mp3) | 'video' (mp4)
 * Returns { file, size, title, duration, uploader, url, kind, mimetype, cleanup }.
 * The caller MUST call cleanup() when finished sending the file.
 */

// Appends the real failure detail to the chat reply (the bot is owner-only, so
// this is safe). Turn off with DL_DEBUG=false once downloads are stable.
function withDebug(error, label, detail) {
    if (process.env.DL_DEBUG === 'false') return error;
    const text = String(detail || '').replace(/\s+/g, ' ').slice(0, 300);
    if (text) error.userMessage += `\n\n_[${label}] ${text}_`;
    return error;
}

async function downloadRemote(kind, input) {
    const base = String(API_URL()).replace(/\/+$/, '');
    if (!base) throw new DownloadError('❌ The downloader service is not configured.', '');
    let found = null;
    let target;
    if (isUrl(input)) {
        target = input.trim();
    } else {
        const results = await ytSearch(input, 5);
        // Prefer the first result under 20 minutes (avoids hour-long mixes/streams).
        found = results && (results.find((r) => r.seconds > 0 && r.seconds <= 20 * 60) || results[0]);
        if (!found) throw new DownloadError('❌ No results found for that search.', '');
        target = found.url;
    }
    const secret = API_SECRET();

    ensureTmp();
    const dir = path.join(TMP_ROOT, crypto.randomBytes(6).toString('hex'));
    fs.mkdirSync(dir, { recursive: true });
    const cleanup = () => {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    };

    try {
        const post = (body) => axios.post(`${base}/download`, body, {
            timeout: API_TIMEOUT_MS(),
            headers: { 'Content-Type': 'application/json' }
        });

        let data;
        try {
            try {
                ({ data } = await post({ url: target, secret, kind }));
            } catch (err) {
                // If the service rejects the extra "kind" field, retry with just url+secret.
                if ([400, 422].includes(err.response?.status)) ({ data } = await post({ url: target, secret }));
                else throw err;
            }
        } catch (err) {
            const status = err.response?.status;
            const detail = JSON.stringify(err.response?.data || err.message).slice(0, 500);
            if (status === 401 || status === 403) throw withDebug(new DownloadError('🔒 The downloader service rejected the secret. Check DL_API_SECRET.', detail), `HTTP ${status}`, detail);
            if (err.code === 'ECONNABORTED') throw withDebug(new DownloadError('⏱️ That took too long and was cancelled. Try a shorter video.', detail), 'timeout', detail);
            const mapped = mapError({ stderr: detail, message: err.message });
            throw withDebug(mapped, `request ${status || err.code || 'error'}`, detail);
        }

        if (!data?.media) throw new DownloadError('❌ Download failed. Check the link and try again.', JSON.stringify(data).slice(0, 500));

        const mediaUrl = /^https?:/i.test(data.media) ? data.media : `${base}${data.media.startsWith('/') ? '' : '/'}${data.media}`;
        const ext = (path.extname(String(data.filename || '')) || path.extname(new URL(mediaUrl).pathname) || '.bin');
        const file = path.join(dir, `media${ext}`);

        try {
            const resp = await axios.get(mediaUrl, { responseType: 'stream', timeout: API_TIMEOUT_MS() });
            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(file);
                resp.data.pipe(out);
                out.on('finish', resolve);
                out.on('error', reject);
                resp.data.on('error', reject);
            });
        } catch (err) {
            const why = `${err.response?.status ? 'HTTP ' + err.response.status + ' ' : ''}${err.code || ''} ${err.message}`;
            throw withDebug(new DownloadError('❌ Couldn’t fetch the file from the downloader service.', why), 'file fetch', why);
        }

        const size = fs.statSync(file).size;
        if (!size) throw new DownloadError('❌ Couldn’t get that file — it may be unavailable.', '');
        if (size > MAX_DOWNLOAD_MB() * 1024 * 1024) {
            throw new DownloadError(`❌ That file is bigger than ${MAX_DOWNLOAD_MB()} MB.`, '');
        }

        const playable = await ensurePlayable(file);
        if (!playable.ok) throw new DownloadError(`❌ ${playable.reason}`, '');

        const serviceKind = String(data.kind || '').toLowerCase();
        const mimetype = data.mimetype || (serviceKind === 'image' ? 'image/jpeg' : 'video/mp4');

        return {
            file,
            size,
            title: data.title && data.title !== 'media' ? data.title : (found?.title || 'Download'),
            duration: Number(data.duration) || found?.seconds || 0,
            uploader: data.uploader || found?.channel || '',
            url: found?.url || (isUrl(input) ? input.trim() : ''),
            kind: serviceKind || (kind === 'audio' ? 'audio' : 'video'),
            mimetype,
            cleanup
        };
    } catch (err) {
        cleanup();
        throw err;
    }
}

async function download(kind, input) {
    if (API_URL()) return downloadRemote(kind, input);
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
            '--print', 'after_move:%(title)s|||%(duration)s|||%(uploader)s|||%(webpage_url)s|||%(filepath)s'
        ];

        if (kind === 'audio') {
            args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '5');
        } else {
            args.push(...videoFormatArgs());
        }
        args.push(target);

        let out;
        try {
            out = await runYtdlp(args);
        } catch (err) {
            throw mapError(err);
        }

        const lastLine = out.stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
        const parts = lastLine.split('|||');
        const [title, duration, uploader, url] = parts;
        // yt-dlp reports which file it moved into place — that is the merged
        // video, not one of the separate audio/video parts.
        const reported = parts[4] ? path.basename(parts[4].trim()) : '';

        const files = fs.readdirSync(dir)
            .filter((f) => !/\.(part|ytdl|json|txt|temp|fixed\.mp4)$/i.test(f))
            .map((f) => ({ f, size: fs.statSync(path.join(dir, f)).size }))
            .filter((f) => f.size > 0);

        const chosen = (reported && files.find((f) => f.f === reported))
            || files.sort((a, b) => b.size - a.size)[0];

        if (!chosen) {
            throw new DownloadError(
                `❌ Couldn’t get that file — it may be bigger than ${MAX_DOWNLOAD_MB()} MB or unavailable.`,
                out.stderr
            );
        }

        const file = path.join(dir, chosen.f);
        const playable = await ensurePlayable(file);
        if (!playable.ok) throw new DownloadError(`❌ ${playable.reason}`, out.stderr);

        return {
            file,
            size: fs.statSync(file).size,
            title: title && title !== 'NA' ? title : 'Download',
            duration: Number(duration) || 0,
            uploader: uploader && uploader !== 'NA' ? uploader : '',
            url: url && url !== 'NA' ? url : (isUrl(input) ? input.trim() : ''),
            kind: kind === 'audio' ? 'audio' : 'video',
            mimetype: kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
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
    if (API_URL()) {
        const results = await ytSearch(query, limit);
        if (!results) throw new DownloadError('❌ Search is unavailable right now.', '');
        return results;
    }
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

console.log(
    `[downloader v2] mode: ${API_URL() ? 'REMOTE -> ' + API_URL() : 'LOCAL yt-dlp (DL_API_URL NOT SET)'}` +
    ` | secret: ${API_SECRET() ? 'set' : 'MISSING'}` +
    ` | ffmpeg: ${ffmpegAvailable() ? 'yes' : 'no'}`
);

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
