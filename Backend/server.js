require("dotenv").config();
const express = require("express");
const cors = require("cors");
// use promise-based fs so we can await reads/writes
const fs = require("fs").promises;
const path = require("path");
const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../Frontend")));
app.use("/image", express.static(path.join(__dirname, "image")));

// simple campus boundary used for coordinate validation
const CAMPUS_BOUNDS = { south: 13.812, north: 13.825, west: 100.034, east: 100.047 };
function isWithinCampus(lat, lng) {
  return (
    lat >= CAMPUS_BOUNDS.south &&
    lat <= CAMPUS_BOUNDS.north &&
    lng >= CAMPUS_BOUNDS.west &&
    lng <= CAMPUS_BOUNDS.east
  );
}

function sanitizeInput(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, (tag) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"})[tag]);
}

// promise-based JSON helpers, swallow errors and return empty array by default
async function readJSON(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        return JSON.parse(content);
    } catch (e) {
        return [];
    }
}
async function writeJSON(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

const ALL_LANGS = ["en", "cn", "kh", "th"];

function detectLanguage(text) {
    if (/[\u1780-\u17FF]/.test(text)) return 'kh'; 
    if (/[\u0E00-\u0E7F]/.test(text)) return 'th'; 
    if (/[\u4E00-\u9FFF]/.test(text)) return 'cn'; 
    return 'en'; 
}

function checkAccessRole(accessText) {
    if (!accessText) return "all";
    const text = accessText.toLowerCase();
    
    // Normalize Thai text for better matching
    // Common staff indicators across languages
    const staffTerms = [
        "staff", 
        "เฉพาะบุคลากร",
        "仅限员工", 
        "សម្រាប់តែបុគ្គលិក",
        "บุคลากรเท่านั้น",
        "พนักงาน"
    ];
    
    // Common student indicators - MATCHING script.js exactly
    const studentTerms = [
        "student",
        "students only",
        "student only",
        "เฉพาะนักศึกษา",           // Exact Thai term in database
        "นักศึกษาเท่านั้น",        // Alternative Thai form
        "นักศึกษา",               // Simplified Thai
        "仅限学生",               // Chinese
        "សម្រាប់តែសិស្ស",        // Khmer
        "សិស្ស"                   // Khmer alternative
    ];
    
    // Check staff first (higher priority)
    if (staffTerms.some(term => text.includes(term.toLowerCase()))) {
        return "staff";
    }
    
    // Then check student
    if (studentTerms.some(term => text.includes(term.toLowerCase()))) {
        return "student";
    }
    
    // Default is all access
    return "all";
}

app.get("/api/config", (req, res) => {
  res.json({ mapsApiKey: process.env.GOOGLE_API_KEY });
});

// NEW: Combines approved places with pending places for the public map
app.get("/wc", async (req, res) => {
    const lang = req.query.lang || "en";
    const safeLang = ALL_LANGS.includes(lang) ? lang : "en";

    // approved
    const dataPath = path.join(__dirname, "Database", "place_data.json");
    const allPlaces = await readJSON(dataPath);

    const approvedPlaces = allPlaces.map((place) => ({
        id: place.id,
        building: place.building?.[safeLang] || "",
        operatingHours: place.operatingHours?.[safeLang] || "",
        notes: place.notes?.[safeLang] || "",
        access: place.access?.[safeLang] || "",
        lat: place.lat,
        lng: place.lng,
        img: place.img,
    }));

    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    const pendingData = await readJSON(pendingPath);

    const formattedPending = pendingData.map((p) => {
        let buildingText = "Pending Place";
        if (p.names && typeof p.names === "object") {
            buildingText = p.names[safeLang] || p.names.en || buildingText;
        } else if (typeof p.building === "string") {
            buildingText = p.building;
        }
        return {
            id: p.id,
            building: buildingText,
            operatingHours: p.operatingHours || "Not specified",
            notes: p.note || "",
            access: p.access || "All",
            lat: p.lat,
            lng: p.lng,
            img: p.img,
            isPending: true,
        };
    });

    res.json(approvedPlaces.concat(formattedPending));
});

app.post("/api/submit-place", async (req, res) => {
    const rawTitle = sanitizeInput(req.body.title);
    const openTime = sanitizeInput(req.body.openTime);
    const access = sanitizeInput(req.body.access) || "ALL (Staff & Students)";
    const note = sanitizeInput(req.body.note) || "";
    let { lat, lng } = req.body;

    lat = parseFloat(lat);
    lng = parseFloat(lng);

    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Invalid coordinates" });
    }
    if (!isWithinCampus(lat, lng)) {
        return res.status(400).json({ error: "Location must be within campus bounds" });
    }

    const detectedLang = detectLanguage(rawTitle);
    const names = { en: rawTitle, th: rawTitle, cn: rawTitle, kh: rawTitle };

    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pendingPlaces = await readJSON(pendingPath);

    const approvedPath = path.join(__dirname, "Database", "place_data.json");
    const approvedPlaces = await readJSON(approvedPath);
    const nextId = approvedPlaces.length
        ? Math.max(...approvedPlaces.map((p) => p.id || 0)) + 1
        : 1;

    pendingPlaces.push({
        id: nextId,
        names,
        operatingHours: openTime,
        access,
        note,
        isPending: true,
        lat,
        lng,
        detectedLang,
    });

    await writeJSON(pendingPath, pendingPlaces);
    res.status(200).json({ message: "Place saved and marked as pending!" });
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.post("/api/admin-login", (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ success: false, error: "Incorrect password" });
});

