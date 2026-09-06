/**
 * MegaHandler — shared helper methods used across command modules:
 * sending replies/media, group admin actions, permission checks, etc.
 */

const fs = require('fs');
const db = require('./database');

class MegaHandler {
    constructor(sock, config) {
        this.sock = sock;
        this.config = config;
        this.startTime = Date.now();
        this._botImage = null; // cached resolved image (buffer or url string)
    }

    /**
     * Resolve the bot's branding image: prefers the local assets/profile.png
     * file, falls back to BOT_IMAGE_URL if the local file is missing.
     * Returns a Buffer, a URL string, or null if no image is available.
     */
    getBotImage() {
        if (this._botImage !== null) return this._botImage;

        try {
            if (this.config.BOT_IMAGE && fs.existsSync(this.config.BOT_IMAGE)) {
                this._botImage = fs.readFileSync(this.config.BOT_IMAGE);
                return this._botImage;
            }
        } catch {
            // fall through to URL fallback
        }

        if (this.config.BOT_IMAGE_URL) {
            this._botImage = this.config.BOT_IMAGE_URL;
            return this._botImage;
        }

        console.log(
            '\x1b[33m⚠️  No bot image found — assets/profile.png is missing and BOT_IMAGE_URL is unset.\x1b[0m\n' +
            '\x1b[33m   .menu / .repo / the startup message will be sent as plain text instead of an image card.\x1b[0m\n' +
            '\x1b[33m   Make sure assets/profile.png is committed to your repo, or set BOT_IMAGE_URL in .env.\x1b[0m'
        );
        this._botImage = undefined; // explicit "no image" sentinel (not null, so cache sticks)
        return this._botImage;
    }

    /**
     * Send a branded card: the bot image with a styled caption, falling
     * back to plain text automatically if no image is configured.
     */
    async sendBranded(jid, caption, quoted = null) {
        const image = this.getBotImage();
        if (!image) {
            return this.sendText(jid, caption, quoted);
        }
        return this.sendImage(jid, image, caption, quoted);
    }

    // ---- Sending ----
    async sendText(jid, text, quoted = null) {
        return this.sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
    }

    async reply(m, text) {
        return this.sendText(m.key.remoteJid, text, m);
    }

    async sendImage(jid, image, caption = '', quoted = null) {
        return this.sock.sendMessage(
            jid,
            { image: Buffer.isBuffer(image) ? image : { url: image }, caption },
            quoted ? { quoted } : {}
        );
    }

    async sendSticker(jid, sticker, quoted = null) {
        return this.sock.sendMessage(
            jid,
            { sticker: Buffer.isBuffer(sticker) ? sticker : { url: sticker } },
            quoted ? { quoted } : {}
        );
    }

    // ---- Group admin actions ----
    async kick(jid, participant) {
        try {
            await this.sock.groupParticipantsUpdate(jid, [participant], 'remove');
            return true;
        } catch {
            return false;
        }
    }

    async add(jid, participant) {
        try {
            await this.sock.groupParticipantsUpdate(jid, [participant], 'add');
            return true;
        } catch {
            return false;
        }
    }

    async promote(jid, participant) {
        try {
            await this.sock.groupParticipantsUpdate(jid, [participant], 'promote');
            return true;
        } catch {
            return false;
        }
    }

    async demote(jid, participant) {
        try {
            await this.sock.groupParticipantsUpdate(jid, [participant], 'demote');
            return true;
        } catch {
            return false;
        }
    }

    async muteGroup(jid) {
        try {
            await this.sock.groupSettingUpdate(jid, 'announcement');
            return true;
        } catch {
            return false;
        }
    }

    async unmuteGroup(jid) {
        try {
            await this.sock.groupSettingUpdate(jid, 'not_announcement');
            return true;
        } catch {
            return false;
        }
    }

    async getGroupMetadata(jid) {
        return this.sock.groupMetadata(jid);
    }

    async isAdmin(jid, participant) {
        try {
            const meta = await this.getGroupMetadata(jid);
            return meta.participants.some((p) => p.id === participant && p.admin);
        } catch {
            return false;
        }
    }

    async isBotAdmin(jid) {
        const botId = this.sock.user.id.replace(/:\d+/, '');
        return this.isAdmin(jid, botId);
    }

    // ---- Permissions ----
    isOwner(jidOrNumber) {
        // Strip domain (@s.whatsapp.net / @lid / @g.us) and any companion
        // device suffix (":46") BEFORE stripping non-digits. Doing digit-only
        // stripping first (the old approach) folds the device id's digits
        // into the number — e.g. "254112658916:46@..." became
        // "25411265891646" instead of "254112658916", so the bot's own
        // linked-device JID (which always carries a device suffix) never
        // matched OWNER_NUMBER.
        const num = jidOrNumber.split('@')[0].split(':')[0].replace(/\D/g, '');
        return num === this.config.OWNER_NUMBER;
    }

    /**
     * Resolve what level of access a sender has, honoring bot MODE and bans.
     * Returns { allowed, level } where level is one of: 'owner' | 'admin' | 'user'.
     */
    async checkAccess(m, isGroup) {
        const sender = m.key.participant || m.key.remoteJid;
        const isOwner = this.isOwner(sender);

        if (this.config.DEBUG) {
            console.log(`\x1b[36m🐛 checkAccess — sender: ${sender} | isOwner: ${isOwner} | OWNER_NUMBER: ${this.config.OWNER_NUMBER} | MODE: ${this.config.MODE}\x1b[0m`);
        }

        if (db.isBannedUser(sender)) {
            return { allowed: false, level: 'banned' };
        }
        if (this.config.MODE === 'self' && !isOwner) {
            if (this.config.DEBUG) console.log('\x1b[33m🐛 Blocked — MODE is "self" and sender is not owner\x1b[0m');
            return { allowed: false, level: 'none' };
        }
        if (this.config.MODE === 'private' && !isOwner) {
            if (this.config.DEBUG) console.log('\x1b[33m🐛 Blocked — MODE is "private" and sender is not owner\x1b[0m');
            return { allowed: false, level: 'none' };
        }

        if (isOwner) return { allowed: true, level: 'owner' };
        if (isGroup) {
            const admin = await this.isAdmin(m.key.remoteJid, sender);
            return { allowed: true, level: admin ? 'admin' : 'user' };
        }
        return { allowed: true, level: 'user' };
    }

    // ---- Misc utilities ----
    getUptime() {
        const seconds = Math.floor((Date.now() - this.startTime) / 1000);
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }

    formatBytes(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    async downloadMedia(m) {
        const type = Object.keys(m.message)[0];
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
        if (!mediaTypes.includes(type)) return null;

        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(m.message[type], type.replace('Message', ''));
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return {
            buffer,
            mimetype: m.message[type].mimetype,
            filename: m.message[type].fileName || 'file'
        };
    }
}

module.exports = MegaHandler;
