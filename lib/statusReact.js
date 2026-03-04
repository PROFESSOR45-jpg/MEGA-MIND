const config = require('../set.js');

class StatusReactor {
  constructor(sock) {
    this.sock = sock;
    this.processedStatuses = new Set();
  }

  async handleStatus(m) {
    if (!config.STATUS_REACT) return;
    if (!m.key || m.key.remoteJid !== 'status@broadcast') return;

    const statusId = m.key.id;
    if (this.processedStatuses.has(statusId)) return;
    this.processedStatuses.add(statusId);

    const emojis = config.STATUS_REACTION_EMOJIS;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

    try {
      await this.sock.sendMessage('status@broadcast', {
        react: { text: emoji, key: m.key }
      });

      console.log(`💯 Reacted ${emoji} to status`);

      if (config.STATUS_VIEW) {
        await this.sock.readMessages([m.key]);
      }
    } catch (err) {
      console.error('Status react error:', err.message);
    }
  }

  setEmojis(emojis) {
    config.STATUS_REACTION_EMOJIS = emojis;
  }

  addEmoji(emoji) {
    if (!config.STATUS_REACTION_EMOJIS.includes(emoji)) {
      config.STATUS_REACTION_EMOJIS.push(emoji);
    }
  }

  removeEmoji(emoji) {
    config.STATUS_REACTION_EMOJIS = config.STATUS_REACTION_EMOJIS.filter(e => e !== emoji);
  }

  toggle() {
    config.STATUS_REACT = !config.STATUS_REACT;
    return config.STATUS_REACT;
  }
}

module.exports = StatusReactor;

