const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Baileys imports
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
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const SESSION_DIR = './auth_info_baileys';

// Store active sockets and sessions
const sessions = new Map();

app.use(express.json());
app.use(express.static('public'));

// Cleanup function
async function cleanupSession(sessionId) {
    if (sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        if (session.sock) {
            try {
                await session.sock.logout();
            } catch (e) {}
        }
        sessions.delete(sessionId);
    }
    const sessionPath = `${SESSION_DIR}_${sessionId}`;
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }
}

// Send WhatsApp notification popup
async function sendPairingNotification(sock, phoneNumber, code) {
    try {
        // Format number for WhatsApp ID (add @s.whatsapp.net)
        const whatsappId = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
        
        const message = `🔐 *MEGA MIND Session Generator*\n\n` +
                      `Your pairing code is: *${code}*\n\n` +
                      `Enter this code in WhatsApp → Linked Devices → Link with phone number\n\n` +
                      `⏰ This code expires in 2 minutes. Do not share it with anyone.`;

        await sock.sendMessage(whatsappId, { text: message });
        console.log(`[Notification] Pairing notification sent to ${phoneNumber}`);
        return true;
    } catch (error) {
        console.error('[Notification] Failed to send:', error.message);
        return false;
    }
}

// Initialize WhatsApp Socket
async function initWhatsApp(sessionId, phoneNumber = null, socketIoClient) {
    const sessionPath = `${SESSION_DIR}_${sessionId}`;
    const usePairingCode = !!phoneNumber;
    
    await cleanupSession(sessionId);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'silent' }),
        browser: Browsers.ubuntu('MEGA MIND Session'),
        syncFullHistory: false,
        markOnlineOnConnect: false
    });

    sessions.set(sessionId, { 
        sock, 
        socket: socketIoClient, 
        phoneNumber,
        usePairingCode,
        pairingCodeRequested: false,
        code: null
    });

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const session = sessions.get(sessionId);

        if (!session) return;

        // Handle QR code - ONLY if NOT using pairing code method
        if (qr && !session.usePairingCode) {
            console.log(`[${sessionId}] QR Code generated (QR method)`);
            try {
                const QRCode = require('qrcode');
                const qrDataUrl = await QRCode.toDataURL(qr);
                session.socket.emit('qr', { 
                    qr: qrDataUrl, 
                    message: 'Scan this QR code with WhatsApp' 
                });
            } catch (err) {
                session.socket.emit('error', { message: 'Failed to generate QR code' });
            }
        }
        
        // If we see a QR but we're using pairing code, ignore it and request pairing code
        if (qr && session.usePairingCode && !session.pairingCodeRequested) {
            console.log(`[${sessionId}] Ignoring QR, requesting pairing code for ${session.phoneNumber}`);
            session.pairingCodeRequested = true;
            
            setTimeout(async () => {
                try {
                    if (!sock.authState.creds.registered) {
                        const code = await sock.requestPairingCode(session.phoneNumber);
                        session.code = code;
                        console.log(`[${sessionId}] Pairing code generated: ${code}`);
                        
                        // Send notification to WhatsApp
                        const notificationSent = await sendPairingNotification(sock, session.phoneNumber, code);
                        
                        session.socket.emit('pairingCode', { 
                            code: code,
                            phoneNumber: session.phoneNumber,
                            message: `Enter this code in WhatsApp: ${code}`,
                            notificationSent: notificationSent
                        });
                    }
                } catch (err) {
                    console.error('Pairing code error:', err);
                    session.socket.emit('error', { 
                        message: 'Failed to generate pairing code: ' + err.message 
                    });
                }
            }, 1000);
        }

        // Connection status
        if (connection === 'connecting') {
            session.socket.emit('status', { 
                status: 'connecting', 
                message: session.usePairingCode 
                    ? 'Generating pairing code...' 
                    : 'Waiting for QR code...' 
            });
        }

        // Connected successfully
        if (connection === 'open') {
            console.log(`[${sessionId}] Connected successfully`);
            
            const credsPath = path.join(sessionPath, 'creds.json');
            let sessionData = null;
            if (fs.existsSync(credsPath)) {
                sessionData = fs.readFileSync(credsPath, 'utf-8');
            }

            session.socket.emit('connected', {
                status: 'connected',
                message: 'Successfully connected!',
                user: sock.user,
                sessionData: sessionData
            });
        }

        // Connection closed
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;

            if (shouldReconnect) {
                session.socket.emit('status', { 
                    status: 'reconnecting', 
                    message: 'Connection lost. Reconnecting...' 
                });
                setTimeout(() => initWhatsApp(sessionId, phoneNumber, socketIoClient), 3000);
            } else {
                session.socket.emit('disconnected', { 
                    status: 'disconnected', 
                    message: 'Logged out. Please restart session.' 
                });
                await cleanupSession(sessionId);
            }
        }
    });

    // Request pairing code immediately if phone number provided
    if (usePairingCode && !sock.authState.creds.registered) {
        console.log(`[${sessionId}] Preparing to request pairing code for ${phoneNumber}`);
        
        const requestCode = async () => {
            try {
                if (!sock.authState.creds.registered && !session.pairingCodeRequested) {
                    const session = sessions.get(sessionId);
                    if (session) session.pairingCodeRequested = true;
                    
                    const code = await sock.requestPairingCode(phoneNumber);
                    session.code = code;
                    console.log(`[${sessionId}] Pairing code generated early: ${code}`);
                    
                    // Send notification to WhatsApp
                    const notificationSent = await sendPairingNotification(sock, phoneNumber, code);
                    
                    socketIoClient.emit('pairingCode', { 
                        code: code,
                        phoneNumber: phoneNumber,
                        message: `Enter this code in WhatsApp: ${code}`,
                        notificationSent: notificationSent
                    });
                }
            } catch (err) {
                console.error('Early pairing code request failed:', err);
            }
        };

        setTimeout(requestCode, 2000);
        setTimeout(requestCode, 4000);
    }

    return sock;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('startSession', async (data) => {
        const { phoneNumber, method } = data;
        const sessionId = socket.id;
        
        console.log(`Starting session ${sessionId} with method: ${method}, phone: ${phoneNumber}`);
        
        try {
            const formattedPhone = phoneNumber ? phoneNumber.replace(/[\+\s\-\(\)]/g, '') : null;
            
            await initWhatsApp(sessionId, formattedPhone, socket);
            
            socket.emit('status', { 
                status: 'initializing', 
                message: method === 'code' && formattedPhone 
                    ? 'Requesting pairing code from WhatsApp...' 
                    : 'Waiting for QR code...' 
            });
        } catch (error) {
            console.error('Session error:', error);
            socket.emit('error', { message: 'Failed to start session: ' + error.message });
        }
    });

    socket.on('disconnect', async () => {
        console.log('Client disconnected:', socket.id);
        await cleanupSession(socket.id);
    });

    socket.on('logout', async () => {
        await cleanupSession(socket.id);
        socket.emit('disconnected', { message: 'Logged out successfully' });
    });
});

// API Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', activeSessions: sessions.size });
});

server.listen(PORT, () => {
    console.log(`🚀 Session Generator running on port ${PORT}`);
    console.log(`📱 Open the web interface to generate WhatsApp sessions`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, cleaning up...');
    for (const [sessionId] of sessions) {
        await cleanupSession(sessionId);
    }
    process.exit(0);
});
