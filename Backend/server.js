require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// 1. API CONFIG (For Frontend Google Maps)
// ==========================================
app.get("/api/config", (req, res) => {
  // Makes sure the frontend can still get the API key to load the map
  res.json({ mapsApiKey: process.env.GOOGLE_API_KEY });
});

// ==========================================
// 2. FETCH DATA (Teammate's New Endpoint)
// ==========================================
app.get('/wc', (req, res) => {
  const dataPath = path.join(__dirname, 'wcList.json');
  fs.readFile(dataPath, 'utf-8', (err, data) => {
    if (err) {
      console.error("Error reading wcList.json:", err);
      return res.status(500).json({ error: "Failed to load data" });
    }
    res.json(JSON.parse(data));
  });
});

// ==========================================
// 3. SUBMIT NEW PLACE (Adapted for new JSON)
// ==========================================
app.post("/api/submit-place", (req, res) => {
  const { title, lat, lng, openTime } = req.body;
  const dataPath = path.join(__dirname, 'wcList.json');

  fs.readFile(dataPath, "utf8", (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to read data" });
    
    const places = JSON.parse(data);
    
    // Map your frontend's payload to your teammate's new format!
    const newPlace = {
      id: places.length ? Math.max(...places.map(p => p.id)) + 1 : 1, // Auto-generates the next ID
      building: title,
      operatingHours: openTime,
      note: "User submitted - Pending review", // Default note
      floor: "N/A", // Default floor
      lat: lat,
      lng: lng
    };

    places.push(newPlace);

    // Save it back to wcList.json
    fs.writeFile(dataPath, JSON.stringify(places, null, 2), (err) => {
      if (err) return res.status(500).json({ error: "Failed to save place" });
      res.status(200).json({ message: "Place saved successfully!" });
    });
  });
});

// ==========================================
// 4. START SERVER
// ==========================================
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});