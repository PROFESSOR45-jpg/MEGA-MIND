/**
 * MEGA MIND SESSION GENERATOR v3.0
 * ©PROFESSOR DARK TECH©
 * Web-based QR & Pairing Code Generator
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const qrcode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSION_FOLDER = './session';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active sockets and their WhatsApp connections
const activeSessions = new Map();

// Clean HTML Interface
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MEGA MIND SESSION GENERATOR | ©PROFESSOR DARK TECH©</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Courier New', monospace;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
            min-height: 100vh;
            color: #00ff88;
            overflow-x: hidden;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            text-align: center;
            padding: 40px 20px;
            border-bottom: 2px solid #00ff88;
            margin-bottom: 30px;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.1), transparent);
            animation: scan 3s infinite;
        }

        @keyframes scan {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .logo {
            font-size: 2.5rem;
            font-weight: bold;
            text-shadow: 0 0 20px #00ff88;
            margin-bottom: 10px;
            letter-spacing: 3px;
        }

        .subtitle {
            color: #888;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 5px;
        }

        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 30px;
        }

        .method-selector {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            justify-content: center;
            width: 100%;
        }

        .method-btn {
            background: linear-gradient(145deg, #1a1a2e, #0f0f1a);
            border: 2px solid #00ff88;
            color: #00ff88;
            padding: 30px 50px;
            font-size: 1.2rem;
            font-family: 'Courier New', monospace;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            min-width: 250px;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .method-btn:hover {
            background: #00ff88;
            color: #0a0a0a;
            box-shadow: 0 0 30px rgba(0, 255, 136, 0.5);
            transform: translateY(-2px);
        }

        .method-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: 0.5s;
        }

        .method-btn:hover::before {
            left: 100%;
        }

        .method-btn.active {
            background: #00ff88;
            color: #0a0a0a;
        }

        .method-btn.disabled {
            opacity: 0.5;
            cursor: not-allowed;
            pointer-events: none;
        }

        .display-area {
            width: 100%;
            max-width: 500px;
            min-height: 400px;
            background: rgba(0, 0, 0, 0.6);
            border: 2px solid #00ff88;
            border-radius: 10px;
            padding: 30px;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
            box-shadow: 0 0 30px rgba(0, 255, 136, 0.1);
        }

        .display-area.active {
            display: flex;
        }

        .loading {
            text-align: center;
        }

        .spinner {
            width: 60px;
            height: 60px;
            border: 4px solid #00ff88;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .qr-container {
            text-align: center;
        }

        .qr-code {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            display: inline-block;
        }

        .qr-code img {
            max-width: 300px;
            width: 100%;
            height: auto;
        }

        .pairing-container {
            text-align: center;
            width: 100%;
        }

        .phone-input {
            background: rgba(0, 255, 136, 0.1);
            border: 2px solid #00ff88;
            color: #00ff88;
            padding: 15px 20px;
            font-size: 1.2rem;
            font-family: 'Courier New', monospace;
            width: 100%;
            max-width: 300px;
            margin-bottom: 20px;
            text-align: center;
            outline: none;
        }

        .phone-input::placeholder {
            color: #00ff8866;
        }

        .submit-btn {
            background: #00ff88;
            color: #0a0a0a;
            border: none;
            padding: 15px 40px;
            font-size: 1rem;
            font-family: 'Courier New', monospace;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 2px;
            transition: all 0.3s;
        }

        .submit-btn:hover {
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.5);
            transform: scale(1.05);
        }

        .code-display {
            font-size: 3rem;
            font-weight: bold;
            color: #00ff88;
            text-shadow: 0 0 20px #00ff88;
            letter-spacing: 10px;
            margin: 20px 0;
            padding: 20px;
            background: rgba(0, 0, 0, 0.8);
            border: 2px solid #00ff88;
        }

        .instructions {
            color: #888;
            font-size: 0.9rem;
            margin-top: 20px;
            line-height: 1.6;
        }

        .instructions strong {
            color: #00ff88;
        }

        .session-id {
            background: rgba(0, 255, 136, 0.1);
            border: 1px solid #00ff88;
            padding: 20px;
            margin-top: 20px;
            word-break: break-all;
            font-size: 0.8rem;
            color: #00ff88;
            max-height: 150px;
            overflow-y: auto;
        }

        .copy-btn {
            background: transparent;
            border: 1px solid #00ff88;
            color: #00ff88;
            padding: 10px 20px;
            margin-top: 10px;
            cursor: pointer;
            font-family: 'Courier New', monospace;
            transition: all 0.3s;
        }

        .copy-btn:hover {
            background: #00ff88;
            color: #0a0a0a;
        }

        .status {
            padding: 10px 20px;
            margin: 10px 0;
            border-radius: 5px;
            font-size: 0.9rem;
        }

        .status.error {
            background: rgba(255, 0, 0, 0.2);
            border: 1px solid #ff0000;
            color: #ff6666;
        }

        .status.success {
            background: rgba(0, 255, 136, 0.2);
            border: 1px solid #00ff88;
            color: #00ff88;
        }

        .status.info {
            background: rgba(0, 136, 255, 0.2);
            border: 1px solid #0088ff;
            color: #66ccff;
        }

        .footer {
            text-align: center;
            padding: 30px;
            border-top: 2px solid #00ff88;
            margin-top: 30px;
            color: #00ff88;
            font-size: 0.9rem;
            letter-spacing: 3px;
            text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
        }

        .footer::before {
            content: '©';
            margin-right: 5px;
        }

        .hidden {
            display: none !important;
        }

        @media (max-width: 600px) {
            .logo { font-size: 1.8rem; }
            .method-btn { min-width: 200px; padding: 20px 30px; }
            .code-display { font-size: 2rem; letter-spacing: 5px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">MEGA MIND</div>
            <div class="subtitle">Session Generator v3.0</div>
        </div>

        <div class="main-content">
            <div class="method-selector" id="methodSelector">
                <button class="method-btn" onclick="startQR()">
                    <div>📱 QR CODE</div>
                    <small style="font-size: 0.7rem; display: block; margin-top: 10px;">Scan with WhatsApp</small>
                </button>
                <button class="method-btn" onclick="startPairing()">
                    <div>🔢 PAIRING CODE</div>
                    <small style="font-size: 0.7rem; display: block; margin-top: 10px;">8-Digit Code</small>
                </button>
            </div>

            <!-- QR Display Area -->
            <div class="display-area" id="qrArea">
                <div class="loading" id="qrLoading">
                    <div class="spinner"></div>
                    <p>Initializing WhatsApp Connection...</p>
                </div>
                <div class="qr-container hidden" id="qrContent">
                    <h3 style="margin-bottom: 20px; color: #00ff88;">Scan with WhatsApp</h3>
                    <div class="qr-code" id="qrImage"></div>
                    <div class="instructions">
                        <strong>How to scan:</strong><br>
                        1. Open WhatsApp on your phone<br>
                        2. Go to Settings → Linked Devices<br>
                        3. Tap "Link a Device"<br>
                        4. Point camera at QR code
                    </div>
                    <div class="session-id hidden" id="qrSession"></div>
                    <button class="copy-btn hidden" id="qrCopyBtn" onclick="copySession('qrSession')">Copy Session ID</button>
                </div>
            </div>

            <!-- Pairing Display Area -->
            <div class="display-area" id="pairingArea">
                <div class="pairing-container" id="pairingInput">
                    <h3 style="margin-bottom: 20px; color: #00ff88;">Enter Phone Number</h3>
                    <input type="text" class="phone-input" id="phoneNumber" placeholder="+1234567890" maxlength="15">
                    <div class="instructions" style="margin-bottom: 20px;">
                        Include country code (e.g., +1 for USA)
                    </div>
                    <button class="submit-btn" onclick="submitPhone()">Get Pairing Code</button>
                    <div class="status hidden" id="phoneStatus"></div>
                </div>
                
                <div class="loading hidden" id="pairingLoading">
                    <div class="spinner"></div>
                    <p>Requesting pairing code from WhatsApp...</p>
                </div>

                <div class="pairing-container hidden" id="pairingResult">
                    <h3 style="margin-bottom: 20px; color: #00ff88;">Your Pairing Code</h3>
                    <div class="code-display" id="pairingCode">--------</div>
                    <div class="instructions">
                        <strong>How to use:</strong><br>
                        1. Open WhatsApp → Settings → Linked Devices<br>
                        2. Tap "Link with phone number instead"<br>
                        3. Enter the 8-digit code above<br>
                        <strong style="color: #ff6666;">⚠️ Code expires in 2 minutes!</strong>
                    </div>
                    <div class="session-id hidden" id="pairingSession"></div>
                    <button class="copy-btn hidden" id="pairingCopyBtn" onclick="copySession('pairingSession')">Copy Session ID</button>
                </div>
            </div>
        </div>

        <div class="footer">
            PROFESSOR DARK TECH
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentMethod = null;

        function resetUI() {
            // Hide all areas
            document.getElementById('qrArea').classList.remove('active');
            document.getElementById('pairingArea').classList.remove('active');
            
            // Reset buttons
            document.querySelectorAll('.method-btn').forEach(btn => {
                btn.classList.remove('active', 'disabled');
            });
            
            // Reset content
            document.getElementById('qrLoading').classList.remove('hidden');
            document.getElementById('qrContent').classList.add('hidden');
            document.getElementById('qrSession').classList.add('hidden');
            document.getElementById('qrCopyBtn').classList.add('hidden');
            
            document.getElementById('pairingInput').classList.remove('hidden');
            document.getElementById('pairingLoading').classList.add('hidden');
            document.getElementById('pairingResult').classList.add('hidden');
            document.getElementById('pairingSession').classList.add('hidden');
            document.getElementById('pairingCopyBtn').classList.add('hidden');
            document.getElementById('phoneNumber').value = '';
            hideStatus();
        }

        function disableButtons() {
            document.querySelectorAll('.method-btn').forEach(btn => {
                btn.classList.add('disabled');
            });
        }

        function startQR() {
            resetUI();
            currentMethod = 'qr';
            document.getElementById('qrArea').classList.add('active');
            document.querySelector('.method-btn:nth-child(1)').classList.add('active');
            disableButtons();
            
            socket.emit('start-session', { method: 'qr' });
        }

        function startPairing() {
            resetUI();
            currentMethod = 'pairing';
            document.getElementById('pairingArea').classList.add('active');
            document.querySelector('.method-btn:nth-child(2)').classList.add('active');
        }

        function submitPhone() {
            const phone = document.getElementById('phoneNumber').value.trim();
            
            if (!phone.match(/^\\+[1-9]\\d{1,14}$/)) {
                showStatus('Invalid phone number. Use format: +1234567890', 'error');
                return;
            }
            
            disableButtons();
            document.getElementById('pairingInput').classList.add('hidden');
            document.getElementById('pairingLoading').classList.remove('hidden');
            
            socket.emit('start-session', { method: 'pairing', phoneNumber: phone });
        }

        function showStatus(message, type) {
            const status = document.getElementById('phoneStatus');
            status.textContent = message;
            status.className = 'status ' + type;
            status.classList.remove('hidden');
        }

        function hideStatus() {
            document.getElementById('phoneStatus').classList.add('hidden');
        }

        function copySession(elementId) {
            const text = document.getElementById(elementId).textContent;
            navigator.clipboard.writeText(text).then(() => {
                alert('Session ID copied to clipboard!');
            });
        }

        // Socket events
        socket.on('qr', (data) => {
            if (currentMethod === 'qr') {
                document.getElementById('qrLoading').classList.add('hidden');
                document.getElementById('qrContent').classList.remove('hidden');
                document.getElementById('qrImage').innerHTML = '<img src="' + data.qr + '" alt="QR Code">';
            }
        });

        socket.on('pairing-code', (data) => {
            if (currentMethod === 'pairing') {
                document.getElementById('pairingLoading').classList.add('hidden');
                document.getElementById('pairingResult').classList.remove('hidden');
                document.getElementById('pairingCode').textContent = data.code;
            }
        });

        socket.on('session', (data) => {
            const sessionId = data.sessionId;
            if (currentMethod === 'qr') {
                document.getElementById('qrSession').textContent = sessionId;
                document.getElementById('qrSession').classList.remove('hidden');
                document.getElementById('qrCopyBtn').classList.remove('hidden');
            } else {
                document.getElementById('pairingSession').textContent = sessionId;
                document.getElementById('pairingSession').classList.remove('hidden');
                document.getElementById('pairingCopyBtn').classList.remove('hidden');
            }
        });

        socket.on('status', (data) => {
            console.log('Status:', data.message);
        });

        socket.on('error', (data) => {
            showStatus(data.message, 'error');
            // Re-enable buttons on error
            document.querySelectorAll('.method-btn').forEach(btn => {
                btn.classList.remove('disabled');
            });
        });

        socket.on('connected', () => {
            showStatus('Connected successfully! Session ID generated.', 'success');
        });
    </script>
</body>
</html>
  `);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let waSocket = null;
  let pairingCodeRequested = false;

  socket.on('start-session', async (data) => {
    const { method, phoneNumber } = data;
    const sessionId = socket.id;
    const sessionPath = `${SESSION_FOLDER}/${sessionId}`;

    try {
      // Clean previous session for this socket
      await fs.remove(sessionPath);
      await fs.ensureDir(sessionPath);

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      // Browser config based on method
      const browserConfig = method === 'pairing' 
        ? Browsers.macOS('Chrome')
        : ['MEGA MIND', 'Chrome', '3.0.0'];

      waSocket = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // We handle QR display via web
        auth: state,
        browser: browserConfig,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
      });

      activeSessions.set(sessionId, { socket: waSocket, method });

      // Connection update handler
      waSocket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Handle QR Code generation
        if (qr && method === 'qr') {
          try {
            const qrDataUrl = await qrcode.toDataURL(qr);
            socket.emit('qr', { qr: qrDataUrl });
            socket.emit('status', { message: 'QR Code generated. Scan with WhatsApp.' });
          } catch (err) {
            socket.emit('error', { message: 'Failed to generate QR code' });
          }
        }

        // Handle Pairing Code request
        if (method === 'pairing' && !pairingCodeRequested && !state.creds.registered) {
          if (connection === 'connecting' || qr) {
            pairingCodeRequested = true;
            
            try {
              // Clean phone number (remove + if present)
              const cleanPhone = phoneNumber.replace(/\+/g, '');
              
              // Delay to ensure socket is ready
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              const code = await waSocket.requestPairingCode(cleanPhone);
              
              socket.emit('pairing-code', { code });
              socket.emit('status', { message: 'Pairing code generated. Enter in WhatsApp.' });
            } catch (err) {
              console.error('Pairing code error:', err);
              socket.emit('error', { 
                message: 'Failed to get pairing code: ' + err.message 
              });
              cleanup(sessionId);
            }
          }
        }

        // Handle successful connection
        if (connection === 'open') {
          socket.emit('connected');
          socket.emit('status', { 
            message: `Connected as ${waSocket.user?.name || 'User'}` 
          });

          // Wait for credentials to stabilize
          await new Promise(r => setTimeout(r, 3000));

          try {
            const creds = await fs.readFile(`${sessionPath}/creds.json`, 'utf8');
            const sessionIdEncoded = Buffer.from(creds).toString('base64');
            
            socket.emit('session', { sessionId: sessionIdEncoded });
            socket.emit('status', { message: 'Session ID generated successfully!' });

            // Cleanup after a delay
            setTimeout(() => cleanup(sessionId), 10000);
          } catch (err) {
            socket.emit('error', { message: 'Failed to generate session ID' });
          }
        }

        // Handle disconnection
        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          
          if (statusCode === DisconnectReason.loggedOut) {
            socket.emit('error', { message: 'Session ended. Please try again.' });
            cleanup(sessionId);
          } else if (statusCode !== DisconnectReason.restartRequired) {
            socket.emit('error', { message: 'Connection lost. Please try again.' });
            cleanup(sessionId);
          }
        }
      });

      // Save credentials
      waSocket.ev.on('creds.update', saveCreds);

    } catch (err) {
      console.error('Session error:', err);
      socket.emit('error', { message: 'Internal error: ' + err.message });
      cleanup(sessionId);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    cleanup(socket.id);
  });

  function cleanup(sid) {
    const session = activeSessions.get(sid);
    if (session) {
      session.socket?.end?.();
      activeSessions.delete(sid);
    }
    fs.remove(`${SESSION_FOLDER}/${sid}`).catch(() => {});
  }
});

// Cleanup old sessions periodically
setInterval(() => {
  fs.readdir(SESSION_FOLDER).then(files => {
    files.forEach(file => {
      const sessionPath = path.join(SESSION_FOLDER, file);
      fs.stat(sessionPath).then(stat => {
        if (Date.now() - stat.mtime.getTime() > 3600000) { // 1 hour
          fs.remove(sessionPath);
        }
      });
    });
  }).catch(() => {});
}, 600000); // Every 10 minutes

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  MEGA MIND SESSION GENERATOR v3.0                 ║
║  ©PROFESSOR DARK TECH©                            ║
║                                                   ║
║  Server running on port ${PORT}                   ║
║  Open http://localhost:${PORT} in your browser    ║
╚═══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  
  // Close all WhatsApp connections
  for (const [id, session] of activeSessions) {
    session.socket?.end?.();
    await fs.remove(`${SESSION_FOLDER}/${id}`).catch(() => {});
  }
  
  server.close(() => {
    process.exit(0);
  });
});
