/**
 * Media commands — sticker conversion tools.
 * Uses wa-sticker-formatter (a standard, widely-used library for this)
 * under the hood so we don't hand-roll WebP/EXIF sticker metadata.
 */

const { Sticker, StickerTypes } = require('wa-sticker-formatter');

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
    }
];
