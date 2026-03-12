// === Imports & Configuration ===
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const path = require("path");
const fsSync = require("fs"); 

// 🌟 NEW: Cloudinary & MySQL packages
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const mysql = require("mysql2/promise");

const app = express();

// === Rate Limiting ===
const rateLimit = require("express-rate-limit");
const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: { error: "Too many submissions. Please try again later." }
});

// === Database Connection Pool ===
// A "Pool" keeps the connection alive and handles multiple users simultaneously!
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// === Cloudinary Setup ===
// Cloudinary automatically uses the CLOUDINARY_URL in your .env file
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "silpakorn_wc", // Creates a folder in your Cloudinary account
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [{ width: 1000, crop: "limit" }] // Automatically optimizes huge photos!
    },
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

// === Middleware ===
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());

const FRONTEND_PATH = process.env.FRONTEND_PATH ? path.resolve(process.env.FRONTEND_PATH) : path.join(__dirname, "..", "Frontend");
if (fsSync.existsSync(FRONTEND_PATH)) {
    app.use(express.static(FRONTEND_PATH));
}

// === Utility Helpers ===
const CAMPUS_BOUNDS = { south: 13.812, north: 13.835, west: 100.020, east: 100.060 };

function isWithinCampus(lat, lng) {
    return (lat >= CAMPUS_BOUNDS.south && lat <= CAMPUS_BOUNDS.north && lng >= CAMPUS_BOUNDS.west && lng <= CAMPUS_BOUNDS.east);
}

function sanitizeInput(str) {
    if (!str || typeof str !== 'string') return typeof str === 'number' ? str.toString() : "";
    return str.replace(/[&<>'"]/g, (tag) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"})[tag]);
}

function checkAccessRole(accessText) {
    if (!accessText) return "all";
    const text = accessText.toLowerCase();
    if (text.includes("staff")) return "staff";
    if (text.includes("student")) return "student";
    return "all";
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ==========================================
// API ENDPOINTS
// ==========================================

app.get("/api/config", (req, res) => { 
    res.json({ mapsApiKey: process.env.GOOGLE_API_KEY }); 
});

app.post("/api/admin-login", (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ success: false, error: "Incorrect password" });
});

// 🌟 1. GET ALL PLACES FOR THE CLIENT MAP
app.get("/wc", async (req, res) => {
    try {
        const lang = req.query.lang || "en";
        const safeLang = ["en", "cn", "kh", "th"].includes(lang) ? lang : "en";

        // SQL Magic: Joins the main table with the translations table, falling back to English if the requested language is missing!
        const query = `
            SELECT r.id, r.lat, r.lng, r.operating_hours, r.access_type, r.img_url, r.is_pending,
                   COALESCE(t1.name, t2.name) AS building,
                   COALESCE(t1.note, t2.note) AS notes
            FROM restrooms r
            LEFT JOIN restroom_translations t1 ON r.id = t1.restroom_id AND t1.language_code = ?
            LEFT JOIN restroom_translations t2 ON r.id = t2.restroom_id AND t2.language_code = 'en'
        `;
        
        const [rows] = await pool.query(query, [safeLang]);

        // Map it to match what your frontend script.js expects
        const mappedData = rows.map(row => ({
            id: row.id,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng),
            img: row.img_url || "",
            building: row.building || "Unknown WC",
            operatingHours: row.operating_hours,
            notes: row.notes || "",
            accessType: row.access_type,
            isPending: row.is_pending === 1
        }));

        res.json(mappedData);
    } catch (err) {
        console.error("Error fetching map data:", err);
        res.status(500).json({ error: "Server error fetching map data." });
    }
});

// 🌟 HELPER: Fetch grouped places for Admin Dashboard
async function fetchAdminPlaces(isPendingStatus) {
    const query = `
        SELECT r.id, r.lat, r.lng, r.operating_hours, r.access_type, r.img_url, 
               t.language_code, t.name, t.note
        FROM restrooms r
        LEFT JOIN restroom_translations t ON r.id = t.restroom_id
        WHERE r.is_pending = ?
    `;
    const [rows] = await pool.query(query, [isPendingStatus]);

    // Group the flat SQL rows back into nice JSON objects for the admin UI
    const placesMap = {};
    rows.forEach(row => {
        if (!placesMap[row.id]) {
            placesMap[row.id] = {
                id: row.id, lat: parseFloat(row.lat), lng: parseFloat(row.lng),
                operatingHours: row.operating_hours, accessType: row.access_type, img: row.img_url || "",
                names: {}, note: "" // We will use the English note for the admin display
            };
        }
        if (row.language_code) {
            placesMap[row.id].names[row.language_code] = row.name;
            if (row.language_code === 'en') placesMap[row.id].note = row.note;
        }
    });
    return Object.values(placesMap);
}

app.get("/api/pending", async (req, res) => {
    try { res.json(await fetchAdminPlaces(true)); } 
    catch (err) { res.status(500).json({ error: "Failed to fetch pending places." }); }
});

app.get("/api/all-places", async (req, res) => {
    try { res.json(await fetchAdminPlaces(false)); } 
    catch (err) { res.status(500).json({ error: "Failed to fetch all places." }); }
});

