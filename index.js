/**
 * MEGA MIND BOT v3.0.0 - Updated for Baileys 6.7.16+
 * PROFESSOR Edition - Command Status Reactions
 */

const db = require('./lib/database');
global.db = db;

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const express = require('express');

const config = require('./set.js');
const MegaHandler = require('./lib/mega');
const commands = require('./commands/allCommands');
const AntiBug = require('./lib/antibug');
const StatusReactor = require('./lib/statusReact');
const AutoBlock = require('./lib/autoBlock');
const CommandReactor = require('./lib/commandReactor');

const C = {
  r: '\x1b[0m', g: '\x1b[32m', y: '\x1b[33m',
  c: '\x1b[36m', m: '\x1b[35m', w: '\x1b[1m', d: '\x1b[90m', b: '\x1b[34m'
};

const logo = `
${C.m}${C.w}
 ███╗   ███╗███████╗ ██████╗  █████╗ ███╗   ███╗██╗███╗   ██╗██████╗ 
 ████╗ ████║██╔════╝██╔════╝ ██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗
 ██╔████╔██║█████╗  ██║  ███╗███████║██╔████╔██║██║██╔██╗ ██║██║  ██║
 ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║██║╚██╔╝██║██║██║╚██╗██║██║  ██║
 ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██████╔╝
 ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ 
${C.b}
 ██████╗  ██████╗ ████████╗    ███████╗██████╗ ██╗████████╗██╗  ██╗
 ██╔══██╗██╔═══██╗╚══██╔══╝    ██╔════╝██╔══██╗██║╚══██╔══╝██║  ██║
 ██████╔╝██║   ██║   ██║       █████╗  ██████╔╝██║   ██║   ███████║
 ██╔══██╗██║   ██║   ██║       ██╔══╝  ██╔══██╗██║   ██║   ██╔══██║
 ██████╔╝╚██████╔╝   ██║       ███████╗██║  ██║██║   ██║   ██║  ██║
 ╚═════╝  ╚═════╝    ╚═╝       ╚══════╝╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝
${C.y}
 🔒 ANTI-BUG PROTECTION ENABLED
 👤 OWNER: ${config.OWNER_NAME || 'PROFESSOR'}
 ⚡ COMMAND STATUS REACTIONS: ON
${C.r}
`;

// Keep alive server
const app = express();
app.get('/', (req, res) => res.json({
  status: 'alive',
  bot: config.BOT_NAME,
  owner: config.OWNER_NAME,
  version: '3.0.0',
  antibug: config.ANTIBUG,
  autoblock: config.AUTOBLOCK,
  statusReact: config.STATUS_REACT,
  commandStatusReact: config.COMMAND_STATUS_REACT,
  timestamp: new Date().toISOString()
}));
app.listen(process.env.PORT || 3000, () => {
  console.log(`${C.d}🌐 Keep-alive server running on port ${process.env.PORT || 3000}${C.r}`);
});

// Restore session from environment variable
async function restoreSession() {
  if (!config.SESSION_ID) {
    console.log(`${C.y}⚠️  No SESSION_ID found in config. QR code will be shown.${C.r}`);
    return false;
  }
  
  try {
    await fs.ensureDir('./session');
    const data = Buffer.from(config.SESSION_ID, 'base64').toString('utf8');
    
    // Validate JSON before writing
    JSON.parse(data);
    
    await fs.writeFile('./session/creds.json', data);
    console.log(`${C.g}✅ Session restored successfully${C.r}`);
    return true;
  } catch (err) {
    console.log(`${C.y}⚠️  Invalid SESSION_ID: ${err.message}${C.r}`);
    console.log(`${C.y}📲 Please generate a new session ID${C.r}`);
    return false;
  }
}

