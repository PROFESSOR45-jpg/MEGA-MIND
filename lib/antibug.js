const config = require('../set.js');

class AntiBug {
  constructor(sock) {
    this.sock = sock;
    this.blockedUsers = new Set();
  }

  detectBug(message) {
    if (!config.ANTIBUG) return { isBug: false };

    const text = typeof message === 'string' ? message : JSON.stringify(message);
    
    if (text.length > config.BUG_MAX_LENGTH) {
      return { isBug: true, reason: 'Message too long', action: 'delete' };
    }

    for (const pattern of config.BUG_PATTERNS) {
      if (text.includes(pattern)) {
        return { 
          isBug: true, 
          reason: `Contains bug pattern: ${pattern}`,
          action: config.ANTIBUG_BLOCK ? 'block' : 'delete'
        };
      }
    }

    const combiningChars = text.match(/[\u0300-\u036f\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g);
    if (combiningChars && combiningChars.length > 50) {
      return { isBug: true, reason: 'Excessive combining characters', action: 'delete' };
    }

    const suspiciousUnicode = text.match(/[\u{10000}-\u{10FFFF}]/gu);
    if (suspiciousUnicode && suspiciousUnicode.length > 100) {
      return { isBug: true, reason: 'Suspicious Unicode characters', action: 'delete' };
    }

    return { isBug: false };
  }

  async handleBug(m, detectionResult) {
    const jid = m.key.remoteJid;
    const sender = m.key.participant || jid;

    console.log(`🛡️ AntiBug: ${detectionResult.reason} from ${sender}`);

    if (config.ANTIBUG_DELETE) {
      try {
        await this.sock.sendMessage(jid, { delete: m.key });
        console.log('🗑️ Bug message deleted');
      } catch (err) {
        console.error('Failed to delete bug:', err.message);
      }
    }

    if (detectionResult.action === 'block' && config.ANTIBUG_BLOCK) {
      if (!this.blockedUsers.has(sender)) {
        this.blockedUsers.add(sender);
        
        try {
          await this.sock.sendMessage(jid, {
            text: config.MESSAGES.BUG_SENDER_BLOCKED + '\nReason: ' + detectionResult.reason
          });

          await this.sock.updateBlockStatus(sender, 'block');
          console.log('🚫 Bug sender blocked:', sender);
        } catch (err) {
          console.error('Failed to block:', err.message);
        }
      }
    }

    if (jid.endsWith('@g.us')) {
      try {
        await this.sock.sendMessage(jid, {
          text: config.MESSAGES.BUG_BLOCKED + '\n👤 Sender: @' + sender.split('@')[0],
          mentions: [sender]
        });
      } catch {}
    }

    return true;
  }

  checkVCard(vcard) {
    if (!config.ANTIBUG) return false;
    const text = JSON.stringify(vcard);
    return this.detectBug(text).isBug;
  }

  checkLocation(location) {
    if (!config.ANTIBUG) return false;
    if (location.degreesLatitude > 90 || location.degreesLatitude < -90 ||
        location.degreesLongitude > 180 || location.degreesLongitude < -180) {
      return true;
    }
    return false;
  }

  checkDocument(doc) {
    if (!config.ANTIBUG) return false;
    if (doc.fileName && this.detectBug(doc.fileName).isBug) return true;
    return false;
  }

  async unblock(userId) {
    try {
      await this.sock.updateBlockStatus(userId, 'unblock');
      this.blockedUsers.delete(userId);
      return true;
    } catch {
      return false;
    }
  }

  getBlocked() {
    return Array.from(this.blockedUsers);
  }
}

module.exports = AntiBug;