app.get("/api/pending", async (req, res) => {
    const pending = await readJSON(path.join(__dirname, "Database", "pending_places.json"));
    res.json(pending);
});

app.get("/api/all-places", async (req, res) => {
    const dataPath = path.join(__dirname, "Database", "place_data.json");
    const allPlaces = await readJSON(dataPath);

    const merged = allPlaces.map((place) => ({
        ...place,
        names: {
            en: place.building.en,
            cn: place.building.cn,
            kh: place.building.kh,
            th: place.building.th,
        },
        operatingHours:
            typeof place.operatingHours === "object"
                ? place.operatingHours.en
                : place.operatingHours,
        access:
            typeof place.access === "object" ? place.access.en : place.access,
        notes:
            typeof place.notes === "object" ? place.notes.en : place.notes,
    }));
    res.json(merged);
});

app.post("/api/approve", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.body;

    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pending = await readJSON(pendingPath);
    const placeToApprove = pending.find((p) => p.id === id);

    if (placeToApprove) {
        const dataPath = path.join(__dirname, "Database", "place_data.json");
        let places = await readJSON(dataPath);

        const names = placeToApprove.names || {
            en: placeToApprove.building || "Unnamed WC",
            th: placeToApprove.building || "Unnamed WC",
            cn: placeToApprove.building || "Unnamed WC",
            kh: placeToApprove.building || "Unnamed WC",
        };

        const newPlace = {
            id: placeToApprove.id,
            lat: parseFloat(placeToApprove.lat),
            lng: parseFloat(placeToApprove.lng),
            ...(placeToApprove.img && { img: placeToApprove.img }),
            building: {
                en: sanitizeInput(names.en || names.en),
                cn: sanitizeInput(names.cn || names.en),
                kh: sanitizeInput(names.kh || names.en),
                th: sanitizeInput(names.th || names.en),
            },
            operatingHours: {
                en: sanitizeInput(placeToApprove.operatingHours || ""),
                cn: sanitizeInput(placeToApprove.operatingHours || ""),
                kh: sanitizeInput(placeToApprove.operatingHours || ""),
                th: sanitizeInput(placeToApprove.operatingHours || ""),
            },
            notes: {
                en: sanitizeInput(placeToApprove.note || ""),
                cn: sanitizeInput(placeToApprove.note || ""),
                kh: sanitizeInput(placeToApprove.note || ""),
                th: sanitizeInput(placeToApprove.note || ""),
            },
            access: {
                en: sanitizeInput(placeToApprove.access || "All"),
                cn: sanitizeInput(placeToApprove.access || "所有人"),
                kh: sanitizeInput(placeToApprove.access || "សាធារណៈ"),
                th: sanitizeInput(placeToApprove.access || "ทุกคน"),
            },
        };

        places.push(newPlace);
        await writeJSON(dataPath, places);

        pending = pending.filter((p) => p.id !== id);
        await writeJSON(pendingPath, pending);

        res.status(200).json({ message: "Approved and added to database!" });
    } else {
        res.status(404).json({ error: "Pending place not found." });
    }
});

