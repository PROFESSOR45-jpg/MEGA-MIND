/**
 * Media commands — sticker conversion tools.
 * Uses wa-sticker-formatter (a standard, widely-used library for this)
 * under the hood so we don't hand-roll WebP/EXIF sticker metadata.
 */

const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { unwrapViewOnce, isViewOnce } = require('../lib/messageParser');

const MEDIA_KEYS = ['imageMessage', 'videoMessage', 'audioMessage'];

module.exports = [
    {
        name: 'sticker',
        aliases: ['s', 'stiker'],
        category: 'media',
        description: 'Convert an image/video (or reply to one) into a sticker',
        cooldown: 5,
        handler: async ({ mega, m, quoted, sock, jid, config }) => {
            const media = quoted
                ? await mega.downloadMedia(quoted)
                : await mega.downloadMedia(m);

            if (!media) {
                await mega.reply(m, 'Send or reply to an image/short video with *.sticker*');
                return;
            }

            const sticker = new Sticker(media.buffer, {
                pack: config.BOT_NAME,
                author: config.OWNER_NAME,
                type: StickerTypes.FULL,
                quality: 70
            });

            const buffer = await sticker.toBuffer();
            await mega.sendSticker(jid, buffer, m);
        }
    },
    {
        name: 'toimg',
        aliases: ['toimage'],
        category: 'media',
        description: 'Convert a sticker (reply to one) into an image',
        cooldown: 5,
        handler: async ({ mega, m, quoted, jid }) => {
            if (!quoted?.message?.stickerMessage) {
                await mega.reply(m, 'Reply to a sticker with *.toimg*');
                return;
            }
            const media = await mega.downloadMedia(quoted);
            await mega.sendImage(jid, media.buffer, '', m);
        }
    },
    {
        name: 'take',
        category: 'media',
        description: 'Re-pack a sticker with a new pack/author name: .take Pack | Author',
        cooldown: 5,
        handler: async ({ mega, m, quoted, jid, argsText, config }) => {
            if (!quoted?.message?.stickerMessage) {
                await mega.reply(m, 'Reply to a sticker with *.take Pack Name | Author Name*');
                return;
            }
            const media = await mega.downloadMedia(quoted);
            const [pack, author] = argsText.split('|').map((s) => s?.trim());

            const sticker = new Sticker(media.buffer, {
                pack: pack || config.BOT_NAME,
                author: author || config.OWNER_NAME,
                type: StickerTypes.FULL,
                quality: 70
            });

            const buffer = await sticker.toBuffer();
            await mega.sendSticker(jid, buffer, m);
        }
    },
    {
        name: 'viewonce',
        aliases: ['vv', 'openonce'],
        category: 'media',
        description: 'Reply to view-once media to re-send it normally, or to normal media to send it as view-once',
        cooldown: 3,
        handler: async ({ mega, m, quoted, jid, sock }) => {
            if (!quoted?.message) {
                await mega.reply(
                    m,
                    'Reply to an image/video/audio with *.viewonce*:\n' +
                    '• view-once media → re-sent so it can be viewed normally\n' +
                    '• normal media → sent as view-once'
                );
                return;
            }

            const inner = unwrapViewOnce(quoted.message);
            const key = MEDIA_KEYS.find((k) => inner[k]);
            if (!key) {
                await mega.reply(m, 'That reply has no image, video or audio to work with.');
                return;
            }

            const type = key.replace('Message', '');
            const wasViewOnce = isViewOnce(quoted.message);

            let media;
            try {
                media = await mega.downloadMedia(quoted);
            } catch (err) {
                await mega.reply(m, `❌ Could not download that media: ${err.message}`);
                return;
            }
            if (!media?.buffer?.length) {
                await mega.reply(m, '❌ Could not download that media — it may have expired.');
                return;
            }

            const payload = { [type]: media.buffer, mimetype: media.mimetype };

            if (wasViewOnce) {
                if (inner[key].caption) payload.caption = inner[key].caption;
                await sock.sendMessage(jid, payload, { quoted: m });
                return;
            }

            payload.viewOnce = true;
            if (inner[key].caption && type !== 'audio') payload.caption = inner[key].caption;
            if (type === 'audio' && inner[key].ptt) payload.ptt = true;
            await sock.sendMessage(jid, payload, { quoted: m });
        }
    }
];
