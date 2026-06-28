/**
 * CommandReactor — shows emoji reactions on the user's message to indicate
 * a command's processing state, instead of (or alongside) a text reply.
 */

const config = require('../config');

const REACTIONS = {
    PROCESSING: '⏳',
    SUCCESS: '✅',
    ERROR: '❌',
    BANNED: '🚫',
    NO_PERMISSION: '🔒',
    OWNER_ONLY: '👑',
    ADMIN_ONLY: '👮',
    GROUP_ONLY: '👥',
    COOLDOWN: '⏱️'
};

class CommandReactor {
    constructor(sock) {
        this.sock = sock;
    }

    async react(message, status) {
        if (!config.COMMAND_STATUS_REACT) return;
        const emoji = REACTIONS[status] || '⚡';

        try {
            await this.sock.sendMessage(message.key.remoteJid, {
                react: { text: emoji, key: message.key }
            });
        } catch (err) {
            // Reactions are cosmetic — never let a failure here break command execution.
        }
    }
}

module.exports = CommandReactor;
