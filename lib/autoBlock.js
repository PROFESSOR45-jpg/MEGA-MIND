/**
 * AutoBlock — when MODE is 'private', non-owner DMs get auto-blocked so the
 * bot stays usable only by its owner without manual moderation.
 * Has no effect when MODE is 'public' or 'self'.
 */

const config = require('../config');

class AutoBlock {
    constructor(sock) {
        this.sock = sock;
        this.allowedUsers = new Set();
    }

    async checkUser(userId) {
        if (!config.AUTOBLOCK) return false;
        if (config.MODE !== 'private') return false;

        const number = userId.split('@')[0];
        if (number === config.OWNER_NUMBER) return false;
        if (this.allowedUsers.has(userId)) return false;

        try {
            await this.sock.updateBlockStatus(userId, 'block');
            console.log(`🚫 Auto-blocked (private mode): ${number}`);
            return true;
        } catch (err) {
            console.error('AutoBlock failed:', err.message);
            return false;
        }
    }

    allow(userId) {
        this.allowedUsers.add(userId);
    }

    disallow(userId) {
        this.allowedUsers.delete(userId);
    }

    getStatus() {
        return {
            enabled: config.AUTOBLOCK,
            mode: config.MODE,
            allowedCount: this.allowedUsers.size
        };
    }
}

module.exports = AutoBlock;
