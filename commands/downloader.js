/**
 * Downloader commands — powered by yt-dlp (see lib/downloader.js).
 *
 *   .play / .song / .mp3   audio from a YouTube search or any link
 *   .video / .mp4          video from a YouTube search or any link
 *   .yts                   show top YouTube results
 *   .tiktok .instagram .facebook .twitter   video from that platform
 *   .dl                    video from any supported link
 *   .ytdlpupdate           (owner) update the yt-dlp binary
 */

const dl = require('../lib/downloader');

const INLINE_MB = () => parseInt(process.env.SEND_INLINE_MB, 10) || 45;

function fmtDuration(sec) {
    if (!sec) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function quotedText(quoted) {
    const msg = quoted?.message || {};
    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        ''
    );
}

/** Text typed after the command, or (if empty) the text of the replied-to message. */
function getInput({ argsText, quoted }) {
    const typed = (argsText || '').trim();
    if (typed) return typed;
    return quotedText(quoted).trim();
}

function cleanFileName(title, ext) {
    const base = String(title).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'download';
    return `${base}.${ext}`;
}

async function deliver({ mega, m, jid, config }, kind, res) {
    const mb = res.size / (1024 * 1024);
    const dur = fmtDuration(res.duration);
    const info = [res.uploader, dur].filter(Boolean).join(' • ');

    if (kind === 'audio') {
        await mega.reply(m, `🎵 *${res.title}*${info ? `\n${info}` : ''}`);
        if (mb <= INLINE_MB()) {
            await mega.sendAudio(jid, res.file, m);
        } else {
            await mega.sendDocument(jid, res.file, cleanFileName(res.title, 'mp3'), 'audio/mpeg', '', m);
        }
        return;
    }

    const caption = `🎬 *${res.title}*${info ? `\n${info}` : ''}\n\n_${config.BOT_NAME}_`;
    if (mb <= INLINE_MB()) {
        await mega.sendVideo(jid, res.file, caption, m);
    } else {
        await mega.sendDocument(jid, res.file, cleanFileName(res.title, 'mp4'), 'video/mp4', caption, m);
    }
}

async function runDownload(ctx, kind, input) {
    const { mega, m } = ctx;
    let res;
    try {
        res = await dl.download(kind, input);
    } catch (err) {
        if (err instanceof dl.DownloadError) {
            console.error('Download failed:', (err.detail || err.message).slice(0, 500));
            await mega.reply(m, err.userMessage);
            return;
        }
        throw err;
    }
    try {
        await deliver(ctx, kind, res);
    } finally {
        res.cleanup();
    }
}

function mediaCommand({ name, aliases, kind, description, usage }) {
    return {
        name,
        aliases,
        category: 'downloader',
        description,
        cooldown: 10,
        handler: async (ctx) => {
            const input = getInput(ctx);
            if (!input) {
                await ctx.mega.reply(ctx.m, `Usage: *${ctx.config.PREFIX}${name} ${usage}*`);
                return;
            }
            if (!dl.isUrl(input)) await ctx.mega.reply(ctx.m, `🔎 Searching for *${input.slice(0, 80)}*…`);
            else await ctx.mega.reply(ctx.m, '⏳ Downloading…');
            await runDownload(ctx, kind, input);
        }
    };
}

const PLATFORMS = [
    { name: 'tiktok',    aliases: ['tt'],           label: 'TikTok',    re: /(tiktok\.com|vm\.tiktok|vt\.tiktok)/i },
    { name: 'instagram', aliases: ['ig', 'insta'],  label: 'Instagram', re: /(instagram\.com|instagr\.am)/i },
    { name: 'facebook',  aliases: ['fb'],           label: 'Facebook',  re: /(facebook\.com|fb\.watch|fb\.com)/i },
    { name: 'twitter',   aliases: ['x', 'tw'],      label: 'X / Twitter', re: /(twitter\.com|x\.com|t\.co)/i }
];