app.post("/api/reject", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD)
        return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.body;

    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pending = await readJSON(pendingPath);
    pending = pending.filter((p) => p.id !== id);
    await writeJSON(pendingPath, pending);

    res.status(200).json({ message: "Rejection removed from pending." });
});

app.post("/api/edit-place", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD)
        return res.status(401).json({ error: "Unauthorized" });
    const { id, names, operatingHours, access, note, lat, lng } = req.body;

    const safeEn = sanitizeInput(names.en);
    const finalNames = {
        en: safeEn,
        cn: sanitizeInput(names.cn) || safeEn,
        kh: sanitizeInput(names.kh) || safeEn,
        th: sanitizeInput(names.th) || safeEn,
    };

    const dataPath = path.join(__dirname, "Database", "place_data.json");
    let places = await readJSON(dataPath);
    const index = places.findIndex((p) => p.id === id);

    if (index !== -1) {
        places[index].building = finalNames;
        places[index].operatingHours = {
            en: sanitizeInput(operatingHours),
            cn: sanitizeInput(operatingHours),
            kh: sanitizeInput(operatingHours),
            th: sanitizeInput(operatingHours),
        };
        places[index].access = {
            en: sanitizeInput(access),
            cn: sanitizeInput(access),
            kh: sanitizeInput(access),
            th: sanitizeInput(access),
        };
        places[index].notes = {
            en: sanitizeInput(note),
            cn: sanitizeInput(note),
            kh: sanitizeInput(note),
            th: sanitizeInput(note),
        };
        if (lat !== undefined) places[index].lat = parseFloat(lat);
        if (lng !== undefined) places[index].lng = parseFloat(lng);
        await writeJSON(dataPath, places);
    }

    const pendingPath = path.join(__dirname, "Database", "pending_places.json");
    let pending = await readJSON(pendingPath);
    const pIndex = pending.findIndex((p) => p.id === id);
    if (pIndex !== -1) {
        pending[pIndex].names = finalNames;
        pending[pIndex].operatingHours = sanitizeInput(operatingHours);
        pending[pIndex].access = sanitizeInput(access);
        pending[pIndex].note = sanitizeInput(note);
        if (lat !== undefined) pending[pIndex].lat = parseFloat(lat);
        if (lng !== undefined) pending[pIndex].lng = parseFloat(lng);
        await writeJSON(pendingPath, pending);
    }

    res.status(200).json({ message: "Place updated successfully." });
});

app.post("/api/admin-add-place", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD)
        return res.status(401).json({ error: "Unauthorized" });
    const { names, operatingHours, access, note, lat, lng } = req.body;

    const safeEn = sanitizeInput(names.en);
    const finalNames = {
        en: safeEn,
        cn: sanitizeInput(names.cn) || safeEn,
        kh: sanitizeInput(names.kh) || safeEn,
        th: sanitizeInput(names.th) || safeEn,
    };

    const dataPath = path.join(__dirname, "Database", "place_data.json");
    let places = await readJSON(dataPath);
    const nextId = places.length
        ? Math.max(...places.map((p) => p.id || 0)) + 1
        : 1;

    places.push({
        id: nextId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        building: finalNames,
        operatingHours: {
            en: sanitizeInput(operatingHours),
            cn: sanitizeInput(operatingHours),
            kh: sanitizeInput(operatingHours),
            th: sanitizeInput(operatingHours),
        },
        access: {
            en: sanitizeInput(access) || "All",
            cn: sanitizeInput(access) || "所有人",
            kh: sanitizeInput(access) || "សាធារណៈ",
            th: sanitizeInput(access) || "ทุกคน",
        },
        notes: {
            en: sanitizeInput(note) || "",
            cn: sanitizeInput(note) || "",
            kh: sanitizeInput(note) || "",
            th: sanitizeInput(note) || "",
        },
    });

    await writeJSON(dataPath, places);
    res.status(200).json({ message: "Place added to database!" });
});

app.listen(3000, () => { console.log("Server is running on port 3000"); });