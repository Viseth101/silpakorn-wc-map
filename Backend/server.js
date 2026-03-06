require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

// IMPORTANT: Middleware to read POST request bodies
app.use(express.json());

app.use(express.static(path.join(__dirname, "../Frontend")));

// ENDPOINT 1: Send the API Key to the frontend safely
app.get("/api/config", (req, res) => {
  res.json({
    mapsApiKey: process.env.GOOGLE_API_KEY, // Ensure this matches your .env key name
  });
});

// ENDPOINT 2: Send the location data from places_data.json
app.get("/api/data", (req, res) => {
  const dataPath = path.join(__dirname, "places_data.json");
  fs.readFile(dataPath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading places_data.json:", err);
      return res.status(500).json({ error: "Failed to load map data" });
    }
    res.json(JSON.parse(data));
  });
});

// ENDPOINT 3: Receive new place submission and save to pending_places.json
app.post("/api/submit-place", (req, res) => {
  const newPlace = req.body;
  const pendingPath = path.join(__dirname, "pending_places.json");

  // Add a timestamp and status for admin review purposes
  newPlace.id = Date.now();
  newPlace.status = "pending";
  newPlace.submittedAt = new Date().toISOString();

  // Read the existing pending places file (or create empty array if it doesn't exist)
  fs.readFile(pendingPath, "utf8", (err, data) => {
    let pendingList = [];

    if (!err && data) {
      try {
        pendingList = JSON.parse(data);
      } catch (parseErr) {
        console.error("Error parsing pending list", parseErr);
      }
    }

    // Add the new submission to the list
    pendingList.push(newPlace);

    // Save it back to the file
    fs.writeFile(
      pendingPath,
      JSON.stringify(pendingList, null, 2),
      (writeErr) => {
        if (writeErr) {
          console.error("Error saving pending place:", writeErr);
          return res.status(500).json({ error: "Failed to save submission" });
        }
        res.json({ success: true, message: "Place submitted successfully." });
      },
    );
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
