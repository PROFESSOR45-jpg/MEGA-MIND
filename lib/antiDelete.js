/**
 * AntiDelete — keeps a short-lived cache of recent group messages so that
 * if someone deletes a message "for everyone", the bot can resend its
 * content (per-group toggle, off by default — this changes group dynamics
 * and should be an explicit choice, not a default).
 */

const db = require('./database');

const CACHE_LIMIT = 500; // messages per process; old entries are evicted FIFO
const CACHE_TTL_MS = 15 * 60 * 1000; // don't bother resending anything older than this

class AntiDelete {
    constructor(sock) {
        this.sock = sock;
        this.cache = new Map(); // messageId -> { jid, sender, text, timestamp }
    }

    remember(parsed) {
        const { isGroup, jid, raw: m, sender, text } = parsed;
        if (!isGroup) return;
        if (!text) return; // only plain text bodies are reconstructable here

        const group = db.getGroup(jid);
        if (!group.antidelete) return;

        this.cache.set(m.key.id, { jid, sender, text, timestamp: Date.now() });
        if (this.cache.size > CACHE_LIMIT) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Call this from messages.update when a protocol "revoke" message
     * comes through. `m` is the revoke notification itself.
     */
    async handleRevoke(m) {
        const revokedKey = m.message?.protocolMessage?.key;
        if (!revokedKey) return;

        const cached = this.cache.get(revokedKey.id);
        if (!cached) return;
        if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
            this.cache.delete(revokedKey.id);
            return;
        }

        try {
            await this.sock.sendMessage(cached.jid, {
                text: `🗑️ *Deleted message recovered*\n👤 @${cached.sender.split('@')[0]}:\n\n${cached.text}`,
                mentions: [cached.sender]
            });
        } catch (err) {
            console.error('AntiDelete resend failed:', err.message);
        }

        this.cache.delete(revokedKey.id);
    }
}

module.exports = AntiDelete;
