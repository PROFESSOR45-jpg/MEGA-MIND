
/**
 * MEGA MIND BOT v3.0.0
 * PROFESSOR Edition - Command Status Reactions
 */
const db = require('./lib/database');
global.db = db; // Make it globally accessible

const { 
  default: makeWASocket, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const express = require('express');

const config = require('./set.js');
const MegaHandler = require('./lib/mega');
const commands = require('./commands/allCommands');
const db = require('./lib/database');
const AntiBug = require('./lib/antibug');
const StatusReactor = require('./lib/statusReact');
const AutoBlock = require('./lib/autoBlock');
const CommandReactor = require('./lib/commandReactor'); // NEW

const C = {
  r: '\x1b[0m', g: '\x1b[32m', y: '\x1b[33m',
  c: '\x1b[36m', m: '\x1b[35m', w: '\x1b[1m', d: '\x1b[90m', b: '\x1b[34m'
};

const logo = `
${C.m}${C.w}
    ███╗   ███╗███████╗ ██████╗  █████╗     ███╗   ███╗██╗███╗   ██╗██████╗ 
    ████╗ ████║██╔════╝██╔════╝ ██╔══██╗    ████╗ ████║██║████╗  ██║██╔══██╗
    ██╔████╔██║█████╗  ██║  ███╗███████║    ██╔████╔██║██║██╔██╗ ██║██║  ██║
    ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║    ██║╚██╔╝██║██║██║╚██╗██║██║  ██║
    ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║    ██║ ╚═╝ ██║██║██║ ╚████║██████╔╝
    ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ 
${C.b}
         ██████╗ ██╗   ██╗ ██████╗     ████████╗███████╗ ██████╗██╗  ██╗
         ██╔══██╗██║   ██║██╔═══██╗    ╚══██╔══╝██╔════╝██╔════╝██║  ██║
         ██████╔╝██║   ██║██║   ██║       ██║   █████╗  ██║     ███████║
         ██╔══██╗██║   ██║██║   ██║       ██║   ██╔══╝  ██║     ██╔══██║
         ██████╔╝╚██████╔╝╚██████╔╝       ██║   ███████╗╚██████╗██║  ██║
         ╚═════╝  ╚═════╝  ╚═════╝        ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝
${C.y}
              🔒 ANTI-BUG PROTECTION ENABLED
              👤 OWNER: PROFESSOR
              ⚡ COMMAND STATUS REACTIONS: ON
${C.r}
`;

// Keep alive
const app = express();
app.get('/', (req, res) => res.json({
  status: 'alive',
  bot: config.BOT_NAME,
  owner: config.OWNER_NAME,
  antibug: config.ANTIBUG,
  autoblock: config.AUTOBLOCK,
  statusReact: config.STATUS_REACT,
  commandStatusReact: config.COMMAND_STATUS_REACT
}));
app.listen(process.env.PORT || 3000);

// Restore session
async function restoreSession() {
  if (!config.SESSION_ID) return false;
  try {
    await fs.ensureDir('./session');
    const data = Buffer.from(config.SESSION_ID, 'base64').toString();
    await fs.writeFile('./session/creds.json', data);
    return true;
  } catch {
    return false;
  }
}

// Start bot
async function startBot() {
  console.log(logo);
  
  await db.initDB();
  
  const hasSession = await restoreSession();
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !hasSession,
    auth: state,
    browser: [config.BOT_NAME, 'Chrome', '3.0.0'],
    markOnlineOnConnect: true
  });

  // Initialize systems
  const mega = new MegaHandler(sock, null, config);
  const antiBug = new AntiBug(sock);
  const statusReactor = new StatusReactor(sock);
  const autoBlock = new AutoBlock(sock);
  const commandReactor = new CommandReactor(sock, config); // NEW

  // Connection handler
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log(`${C.y}📲 Scan QR with WhatsApp${C.r}`);
    }
    
    if (connection === 'open') {
      console.log(`${C.g}✅ ${config.BOT_NAME} CONNECTED${C.r}`);
      console.log(`${C.c}👤 Owner: ${config.OWNER_NAME} (${config.OWNER_NUMBER})${C.r}`);
      console.log(`${C.m}🛡️ AntiBug: ${config.ANTIBUG ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}🔒 AutoBlock: ${config.AUTOBLOCK ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}💯 StatusReact: ${config.STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}⚡ CommandStatus: ${config.COMMAND_STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}🔧 Prefix: ${config.COMMAND_PREFIX}${C.r}\n`);
    }
    
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log(`${C.y}🔄 Reconnecting...${C.r}`);
        setTimeout(startBot, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Status updates
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      for (const m of messages) {
        if (m.key.remoteJid === 'status@broadcast') {
          await statusReactor.handleStatus(m);
        }
      }
    }
  });

  // Group participants
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;
    
    if (action === 'add' && config.WELCOME_NEW_MEMBERS) {
      const meta = await sock.groupMetadata(id);
      for (const user of participants) {
        if (await autoBlock.checkUser(user, '')) continue;
        
        const text = config.WELCOME_MESSAGE
          .replace('@user', '@' + user.split('@')[0])
          .replace('@group', meta.subject)
          .replace('@count', meta.participants.length);
        
        await sock.sendMessage(id, { text, mentions: [user] });
      }
    }
    
    if (action === 'remove' && config.GOODBYE_MEMBERS) {
      for (const user of participants) {
        const text = config.GOODBYE_MESSAGE.replace('@user', '@' + user.split('@')[0]);
        await sock.sendMessage(id, { text, mentions: [user] });
      }
    }
  });

  // Call handler (auto-block)
  sock.ev.on('call', async (call) => {
    if (config.AUTOBLOCK_CALLS) {
      console.log(`📞 Blocking call from ${call.from}`);
      await sock.rejectCall(call.id, call.from);
      await sock.sendMessage(call.from, { text: config.MESSAGES.CALL_BLOCKED });
    }
  });

  // Main message handler
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      
      const jid = m.key.remoteJid;
      if (jid === 'status@broadcast') continue;
      
      const isGroup = jid.endsWith('@g.us');
      const sender = m.key.participant || jid;
      const pushName = m.pushName || 'Unknown';
      
      // Check bans
      const bannedUser = await db.isBannedUser(sender);
      const bannedGroup = isGroup ? await db.isBannedGroup(jid) : false;
      
      if (bannedUser || bannedGroup) {
        // React with banned emoji
        if (config.COMMAND_STATUS_REACT) {
          await commandReactor.react(m, 'BANNED');
        }
        continue;
      }
      
      // Auto-block check
      if (await autoBlock.checkUser(sender, pushName)) {
        if (config.COMMAND_STATUS_REACT) {
          await commandReactor.react(m, 'NO_PERMISSION');
        }
        continue;
      }
      
      // Extract message
      let text = '';
      let messageType = Object.keys(m.message)[0];
      
      switch(messageType) {
        case 'conversation':
          text = m.message.conversation;
          break;
        case 'extendedTextMessage':
          text = m.message.extendedTextMessage.text;
          break;
        case 'imageMessage':
          text = m.message.imageMessage.caption || '';
          break;
        case 'videoMessage':
          text = m.message.videoMessage.caption || '';
          break;
      }
      
      // ANTI-BUG PROTECTION
      if (config.ANTIBUG) {
        if (text) {
          const detection = antiBug.detectBug(text);
          if (detection.isBug) {
            await antiBug.handleBug(m, detection);
            continue;
          }
        }
        
        if (messageType === 'contactMessage' || messageType === 'contactsArrayMessage') {
          if (antiBug.checkVCard(m.message)) {
            await antiBug.handleBug(m, { isBug: true, reason: 'VCard bug', action: 'block' });
            continue;
          }
        }
        
        if (messageType === 'locationMessage') {
          if (antiBug.checkLocation(m.message.locationMessage)) {
            await antiBug.handleBug(m, { isBug: true, reason: 'Invalid location', action: 'delete' });
            continue;
          }
        }
        
        if (messageType === 'documentMessage') {
          if (antiBug.checkDocument(m.message.documentMessage)) {
            await antiBug.handleBug(m, { isBug: true, reason: 'Document bug', action: 'delete' });
            continue;
          }
        }
      }
      
      // Log
      console.log(`${C.d}[${new Date().toLocaleTimeString()}]${C.r} ${pushName}: ${text.substring(0, 40)}`);
      
      // Auto-read
      if (config.AUTO_READ_MESSAGES) {
        await sock.readMessages([m.key]);
      }
      
      // Auto-react to all messages
      if (config.AUTO_REACT_MESSAGES) {
        await sock.sendMessage(jid, {
          react: {
            text: config.MESSAGE_REACTION_EMOJI,
            key: m.key
          }
        });
      }
      
      // Check command
      if (!text.startsWith(config.COMMAND_PREFIX)) continue;
      
      const args = text.slice(config.COMMAND_PREFIX.length).trim().split(' ');
      const cmd = args.shift().toLowerCase();
      
      // Command status reaction - PROCESSING
      if (config.COMMAND_STATUS_REACT) {
        await commandReactor.react(m, 'PROCESSING');
      }
      
      // Show typing
      if (config.PRESENCE_TYPING) {
        await sock.sendPresenceUpdate('composing', jid);
      }
      
      const ctx = { 
        sock, m, text, args, cmd, jid, isGroup, sender, pushName,
        config, mega, antiBug, statusReactor, autoBlock, commandReactor
      };
      
      // Execute command with status tracking
      if (commands[cmd]) {
        try {
          // Check if command enabled
          if (!config.COMMANDS[cmd]) {
            if (config.COMMAND_STATUS_REACT) {
              await commandReactor.react(m, 'DISABLED');
            }
            await sock.sendMessage(jid, { 
              text: '🚧 This command is disabled' 
            }, { quoted: m });
            continue;
          }
          
          // Check cooldown
          const cooldownKey = `${sender}-${cmd}`;
          const lastUsed = commandReactor.cooldowns.get(cooldownKey);
          const cooldownTime = (config.COOLDOWNS[cmd.toUpperCase()] || config.COOLDOWNS.DEFAULT) * 1000;
          
          if (lastUsed && Date.now() - lastUsed < cooldownTime) {
            const remaining = Math.ceil((cooldownTime - (Date.now() - lastUsed)) / 1000);
            if (config.COMMAND_STATUS_REACT) {
              await commandReactor.react(m, 'COOLDOWN');
            }
            await sock.sendMessage(jid, { 
              text: config.MESSAGES.COOLDOWN.replace('@time', remaining)
            }, { quoted: m });
            continue;
          }
          
          commandReactor.cooldowns.set(cooldownKey, Date.now());
          
          // Check permissions
          const levelCheck = await mega.checkLevel(m, isGroup);
          
          if (!levelCheck.allowed) {
            if (levelCheck.level === 'banned') {
              if (config.COMMAND_STATUS_REACT) {
                await commandReactor.react(m, 'BANNED');
              }
            } else {
              if (config.COMMAND_STATUS_REACT) {
                await commandReactor.react(m, 'NO_PERMISSION');
              }
            }
            await sock.sendMessage(jid, { 
              text: levelCheck.level === 'banned' ? config.MESSAGES.USER_BANNED : config.MESSAGES.NO_PERMISSION 
            }, { quoted: m });
            continue;
          }
          
          // Owner only check
          if (['ban', 'unban', 'bangroup', 'unbangroup', 'bannedlist', 
               'bug', 'bugvcard', 'bugloc', 'bugsticker', 'bugdoc', 'buginfinite', 'bugbutton',
               'autoblock', 'antibugtoggle', 'statusreacttoggle', 'commandstatus',
               'settings'].includes(cmd)) {
            if (!mega.isOwner(sender)) {
              if (config.COMMAND_STATUS_REACT) {
                await commandReactor.react(m, 'OWNER_ONLY');
              }
              await sock.sendMessage(jid, { text: config.MESSAGES.OWNER_ONLY }, { quoted: m });
              continue;
            }
          }
          
          // Admin check for admin commands
          if (['kick', 'add', 'promote', 'demote', 'mute', 'unmute', 'warn', 'clearwarns'].includes(cmd)) {
            if (!isGroup) {
              if (config.COMMAND_STATUS_REACT) {
                await commandReactor.react(m, 'GROUP_ONLY');
              }
              await sock.sendMessage(jid, { text: config.MESSAGES.GROUP_ONLY }, { quoted: m });
              continue;
            }
            if (levelCheck.level !== 'admin' && levelCheck.level !== 'owner') {
              if (config.COMMAND_STATUS_REACT) {
                await commandReactor.react(m, 'ADMIN_ONLY');
              }
              await sock.sendMessage(jid, { text: config.MESSAGES.ADMIN_ONLY }, { quoted: m });
              continue;
            }
          }
          
          // Execute command
          await commands[cmd](ctx);
          
          // Success reaction
          if (config.COMMAND_STATUS_REACT) {
            await commandReactor.react(m, 'SUCCESS');
          }
          
        } catch (err) {
          console.error('Command error:', err);
          
          // Error reaction
          if (config.COMMAND_STATUS_REACT) {
            await commandReactor.react(m, 'ERROR');
          }
          
          await sock.sendMessage(jid, { text: '❌ Error executing command' }, { quoted: m });
        }
      } else {
        // Command not found
        if (config.COMMAND_STATUS_REACT) {
          await commandReactor.react(m, 'ERROR');
        }
        await sock.sendMessage(jid, { text: config.MESSAGES.CMD_NOT_FOUND }, { quoted: m });
      }
      
      // Stop typing
      if (config.PRESENCE_TYPING) {
        await sock.sendPresenceUpdate('paused', jid);
      }
    }
  });
}

startBot().catch(console.error);
