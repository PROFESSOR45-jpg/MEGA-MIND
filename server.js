const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Express server for keeping alive (required for hosting platforms)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 MEGA MIND BOT is Running!');
});

app.get('/status', (req, res) => {
    res.json({ status: sock ? 'connected' : 'disconnected', timestamp: new Date() });
});

app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
});

let sock = null;

async function startBot() {
    try {
        // Initialize auth state
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        // Fetch latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        // Create socket connection
        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            logger: P({ level: 'silent' }), // Change to 'debug' for verbose logs
            browser: ['MEGA MIND BOT', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('📱 QR Code received, scan with WhatsApp');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
                    ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                    : true;

                console.log('Connection closed due to:', lastDisconnect?.error?.message || 'Unknown error');
                
                if (shouldReconnect) {
                    console.log('🔄 Reconnecting...');
                    setTimeout(startBot, 5000); // Wait 5 seconds before reconnecting
                } else {
                    console.log('❌ Connection closed. You are logged out.');
                    // Clear auth state if logged out
                    if (fs.existsSync('auth_info_baileys')) {
                        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                        console.log('🗑️ Auth state cleared. Restart to scan QR again.');
                    }
                }
            } else if (connection === 'open') {
                console.log('✅ Connected to WhatsApp successfully!');
                console.log(`🤖 Bot User: ${sock.user.id}`);
            } else if (connection === 'connecting') {
                console.log('🔄 Connecting to WhatsApp...');
            }
        });

        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.key.fromMe && m.type === 'notify') {
                console.log('📩 New message:', msg);
                
                const sender = msg.key.remoteJid;
                const messageText = msg.message?.conversation || 
                                   msg.message?.extendedTextMessage?.text || 
                                   msg.message?.imageMessage?.caption || '';

                // Auto-read messages
                await sock.readMessages([msg.key]);

                // Basic command handler
                if (messageText.toLowerCase() === '!ping') {
                    await sock.sendMessage(sender, { text: '🏓 Pong!' });
                }
                
                if (messageText.toLowerCase() === '!help') {
                    await sock.sendMessage(sender, { 
                        text: `*🤖 MEGA MIND BOT Commands:*\n\n` +
                              `• !ping - Check bot status\n` +
                              `• !help - Show this menu\n` +
                              `• !info - Bot information` 
                    });
                }
            }
        });

        // Handle group participants update
        sock.ev.on('group-participants.update', async (update) => {
            console.log('👥 Group update:', update);
        });

    } catch (error) {
        console.error('❌ Error starting bot:', error);
        setTimeout(startBot, 10000); // Retry after 10 seconds on error
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (sock) {
        await sock.logout();
    }
    process.exit(0);
});

// Start the bot
startBot();
