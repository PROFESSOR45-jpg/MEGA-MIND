const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const sessionManager = require('./lib/sessionManager');
const { SESSION_CONFIG, BOT_CONFIG } = require('./config');

const logger = pino({ level: 'silent' });

async function startBot() {
    console.log(`
    ███╗   ███╗███████╗ ██████╗  █████╗     ███╗   ███╗██╗███╗   ██╗██████╗ 
    ████╗ ████║██╔════╝██╔════╝ ██╔══██╗    ████╗ ████║██║████╗  ██║██╔══██╗
    ██╔████╔██║█████╗  ██║  ███╗███████║    ██╔████╔██║██║██╔██╗ ██║██║  ██║
    ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║    ██║╚██╔╝██║██║██║╚██╗██║██║  ██║
    ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║    ██║ ╚═╝ ██║██║██║ ╚████║██████╔╝
    ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ 
                                                                            
     🤖 Version ${BOT_CONFIG.version} | Advanced WhatsApp Bot
    `);

    // Try to load/fetch session
    const sessionLoaded = await sessionManager.loadSession();
    
    if (!sessionLoaded && !SESSION_CONFIG.SESSION_ID) {
        console.log(`
    ⚠️  No session found!
    
    📱 To get a session:
    1. Visit: ${SESSION_CONFIG.SESSION_SERVER_URL}/generate
    2. Scan the QR code with WhatsApp
    3. Copy the Session ID
    4. Set it as SESSION_ID environment variable
    
    Or run: node lib/getSession.js for local generation
        `);
        
        // Auto-generate option
        if (SESSION_CONFIG.AUTO_FETCH_SESSION) {
            console.log('🔄 Auto-generating session...');
            const newSession = await sessionManager.generateNewSession();
            if (newSession.success) {
                console.log(`
    ✅ Session generation started!
    🔗 Visit: ${newSession.qrUrl}
    📋 Session ID: ${newSession.sessionId}
    
    ⏳ Waiting for QR scan... (checking every 5 seconds)
                `);
                
                // Poll for connection
                let attempts = 0;
                const maxAttempts = 60; // 5 minutes
                
                const checkInterval = setInterval(async () => {
                    attempts++;
                    const status = await sessionManager.checkServerStatus(newSession.sessionId);
                    
                    if (status.status === 'connected') {
                        clearInterval(checkInterval);
                        console.log('✅ Session connected! Fetching credentials...');
                        const sessionData = await sessionManager.fetchSession(newSession.sessionId);
                        if (sessionData) {
                            await sessionManager.saveSession(sessionData);
                            console.log('🔄 Restarting bot with new session...');
                            process.exit(0); // Restart to load new session
                        }
                    }
                    
                    if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        console.log('❌ Session generation timeout. Please try again.');
                        process.exit(1);
                    }
                }, 5000);
                
                return;
            }
        }
        
        process.exit(1);
    }

    // Initialize auth state
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    // Create socket
    const sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        logger: logger,
        browser: ['MEGA MIND Bot', 'Chrome', '3.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    // Connection handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log(`👤 User: ${sock.user.name} (${sock.user.id})`);
            
            // Notify owner
            if (BOT_CONFIG.owner) {
                await sock.sendMessage(BOT_CONFIG.owner + '@s.whatsapp.net', {
                    text: `🤖 *MEGA MIND Bot Connected!*\n\n✅ Status: Online\n📱 User: ${sock.user.name}\n⏰ Time: ${new Date().toLocaleString()}`
                }).catch(() => {});
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`⚠️ Connection closed. Status: ${statusCode}`);
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                setTimeout(startBot, 5000);
            } else {
                console.log('❌ Logged out. Please generate new session.');
                await fs.remove('./auth_info_baileys');
                await fs.remove('./session.json');
                process.exit(1);
            }
        }
    });

    // Save credentials
    sock.ev.on('creds.update', saveCreds);

    // Message handler
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        try {
            // Your message handling logic here
            require('./handler')(sock, msg);
        } catch (error) {
            console.error('Handler error:', error);
        }
    });

    // Group participants update
    sock.ev.on('group-participants.update', async (update) => {
        try {
            require('./lib/groupHandler')(sock, update);
        } catch (error) {
            console.error('Group handler error:', error);
        }
    });
}

// Start with error handling
startBot().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
