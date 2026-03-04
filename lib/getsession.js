const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const pino = require('pino');

const logger = pino({ level: 'silent' });

async function generateSession() {
    console.log(`
    🔐 MEGA MIND - Local Session Generator
    
    This will generate a session for deploying to Render/Railway/Heroku
    `);

    const sessionPath = './temp_session';
    await fs.ensureDir(sessionPath);
    await fs.emptyDir(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: logger,
        browser: ['MEGA MIND Session', 'Chrome', '1.0.0']
    });

    return new Promise((resolve, reject) => {
        sock.ev.on('connection.update', async (update) => {
            const { connection, qr } = update;

            if (qr) {
                console.log('\n📱 Scan the QR code above with WhatsApp\n');
            }

            if (connection === 'open') {
                console.log('✅ Connected!');
                console.log(`👤 User: ${sock.user.name} (${sock.user.id})`);

                // Get credentials
                const creds = state.creds;
                const sessionString = Buffer.from(JSON.stringify(creds)).toString('base64');

                console.log('\n' + '='.repeat(60));
                console.log('🎉 SESSION GENERATED SUCCESSFULLY!');
                console.log('='.repeat(60));
                console.log('\n📋 Your SESSION_ID:');
                console.log(sessionString);
                console.log('\n💾 Session saved to: session.txt');
                
                await fs.writeFile('session.txt', sessionString);
                await fs.remove(sessionPath);

                console.log('\n⚙️  Add this to your environment variables:');
                console.log(`SESSION_ID=${sessionString.substring(0, 50)}...`);
                console.log('\n🚀 You can now deploy to Render!');
                
                resolve(sessionString);
                process.exit(0);
            }

            if (connection === 'close') {
                reject(new Error('Connection closed'));
            }
        });

        sock.ev.on('creds.update', saveCreds);
    });
}

generateSession().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
