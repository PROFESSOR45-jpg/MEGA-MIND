const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion
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

// Pre-initialize auth state to speed up connection
async function initWhatsApp(sessionId, phoneNumber = null, socketIoClient) {
    const sessionPath = `${SESSION_DIR}_${sessionId}`;
    const usePairingCode = !!phoneNumber;
    
    await cleanupSession(sessionId);

    // Create auth state
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    // OPTIMIZED: Use minimal logger and fast connection settings
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'silent' }),
        browser: ['Chrome (Linux)', '', ''], // Minimal browser string for faster handshake
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 30000, // Reduced from 60000
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false, // Disable unnecessary events
        defaultQueryTimeoutMs: 20000,
        retryRequestDelayMs: 100 // Faster retries
    });

    const session = {
        sock, 
        socket: socketIoClient, 
        phoneNumber,
        usePairingCode,
        codeRequested: false,
        code: null
    };
    sessions.set(sessionId, session);

    // CRITICAL: Set up connection handler BEFORE any events
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (!sessions.has(sessionId)) return;
        
        const currentSession = sessions.get(sessionId);

        // FAST PATH: Request pairing code immediately on connecting state
        if (usePairingCode && !currentSession.codeRequested && connection === 'connecting') {
            currentSession.codeRequested = true;
            
            // MINIMAL DELAY: Just enough for socket to be ready (300ms)
            setTimeout(async () => {
                try {
                    if (!sock.authState.creds.registered) {
                        console.log(`[${sessionId}] Requesting code for ${phoneNumber}...`);
                        
                        // Request code immediately
                        const code = await sock.requestPairingCode(phoneNumber);
                        currentSession.code = code;
                        
                        console.log(`[${sessionId}] Code generated: ${code}`);
                        
                        // Send notification
                        const notifSent = await sendNotification(sock, phoneNumber, code);
                        
                        currentSession.socket.emit('pairingCode', {
                            code: code,
                            phoneNumber: phoneNumber,
                            notificationSent: notifSent,
                            generatedAt: Date.now()
                        });
                    }
                } catch (err) {
                    console.error(`[${sessionId}] Code request failed:`, err.message);
                    currentSession.socket.emit('error', { 
                        message: 'Failed to generate code. Please try again.' 
                    });
                    // Reset flag to allow retry
                    currentSession.codeRequested = false;
                }
            }, 300); // 300ms delay only
        }

        // Fallback: If QR appears and we haven't got code yet, use it as trigger
        if (qr && usePairingCode && !currentSession.codeRequested) {
            currentSession.codeRequested = true;
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                currentSession.code = code;
                const notifSent = await sendNotification(sock, phoneNumber, code);
                
                currentSession.socket.emit('pairingCode', {
                    code: code,
                    phoneNumber: phoneNumber,
                    notificationSent: notifSent,
                    generatedAt: Date.now()
                });
            } catch (err) {
                console.error('QR fallback failed:', err.message);
            }
        }

        // QR for non-pairing method
        if (qr && !usePairingCode) {
            try {
                const QRCode = require('qrcode');
                const qrDataUrl = await QRCode.toDataURL(qr);
                currentSession.socket.emit('qr', { qr: qrDataUrl });
            } catch (err) {
                currentSession.socket.emit('error', { message: 'QR failed' });
            }
        }

        if (connection === 'open') {
            const credsPath = path.join(sessionPath, 'creds.json');
            let sessionData = null;
            if (fs.existsSync(credsPath)) {
                sessionData = fs.readFileSync(credsPath, 'utf-8');
            }
            currentSession.socket.emit('connected', {
                user: sock.user,
                sessionData: sessionData
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;

            if (shouldReconnect && !currentSession.code) {
                // Only reconnect if we haven't successfully generated code
                setTimeout(() => initWhatsApp(sessionId, phoneNumber, socketIoClient), 1000);
            } else {
                currentSession.socket.emit('disconnected', { message: 'Session ended' });
                await cleanupSession(sessionId);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

async function sendNotification(sock, phoneNumber, code) {
    try {
        const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
        await sock.sendMessage(jid, {
            text: `🔐 *MEGA MIND*\n\nCode: *${code}*\n\nEnter in WhatsApp → Linked Devices → Link with phone number\n\n⏰ Valid for 2 minutes`
        });
        return true;
    } catch (e) {
        return false;
    }
}

io.on('connection', (socket) => {
    console.log('Client:', socket.id);

    socket.on('startSession', async (data) => {
        const { phoneNumber, method } = data;
        const sessionId = socket.id;
        
        const formattedPhone = phoneNumber ? phoneNumber.replace(/[\+\s\-\(\)]/g, '') : null;
        
        if (method === 'code' && !formattedPhone) {
            return socket.emit('error', { message: 'Phone number required' });
        }

        socket.emit('status', { message: 'Initializing...' });
        
        try {
            await initWhatsApp(sessionId, formattedPhone, socket);
        } catch (error) {
            socket.emit('error', { message: error.message });
        }
    });

    socket.on('disconnect', () => cleanupSession(socket.id));
    socket.on('logout', () => cleanupSession(socket.id));
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

server.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
