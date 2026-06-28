/**
 * AntiBug — defensive filter for malformed/abusive incoming messages.
 *
 * This module only ever inspects and reacts to messages SENT TO the bot.
 * It has no methods for crafting or sending malformed payloads to anyone —
 * that capability was intentionally removed; this bot will not be used to
 * attack other WhatsApp users or clients.
 */

const config = require('../config');
const db = require('./database');

// Known classes of payload abuse used to crash/freeze WhatsApp clients.
const SUSPICIOUS_PATTERNS = [
    '\u0000', // null bytes
];

class AntiBug {
    constructor(sock) {
        this.sock = sock;
    }

    detect(message) {
        if (!config.ANTIBUG) return { isBug: false };

        const text = typeof message === 'string' ? message : JSON.stringify(message || '');

        if (text.length > config.BUG_MAX_LENGTH) {
            return { isBug: true, reason: 'Message exceeds safe length' };
        }

        for (const pattern of SUSPICIOUS_PATTERNS) {
            if (text.includes(pattern)) {
                return { isBug: true, reason: 'Contains disallowed control characters' };
            }
        }

        const combiningChars = text.match(/[\u0300-\u036f\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g);
        if (combiningChars && combiningChars.length > 200) {
            return { isBug: true, reason: 'Excessive combining/zalgo characters' };
        }

        const rareUnicode = text.match(/[\u{10000}-\u{10FFFF}]/gu);
        if (rareUnicode && rareUnicode.length > 300) {
            return { isBug: true, reason: 'Excessive rare Unicode characters' };
        }

        return { isBug: false };
    }

    /**
     * Inspect and, if needed, neutralize a single incoming message.
     * Returns true if the message was flagged (caller should usually stop
     * processing it further).
     */
    async handle(m) {
        if (!config.ANTIBUG) return false;
        if (!m?.message) return false;

        const type = Object.keys(m.message)[0];
        const body =
            m.message?.conversation ||
            m.message?.extendedTextMessage?.text ||
            m.message?.[type]?.caption ||
            '';

        const result = this.detect(body);
        if (!result.isBug) return false;

        const jid = m.key.remoteJid;
        const sender = m.key.participant || jid;

        console.log(`🛡️ AntiBug flagged message from ${sender}: ${result.reason}`);

        if (config.ANTIBUG_DELETE) {
            try {
                await this.sock.sendMessage(jid, { delete: m.key });
            } catch (err) {
                console.error('AntiBug: failed to delete flagged message:', err.message);
            }
        }

        if (config.ANTIBUG_BLOCK) {
            try {
                db.banUser(sender, result.reason);
                await this.sock.updateBlockStatus(sender, 'block');
                console.log(`🚫 AntiBug blocked: ${sender}`);
            } catch (err) {
                console.error('AntiBug: failed to block sender:', err.message);
            }
        }

        return true;
    }
}

module.exports = AntiBug;
