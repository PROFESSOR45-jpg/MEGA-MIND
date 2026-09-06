/**
 * StatusReact — optionally auto-views and/or auto-reacts to contacts'
 * WhatsApp status updates.
 */

const config = require('../config');

class StatusReactor {
    constructor(sock) {
        this.sock = sock;
        this.processed = new Set();
    }

    async handle(m) {
        if (!config.STATUS_REACT && !config.STATUS_VIEW) return;
        if (!m?.key || m.key.remoteJid !== 'status@broadcast') return;

        const statusId = m.key.id;
        if (this.processed.has(statusId)) return;
        this.processed.add(statusId);
        // Keep the set from growing forever across a long-running process.
        if (this.processed.size > 2000) {
            const first = this.processed.values().next().value;
            this.processed.delete(first);
        }

        if (config.STATUS_VIEW) {
            try {
                await this.sock.readMessages([m.key]);
            } catch (err) {
                console.error('Status view error:', err.message);
            }
        }

        if (config.STATUS_REACT) {
            const emojis = config.STATUS_REACTION_EMOJIS;
            const emoji = emojis[Math.floor(Math.random() * emojis.length)];
            try {
                await this.sock.sendMessage('status@broadcast', {
                    react: { text: emoji, key: m.key }
                });
            } catch (err) {
                console.error('Status react error:', err.message);
            }
        }
    }
}

module.exports = StatusReactor;
