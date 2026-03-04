
const express = require('express');
const app = express();
app.use(express.json());

// Global variables
let qrData = null;
let sessionData = null;
let status = 'idle';
let sock = null;

// Main page
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MEGA MIND Session</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Arial, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                color: white;
                text-align: center;
                padding: 20px;
            }
            .container { max-width: 500px; margin: 0 auto; padding-top: 30px; }
            h1 { font-size: 2.5rem; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
            .subtitle { opacity: 0.9; margin-bottom: 30px; }
            .btn { 
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                color: white; 
                border: none; 
                padding: 18px 40px; 
                border-radius: 50px; 
                cursor: pointer; 
                font-size: 18px;
                font-weight: bold;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                transition: transform 0.3s;
            }
            .btn:hover { transform: translateY(-3px); }
            .btn:disabled { opacity: 0.6; cursor: not-allowed; }
            #status { 
                margin: 25px 0; 
                padding: 15px; 
                border-radius: 15px; 
                font-weight: bold;
                display: none;
            }
            .waiting { background: rgba(255,193,7,0.3); border: 2px solid #ffc107; }
            .success { background: rgba(40,167,69,0.3); border: 2px solid #28a745; }
            .error { background: rgba(220,53,69,0.3); border: 2px solid #dc3545; }
            #qr { 
                margin: 20px auto; 
                background: white; 
                padding: 25px; 
                border-radius: 20px; 
                display: none;
                max-width: 320px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            #qr img { max-width: 100%; height: auto; }
            #session { 
                background: rgba(0,0,0,0.4); 
                padding: 25px; 
                border-radius: 20px; 
                margin-top: 25px;
                display: none;
                border: 2px solid #28a745;
            }
            .session-text {
                background: rgba(0,0,0,0.5);
                padding: 20px;
                border-radius: 10px;
                word-break: break-all;
                font-family: monospace;
                font-size: 12px;
                margin: 15px 0;
                max-height: 200px;
                overflow-y: auto;
                text-align: left;
                line-height: 1.6;
            }
            .copy-btn {
                background: #28a745;
                padding: 12px 30px;
                border: none;
                border-radius: 25px;
                color: white;
                cursor: pointer;
                font-size: 16px;
                margin-top: 10px;
            }
            .copy-btn:hover { background: #218838; }
            .warning {
                background: rgba(255,193,7,0.2);
                border: 1px solid #ffc107;
                padding: 15px;
                border-radius: 10px;
                margin-top: 20px;
                font-size: 14px;
            }
            .loader {
                display: none;
                width: 60px;
                height: 60px;
                border: 5px solid rgba(255,255,255,0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 30px auto;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 MEGA MIND</h1>
            <p class="subtitle">WhatsApp Session Generator</p>
            
            <button class="btn" id="startBtn" onclick="startSession()">
                🚀 Generate Session
            </button>
            
            <div class="loader" id="loader"></div>
            <div id="status"></div>
            
            <div id="qr"></div>
            
            <div id="session">
                <h3>✅ Session Generated!</h3>
                <p style="margin: 10px 0;">Copy this code to your .env file:</p>
                <div class="session-text" id="sessionText"></div>
                <button class="copy-btn" onclick="copySession()">📋 Copy to Clipboard</button>
                <div class="warning">
                    ⚠️ <strong>Security Warning:</strong><br>
                    Never share this session ID! It provides full access to your WhatsApp account.
                </div>
            </div>
        </div>

        <script>
            async function startSession() {
                const btn = document.getElementById('startBtn');
                const loader = document.getElementById('loader');
                const status = document.getElementById('status');
                
                btn.disabled = true;
                btn.style.display = 'none';
                loader.style.display = 'block';
                status.style.display = 'block';
                status.className = 'waiting';
                status.innerHTML = '⏳ Connecting to WhatsApp...';
                
                try {
                    const res = await fetch('/start', { method: 'POST' });
                    const data = await res.json();
                    
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    
                    // Start checking for QR
                    checkStatus();
                    
                } catch (err) {
                    loader.style.display = 'none';
                    status.className = 'error';
                    status.innerHTML = '❌ Error: ' + err.message;
                    btn.style.display = 'inline-block';
                    btn.disabled = false;
                }
            }
            
            function checkStatus() {
                const interval = setInterval(async () => {
                    try {
                        const res = await fetch('/status');
                        const data = await res.json();
                        
                        const status = document.getElementById('status');
                        const loader = document.getElementById('loader');
                        const qrDiv = document.getElementById('qr');
                        
                        if (data.qr && qrDiv.style.display === 'none') {
                            loader.style.display = 'none';
                            qrDiv.innerHTML = '<img src="' + data.qr + '" alt="QR Code">';
                            qrDiv.style.display = 'block';
                            status.className = 'waiting';
                            status.innerHTML = '📱 Scan this QR with WhatsApp!<br><small>Settings → Linked Devices → Link Device</small>';
                        }
                        
                        if (data.session) {
                            clearInterval(interval);
                            qrDiv.style.display = 'none';
                            status.className = 'success';
                            status.innerHTML = '✅ Connected Successfully!';
                            document.getElementById('sessionText').textContent = data.session;
                            document.getElementById('session').style.display = 'block';
                        }
                        
                        if (data.status === 'error') {
                            clearInterval(interval);
                            loader.style.display = 'none';
                            status.className = 'error';
                            status.innerHTML = '❌ Connection failed. Try again.';
                            document.getElementById('startBtn').style.display = 'inline-block';
                            document.getElementById('startBtn').disabled = false;
                        }
                        
                    } catch (e) {
                        console.error('Check error:', e);
                    }
                }, 2000);
            }
            
            async function copySession() {
                const text = document.getElementById('sessionText').textContent;
                try {
                    await navigator.clipboard.writeText(text);
                    const btn = document.querySelector('.copy-btn');
                    btn.textContent = '✅ Copied!';
                    setTimeout(() => btn.textContent = '📋 Copy to Clipboard', 2000);
                } catch (err) {
                    // Fallback
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    alert('Session copied!');
                }
            }
        </script>
    </body>
    </html>
    `);
});

// Start WhatsApp connection
app.post('/start', async (req, res) => {
    if (sock) {
        return res.json({ error: 'Session already active. Refresh page to reset.' });
    }

    try {
        // Import Baileys dynamically
        const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
        const QRCode = await import('qrcode');
        const pino = (await import('pino')).default;
        const fs = await import('fs');
        
        // Use /tmp for Render (writable)
        const authPath = process.env.RENDER ? '/tmp/session' : './session';
        
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();
        
        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['MEGA MIND Bot', 'Chrome', '1.0'],
            generateHighQualityLinkPreview: true
        });
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // QR Code ready
            if (qr) {
                console.log('QR generated');
                qrData = await QRCode.default.toDataURL(qr);
                status = 'qr_ready';
            }
            
            // Connected
            if (connection === 'open') {
                console.log('Connected!');
                status = 'connected';
                
                // Read session credentials
                try {
                    const credsPath = authPath + '/creds.json';
                    if (fs.existsSync(credsPath)) {
                        const creds = fs.readFileSync(credsPath);
                        sessionData = Buffer.from(creds).toString('base64');
                        console.log('Session saved');
                    }
                } catch (e) {
                    console.error('Error reading creds:', e);
                }
            }
            
            // Disconnected
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== 401; // 401 = logged out
                
                if (!shouldReconnect) {
                    status = 'error';
                    sock = null;
                }
            }
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        res.json({ success: true, message: 'Session started' });
        
    } catch (error) {
        console.error('Start error:', error);
        status = 'error';
        res.json({ error: error.message });
    }
});

// Check status
app.get('/status', (req, res) => {
    res.json({
        status: status,
        qr: qrData,
        session: sessionData
    });
});

// Reset
app.post('/reset', async (req, res) => {
    const fs = await import('fs');
    const authPath = process.env.RENDER ? '/tmp/session' : './session';
    
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
    }
    
    sock = null;
    qrData = null;
    sessionData = null;
    status = 'idle';
    
    res.json({ reset: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 MEGA MIND Session Generator running on port', PORT);
});
