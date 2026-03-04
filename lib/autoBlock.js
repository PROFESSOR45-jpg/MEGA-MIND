const config = require('../set.js');

class AutoBlock {
  constructor(sock) {
    this.sock = sock;
    this.allowedUsers = new Set();
  }

  async checkUser(userId, pushName) {
    if (!config.AUTOBLOCK) return false;

    const number = userId.split('@')[0];
    const owner = config.OWNER_NUMBER;

    if (number === owner) return false;
    if (this.allowedUsers.has(userId)) return false;

    if (config.MODE === 'private' || config.MODE === 'self') {
      try {
        await this.sock.updateBlockStatus(userId, 'block');
        console.log(`🚫 Auto-blocked: ${number}`);
        
        await this.sock.sendMessage(userId, {
          text: `🚫 You have been blocked.\n\nOnly contacts can message ${config.BOT_NAME}.`
        }).catch(() => {});
        
        return true;
      } catch (err) {
        console.error('Auto-block failed:', err.message);
        return false;
      }
    }

    return false;
  }

  allow(userId) {
    this.allowedUsers.add(userId);
    console.log(`✅ Allowed: ${userId}`);
  }

  disallow(userId) {
    this.allowedUsers.delete(userId);
  }

  toggle() {
    config.AUTOBLOCK = !config.AUTOBLOCK;
    return config.AUTOBLOCK;
  }

  getStatus() {
    return {
      enabled: config.AUTOBLOCK,
      allowedCount: this.allowedUsers.size,
      mode: config.MODE
    };
  }
}

module.exports = AutoBlock;