// 🌟 2. SUBMIT NEW PLACE (With Cloudinary!)
app.post("/api/submit-place", submitLimiter, upload.single('image'), async (req, res) => {
    const connection = await pool.getConnection(); // Get a dedicated connection for transactions
    try {
        await connection.beginTransaction();

        let { lat, lng } = req.body;
        lat = parseFloat(lat); lng = parseFloat(lng);
        if (isNaN(lat) || isNaN(lng) || !isWithinCampus(lat, lng)) {
            throw new Error("Invalid or out of bounds coordinates.");
        }

        const openTime = sanitizeInput(req.body.openTime);
        const accessType = checkAccessRole(req.body.access);
        const note = sanitizeInput(req.body.note);
        const namesObj = req.body.names ? JSON.parse(req.body.names) : { en: req.body.title || "Unnamed" };
        
        // 🚀 req.file.path is now a Cloudinary URL!
        const imgUrl = req.file ? req.file.path : "";

        // 1. Insert into Main Table
        const [result] = await connection.execute(
            `INSERT INTO restrooms (lat, lng, operating_hours, access_type, img_url, is_pending) VALUES (?, ?, ?, ?, ?, true)`,
            [lat, lng, openTime, accessType, imgUrl]
        );
        const newId = result.insertId;

        // 2. Insert Translations
        for (const [lang, name] of Object.entries(namesObj)) {
            if (name && name.trim() !== "") {
                const langNote = (lang === 'en') ? note : ""; // Attach note to English row for simplicity
                await connection.execute(
                    `INSERT INTO restroom_translations (restroom_id, language_code, name, note) VALUES (?, ?, ?, ?)`,
                    [newId, lang, sanitizeInput(name), langNote]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ message: "Place saved and marked as pending!" });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message || "Failed to submit place" });
    } finally {
        connection.release();
    }
});

// 🌟 3. ADMIN ENDPOINTS
app.post("/api/approve", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
        await pool.execute(`UPDATE restrooms SET is_pending = false WHERE id = ?`, [req.body.id]);
        res.status(200).json({ message: "Approved!" });
    } catch (err) { res.status(500).json({ error: "Server error during approval." }); }
});

app.post("/api/reject", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
        // Because we set ON DELETE CASCADE in the DB, this safely deletes the translations too!
        await pool.execute(`DELETE FROM restrooms WHERE id = ?`, [req.body.id]);
        res.status(200).json({ message: "Place successfully deleted." });
    } catch (err) { res.status(500).json({ error: "Server error during deletion." }); }
});

app.post("/api/edit-place", upload.single('image'), async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id, names, operatingHours, access, note, lat, lng } = req.body;
        
        // 1. Update Core Details
        let updateQuery = `UPDATE restrooms SET operating_hours=?, access_type=?`;
        let params = [sanitizeInput(operatingHours), checkAccessRole(access)];
        
        if (lat !== undefined && lng !== undefined) {
            updateQuery += `, lat=?, lng=?`;
            params.push(parseFloat(lat), parseFloat(lng));
        }
        if (req.file) {
            updateQuery += `, img_url=?`;
            params.push(req.file.path); // Save new Cloudinary URL
        }
        
        updateQuery += ` WHERE id=?`;
        params.push(id);
        
        await connection.execute(updateQuery, params);

        // 2. Wipe old translations and insert updated ones
        await connection.execute(`DELETE FROM restroom_translations WHERE restroom_id=?`, [id]);
        
        const namesObj = typeof names === 'string' ? JSON.parse(names) : names;
        for (const [lang, name] of Object.entries(namesObj)) {
            if (name && name.trim() !== "") {
                const langNote = (lang === 'en') ? sanitizeInput(note) : "";
                await connection.execute(
                    `INSERT INTO restroom_translations (restroom_id, language_code, name, note) VALUES (?, ?, ?, ?)`,
                    [id, lang, sanitizeInput(name), langNote]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ message: "Place updated successfully." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: "Server error during edit." }); 
    } finally {
        connection.release();
    }
});

app.post("/api/admin-add-place", upload.single('image'), async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        let { lat, lng } = req.body;
        const openTime = sanitizeInput(req.body.operatingHours);
        const accessType = checkAccessRole(req.body.access);
        const note = sanitizeInput(req.body.note);
        const imgUrl = req.file ? req.file.path : "";
        const namesObj = typeof req.body.names === 'string' ? JSON.parse(req.body.names) : req.body.names;

        const [result] = await connection.execute(
            `INSERT INTO restrooms (lat, lng, operating_hours, access_type, img_url, is_pending) VALUES (?, ?, ?, ?, ?, false)`,
            [parseFloat(lat), parseFloat(lng), openTime, accessType, imgUrl]
        );
        
        for (const [lang, name] of Object.entries(namesObj)) {
            if (name && name.trim() !== "") {
                const langNote = (lang === 'en') ? note : "";
                await connection.execute(
                    `INSERT INTO restroom_translations (restroom_id, language_code, name, note) VALUES (?, ?, ?, ?)`,
                    [result.insertId, lang, sanitizeInput(name), langNote]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ message: "Place added to database!" });
    } catch (err) { 
        await connection.rollback();
        res.status(500).json({ error: "Server error adding place." }); 
    } finally {
        connection.release();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });