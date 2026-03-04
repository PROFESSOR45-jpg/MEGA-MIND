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
            h1 { font-size: 2.5rem; margin-bottom: 10px; }
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
            }
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
            }
            #qr img { max-width: 100%; }
            #session { 
                background: rgba(0,0,0,0.4); 
                padding: 25px; 
                border-radius: 20px; 
                margin-top: 25px;
                display: none;
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
            }
            .copy-btn {
                background: #28a745;
                padding: 12px 30px;
                border: none;
                border-radius: 25px;
                color: white;
                cursor: pointer;
                font-size: 16px;
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
                <div class="session-text" id="sessionText"></div>
                <button class="copy-btn" onclick="copySession()">📋 Copy</button>
            </div>
        </div>

        <script>
            async function startSession() {
                document.getElementById('startBtn').style.display = 'none';
                document.getElementById('loader').style.display = 'block';
                const status = document.getElementById('status');
                status.style.display = 'block';
                status.className = 'waiting';
                status.innerHTML = '⏳ Connecting...';
                
                try {
                    const res = await fetch('/start', { method: 'POST' });
                    const data = await res.json();
                    
                    if (data.error) throw new Error(data.error);
                    checkStatus();
                    
                } catch (err) {
                    document.getElementById('loader').style.display = 'none';
                    status.className = 'error';
                    status.innerHTML = '❌ ' + err.message;
                }
            }
            
            function checkStatus() {
                const interval = setInterval(async () => {
                    const res = await fetch('/status');
                    const data = await res.json();
                    
                    if (data.qr) {
                        document.getElementById('loader').style.display = 'none';
                        document.getElementById('qr').innerHTML = '<img src="' + data.qr + '">';
                        document.getElementById('qr').style.display = 'block';
                    }
                    
                    if (data.session) {
                        clearInterval(interval);
                        document.getElementById('qr').style.display = 'none';
                        document.getElementById('status').className = 'success';
                        document.getElementById('status').innerHTML = '✅ Connected!';
                        document.getElementById('sessionText').textContent = data.session;
                        document.getElementById('session').style.display = 'block';
                    }
                }, 2000);
            }
            
            async function copySession() {
                const text = document.getElementById('sessionText').textContent;
                await navigator.clipboard.writeText(text);
                alert('Copied!');
            }
        </script>
    </body>
    </html>
    `);
});

// FIXED: Use require instead of dynamic import
app.post('/start', async (req, res) => {
    if (sock) {
        return res.json({ error: 'Session already active' });
    }

    try {
        // Use require for CommonJS compatibility
        const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
        const QRCode = require('qrcode');
        const pino = require('pino');
        const fs = require('fs');
        const path = require('path');
        
        // Use /tmp for Render
        const authPath = '/tmp/session';
        
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();
        
        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['MEGA MIND Bot', 'Chrome', '1.0']
        });
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                console.log('QR generated');
                qrData = await QRCode.toDataURL(qr);
                status = 'qr_ready';
            }
            
            if (connection === 'open') {
                console.log('Connected!');
                status = 'connected';
                
                try {
                    const credsPath = path.join(authPath, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const creds = fs.readFileSync(credsPath);
                        sessionData = Buffer.from(creds).toString('base64');
                    }
                } catch (e) {
                    console.error('Error:', e);
                }
            }
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error:', error);
        status = 'error';
        res.json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json({ status, qr: qrData, session: sessionData });
});

const PORT = process.env.PORT
