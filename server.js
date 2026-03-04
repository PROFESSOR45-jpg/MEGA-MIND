const express = require('express');
const app = express();

// Simple test first
app.get('/', (req, res) => {
    res.send('<h1>MEGA MIND Session Generator</h1><p>Server is running!</p>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on port', PORT);
});
