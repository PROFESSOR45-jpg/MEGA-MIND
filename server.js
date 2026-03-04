const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './auth_info_baileys';
const sessions = new Map();

app.use(express.json());
app.use(express.static('public'));

async function cleanupSession(sessionId) {
    if (sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        if (session.sock) {
            try { await session.sock.logout(); } catch (e) {}
        }
        sessions.delete(sessionId);
    }
    const sessionPath = `${SESSION_DIR}_${sessionId}`;
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }
}

async function sendPairingNotification(sock, phoneNumber, code) {
    try {
        const whatsappId = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
        const message = `🔐 *MEGA MIND Session Generator*\n\nYour pairing code is: *${code}*\n\nEnter this in WhatsApp → Linked Devices → Link with phone number\n\n⏰ Expires in 2 minutes. Don't share with anyone.`;
        await sock.sendMessage(whatsappId, { text: message });
        return true;
    } catch (error) {
        console.error('[Notification] Failed:', error.message);
        return false;
    }
}

async function initWhatsApp(sessionId, phoneNumber = null, socketIoClient) {
    const sessionPath = `${SESSION_DIR}_${sessionId}`;
    const usePairingCode = !!phoneNumber;
    
    await cleanupSession(sessionId);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    // CRITICAL: For pairing code, use different browser config
    const browserConfig = usePairingCode 
        ? ['MEGA MIND', 'Safari (Mac)', '10.15.7'] // Mac Safari works better for pairing
        : Browsers.ubuntu('MEGA MIND Session');

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'silent' }),
        browser: browserConfig,
        syncFullHistory: false,
        markOnlineOnConnect: true, // Changed to true for faster connection
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 250
    });

    sessions.set(sessionId, { 
        sock, 
        socket: socketIoClient, 
        phoneNumber,
        usePairingCode,
        pairingCodeRequested: false,
        code: null,
        generatedAt: null
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const session = sessions.get(sessionId);
        if (!session) return;

        // IMMEDIATE PAIRING CODE REQUEST - Don't wait for QR
        if (usePairingCode && !session.pairingCodeRequested && connection === 'connecting') {
            session.pairingCodeRequested = true;
            
            // Request immediately without waiting
            try {
                console.log(`[${sessionId}] Requesting pairing code NOW for ${phoneNumber}`);
                
                // Small delay to ensure socket is ready (500ms instead of 2000ms)
                await new Promise(resolve => setTimeout(resolve, 500));
                
                if (!sock.authState.creds.registered) {
                    const code = await sock.requestPairingCode(phoneNumber);
                    session.code = code;
                    session.generatedAt = Date.now();
                    
                    console.log(`[${sessionId}] Pairing code generated: ${code}`);
                    
                    // Send to WhatsApp immediately
                    const notificationSent = await sendPairingNotification(sock, phoneNumber, code);
                    
                    session.socket.emit('pairingCode', { 
                        code: code,
                        phoneNumber: phoneNumber,
                        message: `Code: ${code}`,
                        notificationSent: notificationSent,
                        expiresIn: '2 minutes'
                    });
                }
            } catch (err) {
                console.error('Pairing code error:', err);
                session.socket.emit('error', { 
                    message: 'Failed to generate code: ' + err.message 
                });
            }
        }

        // QR Code for non-pairing method only
        if (qr && !usePairingCode) {
            try {
                const QRCode = require('qrcode');
                const qrDataUrl = await QRCode.toDataURL(qr);
                session.socket.emit('qr', { 
                    qr: qrDataUrl, 
                    message: 'Scan this QR code with WhatsApp' 
                });
            } catch (err) {
                session.socket.emit('error', { message: 'QR generation failed' });
            }
        }

        if (connection === 'connecting') {
            session.socket.emit('status', { 
                status: 'connecting', 
                message: usePairingCode ? 'Generating code...' : 'Waiting for QR...' 
            });
        }

        if (connection === 'open') {
            console.log(`[${sessionId}] Connected!`);
            const credsPath = path.join(sessionPath, 'creds.json');
            let sessionData = null;
            if (fs.existsSync(credsPath)) {
                sessionData = fs.readFileSync(credsPath, 'utf-8');
            }

            session.socket.emit('connected', {
                status: 'connected',
                message: 'Connected successfully!',
                user: sock.user,
                sessionData: sessionData
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;

            if (shouldReconnect) {
                session.socket.emit('status', { 
                    status: 'reconnecting', 
                    message: 'Reconnecting...' 
                });
                setTimeout(() => initWhatsApp(sessionId, phoneNumber, socketIoClient), 2000);
            } else {
                session.socket.emit('disconnected', { 
                    status: 'disconnected', 
                    message: 'Session ended. Please restart.' 
                });
                await cleanupSession(sessionId);
            }
        }
    });

    return sock;
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('startSession', async (data) => {
        const { phoneNumber, method } = data;
        const sessionId = socket.id;
        
        // Validate phone number format
        let formattedPhone = phoneNumber ? phoneNumber.replace(/[\+\s\-\(\)]/g, '') : null;
        
        if (method === 'code' && formattedPhone) {
            // Ensure phone starts with country code (no +)
            if (!/^\d{10,15}$/.test(formattedPhone)) {
                socket.emit('error', { message: 'Invalid phone number format. Use: 14155552671' });
                return;
            }
        }
        
        console.log(`[${sessionId}] Starting ${method} session for ${formattedPhone}`);
        
        try {
            socket.emit('status', { 
                status: 'initializing', 
                message: method === 'code' ? 'Connecting to WhatsApp servers...' : 'Loading...' 
            });
            
            await initWhatsApp(sessionId, formattedPhone, socket);
        } catch (error) {
            console.error('Session error:', error);
            socket.emit('error', { message: 'Failed to start: ' + error.message });
        }
    });

    socket.on('disconnect', async () => {
        console.log('Client disconnected:', socket.id);
        await cleanupSession(socket.id);
    });

    socket.on('logout', async () => {
        await cleanupSession(socket.id);
        socket.emit('disconnected', { message: 'Logged out' });
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', activeSessions: sessions.size });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
    for (const [sessionId] of sessions) {
        await cleanupSession(sessionId);
    }
    process.exit(0);
});
