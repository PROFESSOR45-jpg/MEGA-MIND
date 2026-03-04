
/**
 * MEGA MIND - Command Status Reactor
 * Reacts to commands with status emojis
 */

class CommandReactor {
  constructor(sock, config) {
    this.sock = sock;
    this.config = config;
    this.cooldowns = new Map();
    this.lastReaction = new Map(); // Track last reaction per message
  }

  /**
   * React to a command with status emoji
   * @param {Object} m - Message object
   * @param {string} status - Status type from COMMAND_STATUS_EMOJIS
   */
  async react(m, status) {
    if (!this.config.COMMAND_STATUS_REACT) return;

    const emoji = this.config.COMMAND_STATUS_EMOJIS[status];
    if (!emoji) return;

    const messageKey = m.key.id;
    
    // Remove previous reaction if exists
    if (this.lastReaction.has(messageKey)) {
      try {
        await this.sock.sendMessage(m.key.remoteJid, {
          react: {
            text: '',
            key: m.key
          }
        });
      } catch {}
    }

    try {
      await this.sock.sendMessage(m.key.remoteJid, {
        react: {
          text: emoji,
          key: m.key
        }
      });
      
      this.lastReaction.set(messageKey, emoji);
      console.log(`⚡ Command status: ${status} ${emoji}`);
    } catch (err) {
      console.error('Command react error:', err.message);
    }
  }

  /**
   * React with custom emoji
   */
  async reactCustom(m, emoji) {
    try {
      await this.sock.sendMessage(m.key.remoteJid, {
        react: {
          text: emoji,
          key: m.key
        }
      });
    } catch {}
  }

  /**
   * Remove reaction
   */
  async removeReact(m) {
    try {
      await this.sock.sendMessage(m.key.remoteJid, {
        react: {
          text: '',
          key: m.key
        }
      });
      this.lastReaction.delete(m.key.id);
    } catch {}
  }

  /**
   * Toggle command status reactions
   */
  toggle() {
    this.config.COMMAND_STATUS_REACT = !this.config.COMMAND_STATUS_REACT;
    return this.config.COMMAND_STATUS_REACT;
  }

  /**
   * Update status emoji
   */
  setEmoji(status, emoji) {
    if (this.config.COMMAND_STATUS_EMOJIS[status] !== undefined) {
      this.config.COMMAND_STATUS_EMOJIS[status] = emoji;
      return true;
    }
    return false;
  }

  /**
   * Get all status emojis
   */
  getEmojis() {
    return this.config.COMMAND_STATUS_EMOJIS;
  }
}

module.exports = CommandReactor;
