/**
 * Command Status Reactions Handler
 * Shows processing states via emoji reactions
 */

class CommandReactor {
  constructor(sock, config) {
    this.sock = sock;
    this.config = config;
    this.cooldowns = new Map();
    
    this.reactions = {
      'PROCESSING': '⏳',
      'SUCCESS': '✅',
      'ERROR': '❌',
      'BANNED': '🚫',
      'NO_PERMISSION': '🔒',
      'OWNER_ONLY': '👑',
      'ADMIN_ONLY': '👮',
      'GROUP_ONLY': '👥',
      'DISABLED': '🚧',
      'COOLDOWN': '⏱️'
    };
  }

  async react(message, status) {
    if (!this.config?.COMMAND_STATUS_REACT) return;
    
    const emoji = this.reactions[status] || '⚡';
    
    try {
      await this.sock.sendMessage(message.key.remoteJid, {
        react: {
          text: emoji,
          key: message.key
        }
      });
    } catch (err) {
      // Silent fail - don't break command execution for reactions
      console.debug(`Reaction failed (${status}):`, err.message);
    }
  }
}

module.exports = CommandReactor;