function platformCommand(p) {
    return {
        name: p.name,
        aliases: p.aliases,
        category: 'downloader',
        description: `Download a ${p.label} video: .${p.name} <link>`,
        cooldown: 10,
        handler: async (ctx) => {
            const url = dl.extractUrl(getInput(ctx));
            if (!url) {
                await ctx.mega.reply(ctx.m, `Usage: *${ctx.config.PREFIX}${p.name} <${p.label} link>*  (or reply to a message containing the link)`);
                return;
            }
            if (!p.re.test(url)) {
                await ctx.mega.reply(ctx.m, `That doesn’t look like a ${p.label} link.`);
                return;
            }
            await ctx.mega.reply(ctx.m, '⏳ Downloading…');
            await runDownload(ctx, 'video', url);
        }
    };
}

module.exports = [
    mediaCommand({
        name: 'play',
        aliases: ['song', 'mp3', 'ytmp3'],
        kind: 'audio',
        description: 'Get a song as audio: .play <name or link>',
        usage: '<song name or link>'
    }),
    mediaCommand({
        name: 'video',
        aliases: ['mp4', 'ytmp4'],
        kind: 'video',
        description: 'Get a video: .video <name or link>',
        usage: '<video name or link>'
    }),
    {
        name: 'yts',
        aliases: ['ytsearch'],
        category: 'downloader',
        description: 'Search YouTube: .yts <query>',
        cooldown: 5,
        handler: async (ctx) => {
            const { mega, m, config } = ctx;
            const query = getInput(ctx);
            if (!query) {
                await mega.reply(m, `Usage: *${config.PREFIX}yts <search words>*`);
                return;
            }
            let results;
            try {
                results = await dl.search(query, 5);
            } catch (err) {
                if (err instanceof dl.DownloadError) {
                    await mega.reply(m, err.userMessage);
                    return;
                }
                throw err;
            }
            if (!results.length) {
                await mega.reply(m, 'No results found.');
                return;
            }
            const lines = results.map(
                (r, i) => `*${i + 1}.* ${r.title}\n   ${[r.channel, r.duration].filter(Boolean).join(' • ')}\n   ${r.url}`
            );
            await mega.reply(
                m,
                `🔎 *Results for:* ${query}\n\n${lines.join('\n\n')}\n\n` +
                `_Send a link with ${config.PREFIX}play or ${config.PREFIX}video to download._`
            );
        }
    },
    ...PLATFORMS.map(platformCommand),
    {
        name: 'dl',
        aliases: ['download', 'getvideo'],
        category: 'downloader',
        description: 'Download a video from any supported link: .dl <link>',
        cooldown: 10,
        handler: async (ctx) => {
            const url = dl.extractUrl(getInput(ctx));
            if (!url) {
                await ctx.mega.reply(ctx.m, `Usage: *${ctx.config.PREFIX}dl <link>*  (or reply to a message containing the link)`);
                return;
            }
            await ctx.mega.reply(ctx.m, '⏳ Downloading…');
            await runDownload(ctx, 'video', url);
        }
    },
    {
        name: 'ytdlpupdate',
        aliases: ['updatedl'],
        category: 'owner',
        description: 'Owner: update the yt-dlp downloader engine',
        ownerOnly: true,
        cooldown: 0,
        handler: async ({ mega, m }) => {
            let before = '?';
            try { before = await dl.version(); } catch { /* ignore */ }
            let out;
            try {
                out = await dl.updateYtdlp();
            } catch (err) {
                if (err instanceof dl.DownloadError) {
                    await mega.reply(m, err.userMessage);
                    return;
                }
                throw err;
            }
            let after = '?';
            try { after = await dl.version(); } catch { /* ignore */ }
            await mega.reply(m, `🔧 yt-dlp: ${before} ➜ ${after}\n\n${out.slice(0, 400)}`);
        }
    }
];