// Connection retry logic
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function startBot() {
  console.log(logo);

  await db.initDB();

  const hasSession = await restoreSession();
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`${C.d}📱 Baileys Version: v${version.join('.')} ${isLatest ? '(Latest)' : ''}${C.r}\n`);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !hasSession,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: [config.BOT_NAME || 'MEGA MIND', 'Chrome', '3.0.0'],
    markOnlineOnConnect: true,
    syncFullHistory: false, // Improve performance
    shouldIgnoreJid: jid => {
      // Ignore status broadcasts for performance
      return jid === 'status@broadcast';
    }
  });

  // Initialize handlers
  const mega = new MegaHandler(sock, null, config);
  const antiBug = new AntiBug(sock);
  const statusReactor = new StatusReactor(sock);
  const autoBlock = new AutoBlock(sock);
  const commandReactor = new CommandReactor(sock, config);

  // Connection handler with improved error handling
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !hasSession) {
      console.log(`${C.y}📲 Scan QR with WhatsApp:${C.r}`);
      console.log(`${C.d}   WhatsApp > Settings > Linked Devices > Link a Device${C.r}\n`);
      reconnectAttempts = 0; // Reset on new QR
    }

    if (connection === 'open') {
      reconnectAttempts = 0; // Reset counter on successful connection
      console.log(`${C.g}✅ ${config.BOT_NAME || 'MEGA MIND'} CONNECTED${C.r}`);
      console.log(`${C.c}👤 Owner: ${config.OWNER_NAME} (${config.OWNER_NUMBER})${C.r}`);
      console.log(`${C.m}🛡️  AntiBug: ${config.ANTIBUG ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}🔒 AutoBlock: ${config.AUTOBLOCK ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}💯 StatusReact: ${config.STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}⚡ CommandStatus: ${config.COMMAND_STATUS_REACT ? 'ON' : 'OFF'}${C.r}`);
      console.log(`${C.m}🔧 Prefix: ${config.COMMAND_PREFIX}${C.r}\n`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.output?.payload?.message || 'Unknown';
      
      console.log(`${C.y}⚠️  Connection closed: ${DisconnectReason[statusCode] || statusCode || reason}${C.r}`);

      // Don't reconnect if logged out
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`${C.r}❌ Logged out. Please restart and scan QR again.${C.r}`);
        await fs.remove('./session');
        process.exit(1);
      }

      // Handle specific error codes
      if (statusCode === DisconnectReason.restartRequired) {
        console.log(`${C.y}🔄 Restart required...${C.r}`);
      } else if (statusCode === DisconnectReason.timedOut) {
        console.log(`${C.y}⏱️  Connection timed out${C.r}`);
      } else if (statusCode === 405) { // Method not allowed (often pairing code issues)
        console.log(`${C.y}⚠️  Authentication method not allowed${C.r}`);
      }

      // Reconnection logic with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(5000 * reconnectAttempts, 30000); // Max 30s delay
        console.log(`${C.y}🔄 Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay/1000}s${C.r}`);
        setTimeout(startBot, delay);
      } else {
        console.log(`${C.r}❌ Max reconnection attempts reached. Restart manually.${C.r}`);
        process.exit(1);
      }
    }
  });

  // Save credentials on update
  sock.ev.on('creds.update', async (creds) => {
    try {
      await saveCreds();
      
      // If session ID was provided but creds updated, log it
      if (hasSession && creds) {
        console.log(`${C.d}💾 Credentials updated${C.r}`);
      }
    } catch (err) {
      console.error(`${C.r}Error saving credentials: ${err.message}${C.r}`);
    }
  });

  // Handle status updates (reactions)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const m of messages) {
      if (m.key.remoteJid === 'status@broadcast') {
        try {
          await statusReactor.handleStatus(m);
        } catch (err) {
          console.error('Status reaction error:', err.message);
        }
      }
    }
  });

  // Handle group participants
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;

    try {
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
    } catch (err) {
      console.error('Group participant handler error:', err.message);
    }
  });

  // Handle calls (auto-block)
  sock.ev.on('call', async (call) => {
    if (!config.AUTOBLOCK_CALLS) return;
    
    try {
      console.log(`${C.y}📞 Blocking call from ${call.from}${C.r}`);
      await sock.rejectCall(call.id, call.from);
      await sock.sendMessage(call.from, { text: config.MESSAGES?.CALL_BLOCKED || '📞 Calls are not accepted.' });
    } catch (err) {
      console.error('Call handler error:', err.message);
    }
  });

  // Main message handler
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;

      const jid = m.key.remoteJid;
      if (jid === 'status@broadcast') continue;

      const isGroup = jid.endsWith('@g.us');
      const sender = m.key.participant || jid;
      const pushName = m.pushName || 'Unknown';

      try {
        // Check bans
        const bannedUser = await db.isBannedUser(sender);
        const bannedGroup = isGroup ? await db.isBannedGroup(jid) : false;

        if (bannedUser || bannedGroup) {
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

        // Extract message text
        let text = '';
        const messageType = Object.keys(m.message)[0];

        switch(messageType) {
          case 'conversation':
            text = m.message.conversation || '';
            break;
          case 'extendedTextMessage':
            text = m.message.extendedTextMessage?.text || '';
            break;
          case 'imageMessage':
            text = m.message.imageMessage?.caption || '';
            break;
          case 'videoMessage':
            text = m.message.videoMessage?.caption || '';
            break;
        }

        // ANTI-BUG PROTECTION
        if (config.ANTIBUG && text) {
          const detection = antiBug.detectBug(text);
          if (detection.isBug) {
            await antiBug.handleBug(m, detection);
            continue;
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

        // Log message
        console.log(`${C.d}[${new Date().toLocaleTimeString()}]${C.r} ${pushName}: ${text.substring(0, 40)}${text.length > 40 ? '...' : ''}`);

        // Auto-read
        if (config.AUTO_READ_MESSAGES) {
          await sock.readMessages([m.key]);
        }

        // Auto-react to messages
        if (config.AUTO_REACT_MESSAGES && config.MESSAGE_REACTION_EMOJI) {
          await sock.sendMessage(jid, {
            react: { text: config.MESSAGE_REACTION_EMOJI, key: m.key }
          });
        }

        // Check for command
        if (!text.startsWith(config.COMMAND_PREFIX)) continue;

        const args = text.slice(config.COMMAND_PREFIX.length).trim().split(/\s+/);
        const cmd = args.shift()?.toLowerCase();
        
        if (!cmd) continue;

        // Command status reaction - PROCESSING
        if (config.COMMAND_STATUS_REACT) {
          await commandReactor.react(m, 'PROCESSING');
        }

        // Show typing indicator
        if (config.PRESENCE_TYPING) {
          await sock.sendPresenceUpdate('composing', jid);
        }

        const ctx = {
          sock, m, text, args, cmd, jid, isGroup, sender, pushName,
          config, mega, antiBug, statusReactor, autoBlock, commandReactor
        };

        // Execute command
        if (commands[cmd]) {
          await executeCommand(ctx, m, cmd);
        } else {
          if (config.COMMAND_STATUS_REACT) {
            await commandReactor.react(m, 'ERROR');
          }
          await sock.sendMessage(jid, { 
            text: config.MESSAGES?.CMD_NOT_FOUND || '❌ Command not found' 
          }, { quoted: m });
        }

        // Stop typing
        if (config.PRESENCE_TYPING) {
          await sock.sendPresenceUpdate('paused', jid);
        }

      } catch (err) {
        console.error('Message handler error:', err);
      }
    }
  });
}

