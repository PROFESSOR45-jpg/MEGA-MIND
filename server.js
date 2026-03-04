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
    // Clear auth folder
    const sessionPath = `${SESSION_DIR}_${sessionId}`;
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }
}

// Initialize WhatsApp Socket
async function initWhatsApp(sessionId, phoneNumber = null, socketIoClient) {
    const sessionPath = `${SESSION_DIR}_${sessionId}`;
    const usePairingCode = !!phoneNumber; // Determine if we should use pairing code
    
    // Cleanup existing session
    await cleanupSession(sessionId);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // Always false, we handle QR manually if needed
        logger: P({ level: 'silent' }),
        browser: Browsers.ubuntu('MEGA MIND Session'),
        syncFullHistory: false,
        // For pairing code, we need to mark this as a pairing attempt
        markOnlineOnConnect: false
    });

    sessions.set(sessionId, { 
        sock, 
        socket: socketIoClient, 
        phoneNumber,
        usePairingCode,
        pairingCodeRequested: false 
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
            
            // Small delay to ensure connection is ready
            setTimeout(async () => {
                try {
                    if (!sock.authState.creds.registered) {
                        const code = await sock.requestPairingCode(session.phoneNumber);
                        console.log(`[${sessionId}] Pairing code generated: ${code}`);
                        session.socket.emit('pairingCode', { 
                            code: code,
                            phoneNumber: session.phoneNumber,
                            message: `Enter this code in WhatsApp: ${code}`
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
            
            // Get session data
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

    // Alternative: Request pairing code immediately if phone number provided
    // This is a more aggressive approach that tries to request code before QR event
    if (usePairingCode && !sock.authState.creds.registered) {
        console.log(`[${sessionId}] Preparing to request pairing code for ${phoneNumber}`);
        
        // Wait for socket to be ready, then request code
        const requestCode = async () => {
            try {
                if (!sock.authState.creds.registered && !session.pairingCodeRequested) {
                    const session = sessions.get(sessionId);
                    if (session) session.pairingCodeRequested = true;
                    
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log(`[${sessionId}] Pairing code generated early: ${code}`);
                    socketIoClient.emit('pairingCode', { 
                        code: code,
                        phoneNumber: phoneNumber,
                        message: `Enter this code in WhatsApp: ${code}`
                    });
                }
            } catch (err) {
                console.error('Early pairing code request failed:', err);
                // Will fallback to QR event handler
            }
        };

        // Try multiple times with increasing delays
        setTimeout(requestCode, 2000);
        setTimeout(requestCode, 4000);
    }

    return sock;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('startSession', async (data) => {
        const { phoneNumber, method } = data; // method: 'qr' or 'code'
        const sessionId = socket.id;
        
        console.log(`Starting session ${sessionId} with method: ${method}, phone: ${phoneNumber}`);
        
        try {
            // Format phone number if provided (remove +, spaces, -)
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
