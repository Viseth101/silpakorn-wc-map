require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

// Set port
const PORT = process.env.PORT || 5000;

// Serve static files from the 'frontend' folder
app.use(express.static(path.join(__dirname, '../frontend')));

// ENDPOINT 1: Send the API Key to the frontend safely
app.get('/api/config', (req, res) => {
    res.json({
        mapsApiKey: process.env.GOOGLE_API_KEY // Ensure this matches your .env key name
    });
});

// ENDPOINT 2: Send the location data (from Phase 2)
app.get('/api/data', (req, res) => {
    // For now, sending a simple mock. Later you'll read your data.json here
    res.json([
        { name: "Silpakorn University", lat: 13.8194, lng: 100.0425, date: "2026-03-05", price: 0 }
    ]);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});