// Separate command execution for cleaner code
async function executeCommand(ctx, m, cmd) {
  const { sock, jid, config, commandReactor, mega, isGroup, sender } = ctx;

  try {
    // Check if command is enabled
    if (config.COMMANDS && config.COMMANDS[cmd] === false) {
      if (config.COMMAND_STATUS_REACT) {
        await commandReactor.react(m, 'DISABLED');
      }
      await sock.sendMessage(jid, { text: '🚧 This command is disabled' }, { quoted: m });
      return;
    }

    // Check cooldown
    const cooldownKey = `${sender}-${cmd}`;
    const lastUsed = commandReactor.cooldowns?.get(cooldownKey);
    const cooldownTime = (config.COOLDOWNS?.[cmd.toUpperCase()] || config.COOLDOWNS?.DEFAULT || 3) * 1000;

    if (lastUsed && Date.now() - lastUsed < cooldownTime) {
      const remaining = Math.ceil((cooldownTime - (Date.now() - lastUsed)) / 1000);
      if (config.COMMAND_STATUS_REACT) {
        await commandReactor.react(m, 'COOLDOWN');
      }
      await sock.sendMessage(jid, {
        text: (config.MESSAGES?.COOLDOWN || '⏱️ Wait @time seconds').replace('@time', remaining)
      }, { quoted: m });
      return;
    }

    commandReactor.cooldowns?.set(cooldownKey, Date.now());

    // Permission checks
    const ownerOnlyCmds = ['ban', 'unban', 'bangroup', 'unbangroup', 'bannedlist', 
      'bug', 'bugvcard', 'bugloc', 'bugsticker', 'bugdoc', 'buginfinite', 'bugbutton',
      'autoblock', 'antibugtoggle', 'statusreacttoggle', 'commandstatus', 'settings'];
    
    if (ownerOnlyCmds.includes(cmd) && !mega.isOwner(sender)) {
      if (config.COMMAND_STATUS_REACT) {
        await commandReactor.react(m, 'OWNER_ONLY');
      }
      await sock.sendMessage(jid, { text: config.MESSAGES?.OWNER_ONLY || '👑 Owner only' }, { quoted: m });
      return;
    }

    // Admin commands
    const adminCmds = ['kick', 'add', 'promote', 'demote', 'mute', 'unmute', 'warn', 'clearwarns'];
    if (adminCmds.includes(cmd)) {
      if (!isGroup) {
        if (config.COMMAND_STATUS_REACT) {
          await commandReactor.react(m, 'GROUP_ONLY');
        }
        await sock.sendMessage(jid, { text: config.MESSAGES?.GROUP_ONLY || '👥 Group only' }, { quoted: m });
        return;
      }
      
      const levelCheck = await mega.checkLevel(m, isGroup);
      if (levelCheck.level !== 'admin' && levelCheck.level !== 'owner') {
        if (config.COMMAND_STATUS_REACT) {
          await commandReactor.react(m, 'ADMIN_ONLY');
        }
        await sock.sendMessage(jid, { text: config.MESSAGES?.ADMIN_ONLY || '👮 Admin only' }, { quoted: m });
        return;
      }
    }

    // Execute command
    await commands[cmd](ctx);

    // Success reaction
    if (config.COMMAND_STATUS_REACT) {
      await commandReactor.react(m, 'SUCCESS');
    }

  } catch (err) {
    console.error(`Command error (${cmd}):`, err);
    
    if (config.COMMAND_STATUS_REACT) {
      await commandReactor.react(m, 'ERROR');
    }
    await sock.sendMessage(jid, { text: '❌ Error executing command' }, { quoted: m });
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...');
  await db.close?.();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't exit, let it reconnect
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot
startBot().catch(err => {
  console.error('Fatal error starting bot:', err);
  process.exit(1);
});
