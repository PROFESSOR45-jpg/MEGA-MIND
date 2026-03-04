<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MEGA MIND - WhatsApp Session Generator</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }

        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }

        .method-selector {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
        }

        .method-btn {
            flex: 1;
            padding: 15px;
            border: 2px solid #e0e0e0;
            background: white;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s;
            text-align: center;
            font-weight: 600;
        }

        .method-btn:hover {
            border-color: #667eea;
            transform: translateY(-2px);
        }

        .method-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        .method-btn i {
            font-size: 24px;
            display: block;
            margin-bottom: 5px;
        }

        .input-group {
            margin-bottom: 20px;
            display: none;
        }

        .input-group.active {
            display: block;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 600;
            font-size: 14px;
        }

        input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }

        .hint {
            font-size: 12px;
            color: #888;
            margin-top: 5px;
        }

        .start-btn {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .start-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }

        .start-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
            display: none;
        }

        .status.show {
            display: block;
        }

        .status.info {
            background: #e3f2fd;
            color: #1976d2;
        }

        .status.success {
            background: #e8f5e9;
            color: #388e3c;
        }

        .status.error {
            background: #ffebee;
            color: #c62828;
        }

        .qr-container {
            text-align: center;
            margin-top: 20px;
            display: none;
        }

        .qr-container.show {
            display: block;
        }

        .qr-container img {
            max-width: 250px;
            border: 10px solid white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            border-radius: 10px;
        }

        .pairing-code {
            text-align: center;
            margin-top: 20px;
            display: none;
        }

        .pairing-code.show {
            display: block;
        }

        .code-display {
            font-size: 48px;
            font-weight: bold;
            color: #667eea;
            letter-spacing: 10px;
            margin: 20px 0;
            font-family: 'Courier New', monospace;
            background: #f5f5f5;
            padding: 20px;
            border-radius: 10px;
            border: 2px dashed #667eea;
        }

        .session-data {
            margin-top: 20px;
            display: none;
        }

        .session-data.show {
            display: block;
        }

        textarea {
            width: 100%;
            height: 150px;
            padding: 10px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            resize: vertical;
        }

        .copy-btn {
            margin-top: 10px;
            padding: 10px 20px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 600;
        }

        .copy-btn:hover {
            background: #45a049;
        }

        .instructions {
            background: #fff3e0;
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
            font-size: 13px;
            color: #e65100;
        }

        .instructions ol {
            margin-left: 20px;
            margin-top: 10px;
        }

        .instructions li {
            margin-bottom: 5px;
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
            vertical-align: middle;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .logout-btn {
            margin-top: 10px;
            padding: 10px 20px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 MEGA MIND</h1>
        <p class="subtitle">WhatsApp Session Generator for Render</p>

        <div class="method-selector">
            <button class="method-btn active" onclick="selectMethod('qr')">
                <span>📷</span>
                QR Code
            </button>
            <button class="method-btn" onclick="selectMethod('code')">
                <span>🔢</span>
                Pairing Code
            </button>
        </div>

        <div id="qrSection" class="input-group active">
            <label>QR Code Method</label>
            <p class="hint">Scan the QR code with WhatsApp on your phone</p>
        </div>

        <div id="codeSection" class="input-group">
            <label for="phoneNumber">Phone Number</label>
            <input type="text" id="phoneNumber" placeholder="e.g., 1234567890 (with country code, no +)">
            <p class="hint">Enter your phone number with country code (e.g., 14155552671 for US)</p>
        </div>

        <button class="start-btn" onclick="startSession()">
            Start Session
        </button>

        <div id="status" class="status"></div>

        <div id="qrContainer" class="qr-container">
            <h3>Scan this QR Code</h3>
            <img id="qrImage" src="" alt="QR Code">
            <div class="instructions">
                <strong>How to scan:</strong>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap Menu (⋮) or Settings (⚙️)</li>
                    <li>Tap "Linked Devices"</li>
                    <li>Tap "Link a Device"</li>
                    <li>Point your camera at the QR code</li>
                </ol>
            </div>
        </div>

        <div id="pairingContainer" class="pairing-code">
            <h3>Your Pairing Code</h3>
            <div class="code-display" id="pairingCode">------</div>
            <div class="instructions">
                <strong>How to use:</strong>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap Menu (⋮) or Settings (⚙️)</li>
                    <li>Tap "Linked Devices"</li>
                    <li>Tap "Link with phone number instead"</li>
                    <li>Enter the code shown above</li>
                </ol>
            </div>
        </div>

        <div id="sessionData" class="session-data">
            <h3>✅ Session Connected!</h3>
            <p style="margin-bottom: 10px; color: #666;">Copy this session data and save it securely:</p>
            <textarea id="sessionText" readonly></textarea>
            <button class="copy-btn" onclick="copySession()">📋 Copy Session Data</button>
            <button class="logout-btn" onclick="logout()">🚪 Logout</button>
        </div>
    </div>

    <script>
        const socket = io();
        let currentMethod = 'qr';

        function selectMethod(method) {
            currentMethod = method;
            document.querySelectorAll('.method-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.input-group').forEach(group => group.classList.remove('active'));
            
            event.target.closest('.method-btn').classList.add('active');
            
            if (method === 'qr') {
                document.getElementById('qrSection').classList.add('active');
            } else {
                document.getElementById('codeSection').classList.add('active');
            }

            // Reset display
            hideAll();
        }

        function hideAll() {
            document.getElementById('qrContainer').classList.remove('show');
            document.getElementById('pairingContainer').classList.remove('show');
            document.getElementById('sessionData').classList.remove('show');
            document.getElementById('status').classList.remove('show');
        }

        function showStatus(message, type = 'info') {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = `status show ${type}`;
        }

        function startSession() {
            const btn = document.querySelector('.start-btn');
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            
            if (currentMethod === 'code' && !phoneNumber) {
                showStatus('Please enter your phone number', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="loading"></span>Initializing...';
            hideAll();
            showStatus('Initializing WhatsApp connection...', 'info');

            socket.emit('startSession', { 
                method: currentMethod,
                phoneNumber: phoneNumber 
            });
        }

        socket.on('qr', (data) => {
            document.getElementById('qrImage').src = data.qr;
            document.getElementById('qrContainer').classList.add('show');
            showStatus(data.message, 'info');
            resetButton();
        });

        socket.on('pairingCode', (data) => {
            document.getElementById('pairingCode').textContent = data.code;
            document.getElementById('pairingContainer').classList.add('show');
            showStatus(data.message, 'info');
            resetButton();
        });

        socket.on('status', (data) => {
            showStatus(data.message, 'info');
        });

        socket.on('connected', (data) => {
            showStatus(data.message, 'success');
            document.getElementById('sessionText').value = data.sessionData;
            document.getElementById('sessionData').classList.add('show');
            document.getElementById('qrContainer').classList.remove('show');
            document.getElementById('pairingContainer').classList.remove('show');
            resetButton();
        });

        socket.on('disconnected', (data) => {
            showStatus(data.message, 'error');
            hideAll();
            resetButton();
        });

        socket.on('error', (data) => {
            showStatus(data.message, 'error');
            resetButton();
        });

        function resetButton() {
            const btn = document.querySelector('.start-btn');
            btn.disabled = false;
            btn.textContent = 'Start Session';
        }

        function copySession() {
            const textarea = document.getElementById('sessionText');
            textarea.select();
            document.execCommand('copy');
            alert('Session data copied to clipboard!');
        }

        function logout() {
            socket.emit('logout');
            hideAll();
            showStatus('Logged out successfully', 'info');
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            socket.emit('logout');
        });
    </script>
</body>
</html>
