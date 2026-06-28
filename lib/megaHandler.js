/**
 * MegaHandler — shared helper methods used across command modules:
 * sending replies/media, group admin actions, permission checks, etc.
 */

const db = require('./database');

class MegaHandler {
    constructor(sock, config) {
        this.sock = sock;
        this.config = config;
        this.startTime = Date.now();
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
        const num = jidOrNumber.replace(/\D/g, '');
        return num === this.config.OWNER_NUMBER;
    }

    /**
     * Resolve what level of access a sender has, honoring bot MODE and bans.
     * Returns { allowed, level } where level is one of: 'owner' | 'admin' | 'user'.
     */
    async checkAccess(m, isGroup) {
        const sender = m.key.participant || m.key.remoteJid;
        const isOwner = this.isOwner(sender);

        if (db.isBannedUser(sender)) {
            return { allowed: false, level: 'banned' };
        }
        if (this.config.MODE === 'self' && !isOwner) {
            return { allowed: false, level: 'none' };
        }
        if (this.config.MODE === 'private' && !isOwner) {
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
