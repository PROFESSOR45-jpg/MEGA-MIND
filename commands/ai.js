/**
 * AI commands — chat with an OpenAI-compatible model. Requires AI_API_KEY
 * (or OPENAI_API_KEY) to be set; otherwise replies with setup instructions
 * instead of failing silently.
 */

const axios = require('axios');

async function askAI(config, prompt) {
    const response = await axios.post(
        `${config.AI_BASE_URL}/chat/completions`,
        {
            model: config.AI_MODEL,
            messages: [{ role: 'user', content: prompt }]
        },
        {
            headers: {
                Authorization: `Bearer ${config.AI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }
    );
    return response.data?.choices?.[0]?.message?.content?.trim() || 'No response from the model.';
}

function requireKeyOrExplain(config) {
    if (config.AI_API_KEY) return null;
    return (
        `🤖 AI isn't configured yet.\n\n` +
        `Set *AI_API_KEY* (or *OPENAI_API_KEY*) in your .env or set.js to enable this, ` +
        `then optionally set *AI_MODEL* and *AI_BASE_URL* if you're using a different ` +
        `OpenAI-compatible provider.`
    );
}

module.exports = [
    {
        name: 'ai',
        aliases: ['ask', 'gpt', 'chatgpt'],
        category: 'ai',
        description: 'Ask the AI a question',
        cooldown: 5,
        handler: async ({ mega, m, config, args, argsText }) => {
            const missing = requireKeyOrExplain(config);
            if (missing) {
                await mega.reply(m, missing);
                return;
            }
            if (!argsText) {
                await mega.reply(m, `Usage: ${config.PREFIX}ai <your question>`);
                return;
            }
            try {
                const answer = await askAI(config, argsText);
                await mega.reply(m, `🤖 ${answer}`);
            } catch (err) {
                await mega.reply(m, `❌ AI request failed: ${err.response?.data?.error?.message || err.message}`);
            }
        }
    },
    {
        name: 'aimode',
        category: 'ai',
        description: 'Show or change the AI model in use',
        ownerOnly: true,
        handler: async ({ mega, m, config, args }) => {
            if (!args[0]) {
                await mega.reply(m, `Current AI model: *${config.AI_MODEL}*\nUsage: ${config.PREFIX}aimode <model-name>`);
                return;
            }
            config.AI_MODEL = args[0];
            await mega.reply(m, `✅ AI model set to *${config.AI_MODEL}*.`);
        }
    }
];
