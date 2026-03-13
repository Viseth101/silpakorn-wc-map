// === imports & configuration ===
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs").promises;
const fsSync = require("fs"); 
const path = require("path");
const helmet = require("helmet");

const app = express();

// === rate limiting ===
const rateLimit = require("express-rate-limit");
const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: { error: "Too many submissions from this IP. Please try again in 15 minutes." }
});

// === filesystem constants ===
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "Database");
const ASSET_DIR = path.join(DATA_DIR, "place_data_asset");

if (!fsSync.existsSync(ASSET_DIR)) {
    fsSync.mkdirSync(ASSET_DIR, { recursive: true });
}

// === file upload setup ===
const storage = multer.diskStorage({
    destination: ASSET_DIR,
    filename: (req, file, cb) => {
        let base = Date.now().toString();
        if (req.body.title) {
            base = req.body.title;
        } else if (req.body.names) {
            try {
                const namesObj = JSON.parse(req.body.names);
                if (namesObj && namesObj.en) base = namesObj.en;
            } catch {}
        }
        base = base.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const ext = path.extname(file.originalname) || "";
        const filename = `${base}-${Date.now()}${ext}`;
        cb(null, filename);
    },
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// === middleware ===
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(express.json());

const FRONTEND_PATH = process.env.FRONTEND_PATH ? path.resolve(process.env.FRONTEND_PATH) : path.join(__dirname, "..", "Frontend");
console.log('Serving frontend from', FRONTEND_PATH);
if (!fsSync.existsSync(FRONTEND_PATH)) {
    console.warn('WARNING: frontend path does not exist; check your FRONTEND_PATH or deploy the frontend folder inside the container');
}

app.use(express.static(FRONTEND_PATH));
app.use("/place_data_asset", express.static(ASSET_DIR));

// === utility helpers ===
const CAMPUS_BOUNDS = { south: 13.812, north: 13.825, west: 100.034, east: 100.047 };

function isWithinCampus(lat, lng) {
    return (lat >= CAMPUS_BOUNDS.south && lat <= CAMPUS_BOUNDS.north && lng >= CAMPUS_BOUNDS.west && lng <= CAMPUS_BOUNDS.east);
}

function sanitizeInput(str) {
    if (!str || typeof str !== 'string') {
        if (typeof str === 'number') return str.toString();
        return ""; // Failsafe: if it's an object or undefined, return empty string instead of crashing
    }
    return str.replace(/[&<>'"]/g, (tag) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"})[tag]);
}

async function readJSON(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        if (!content || content.trim() === "") return []; 
        return JSON.parse(content);
    } catch (e) {
        if (e.code === 'ENOENT') return []; 
        console.error(`\n🚨 ERROR reading ${filePath}. Returning empty array to prevent crash.`, e);
        return []; 
    }
}

async function writeJSON(filePath, data) {
    const tempPath = `${filePath}.tmp`;
    try {
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
        await fs.rename(tempPath, filePath);
    } catch (err) {
        console.error(`Failed to write JSON to ${filePath}`, err);
        throw err;
    }
}

const ALL_LANGS = ["en", "cn", "kh", "th"];

function checkAccessRole(accessText) {
    if (!accessText) return "all";
    const text = accessText.toLowerCase();
    const staffTerms = ["staff", "เฉพาะบุคลากร", "仅限员工", "បុគ្គលិក", "บุคลากรเท่านั้น", "พนักงาน"];
    const studentTerms = ["student", "students only", "student only", "เฉพาะนักศึกษา", "นักศึกษาเท่านั้น", "นักศึกษา", "仅限学生", "សម្រាប់តែសិស្ស", "សិស្ស"];
    
    if (staffTerms.some(term => text.includes(term.toLowerCase()))) return "staff";
    if (studentTerms.some(term => text.includes(term.toLowerCase()))) return "student";
    return "all";
}

async function getNextId() {
    const approved = await readJSON(path.join(DATA_DIR, "place_data.json"));
    const pending = await readJSON(path.join(DATA_DIR, "pending_places.json"));
    const allIds = [...approved.map(p => p.id || 0), ...pending.map(p => p.id || 0)];
    return allIds.length > 0 ? Math.max(...allIds) + 1 : 1;
}

// === Endpoints ===
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.get("/api/config", (req, res) => { 
    res.json({ mapsApiKey: process.env.GOOGLE_API_KEY }); 
});

app.post("/api/admin-login", (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) res.json({ success: true });
    else res.status(401).json({ success: false, error: "Incorrect password" });
});

app.get("/wc", async (req, res) => {
    try {
        const lang = req.query.lang || "en";
        const safeLang = ALL_LANGS.includes(lang) ? lang : "en";

        const dataPath = path.join(DATA_DIR, "place_data.json");
        const allPlaces = await readJSON(dataPath);

        const approvedPlaces = allPlaces.map((place) => {
            const accessType = place.accessType || "all";
            return {
                id: place.id,
                building: place.building?.[safeLang] || "",
                operatingHours: typeof place.operatingHours === "object" ? place.operatingHours[safeLang] || place.operatingHours.en || "" : place.operatingHours || "",
                notes: place.notes?.[safeLang] || "",
                accessType, lat: place.lat, lng: place.lng, img: place.img,
            };
        });

        const pendingPath = path.join(DATA_DIR, "pending_places.json");
        const pendingData = await readJSON(pendingPath);

        const formattedPending = pendingData.map((p) => {
            let buildingText = "Pending Place";
            if (p.building && typeof p.building === "object") buildingText = p.building[safeLang] || p.building.en || buildingText;
            else if (p.names && typeof p.names === "object") buildingText = p.names[safeLang] || p.names.en || buildingText;
            else if (typeof p.building === "string") buildingText = p.building;
            
            return {
                id: p.id, building: buildingText, operatingHours: p.operatingHours || "Not specified",
                notes: p.note || "", accessType: p.accessType || "all", lat: p.lat, lng: p.lng, img: p.img, isPending: true,
            };
        });

        res.json(approvedPlaces.concat(formattedPending));
    } catch (err) {
        res.status(500).json({ error: "Server error fetching map data." });
    }
});

app.get("/api/pending", async (req, res) => {
    try { 
        res.json(await readJSON(path.join(DATA_DIR, "pending_places.json"))); 
    } catch (err) { 
        res.status(500).json({ error: "Failed to fetch pending places." }); 
    }
});

app.get("/api/all-places", async (req, res) => {
    try {
        const dataPath = path.join(DATA_DIR, "place_data.json");
        const allPlaces = await readJSON(dataPath);

        const merged = allPlaces.map((place) => {
            const normalizedAccessType = place.accessType || checkAccessRole(place.access || "");
            return {
                ...place,
                names: { en: place.building.en, cn: place.building.cn, kh: place.building.kh, th: place.building.th },
                operatingHours: typeof place.operatingHours === "object" ? place.operatingHours.en : place.operatingHours,
                accessType: normalizedAccessType, access: normalizedAccessType,
                notes: typeof place.notes === "object" ? place.notes.en : place.notes,
            };
        });
        res.json(merged);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch all places." });
    }
});

app.post("/api/submit-place", submitLimiter, upload.single('image'), async (req, res) => {
    try {
        const openTime = sanitizeInput(req.body.openTime);
        const access = sanitizeInput(req.body.access) || "ALL (Staff & Students)";
        const note = sanitizeInput(req.body.note) || "";
        let { lat, lng } = req.body;

        lat = parseFloat(lat); lng = parseFloat(lng);

        if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "Invalid coordinates" });
        if (!isWithinCampus(lat, lng)) return res.status(400).json({ error: "Location must be within campus bounds" });

        const namesObj = req.body.names ? JSON.parse(req.body.names) : { en: req.body.title || "Unnamed" };
        const safeEn = sanitizeInput(namesObj.en);
        
        const building = { 
            en: safeEn, 
            th: sanitizeInput(namesObj.th) || safeEn, 
            cn: sanitizeInput(namesObj.cn) || safeEn, 
            kh: sanitizeInput(namesObj.kh) || safeEn 
        };

        const accessType = checkAccessRole(access);
        let imgPath = req.file ? "/place_data_asset/" + req.file.filename : "";

        const pendingPath = path.join(DATA_DIR, "pending_places.json");
        let pendingPlaces = await readJSON(pendingPath);
        const nextId = await getNextId(); 

        pendingPlaces.push({
            id: nextId, building, operatingHours: openTime, accessType, note, img: imgPath, isPending: true, lat, lng
        });

        await writeJSON(pendingPath, pendingPlaces);
        res.status(200).json({ message: "Place saved and marked as pending!" });
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to submit place" });
    }
});

app.post("/api/approve", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
        const { id } = req.body;
        const pendingPath = path.join(DATA_DIR, "pending_places.json"); 
        let pending = await readJSON(pendingPath);
        const placeToApprove = pending.find((p) => p.id === id);

        if (placeToApprove) {
            const dataPath = path.join(DATA_DIR, "place_data.json");
            let places = await readJSON(dataPath);

            // BULLETPROOF NAME EXTRACTION: Handles both new Objects and legacy Strings perfectly
            let finalNames = { en: "Unnamed WC", th: "Unnamed WC", cn: "Unnamed WC", kh: "Unnamed WC" };
            if (placeToApprove.building && typeof placeToApprove.building === 'object') {
                finalNames = { ...finalNames, ...placeToApprove.building };
            } else if (placeToApprove.names && typeof placeToApprove.names === 'object') {
                finalNames = { ...finalNames, ...placeToApprove.names };
            } else if (typeof placeToApprove.building === 'string') {
                finalNames = { en: placeToApprove.building, th: placeToApprove.building, cn: placeToApprove.building, kh: placeToApprove.building };
            }

            const newPlace = {
                id: placeToApprove.id, 
                lat: parseFloat(placeToApprove.lat), 
                lng: parseFloat(placeToApprove.lng),
                ...(placeToApprove.img && !placeToApprove.img.toLowerCase().includes("default") && { img: placeToApprove.img }),
                building: { 
                    en: sanitizeInput(finalNames.en), 
                    cn: sanitizeInput(finalNames.cn), 
                    kh: sanitizeInput(finalNames.kh), 
                    th: sanitizeInput(finalNames.th) 
                },
                operatingHours: sanitizeInput(placeToApprove.operatingHours || ""), 
                notes: sanitizeInput(placeToApprove.note || placeToApprove.notes || ""),
                accessType: checkAccessRole(sanitizeInput(placeToApprove.access || placeToApprove.accessType || "")),
            };

            places.push(newPlace);
            await writeJSON(dataPath, places);

            pending = pending.filter((p) => p.id !== id);
            await writeJSON(pendingPath, pending);

            res.status(200).json({ message: "Approved and added to database!" });
        } else {
            res.status(404).json({ error: "Pending place not found." });
        }
    } catch (err) { 
        console.error("Approve error:", err);
        res.status(500).json({ error: "Server error during approval." }); 
    }
});

app.post("/api/reject", async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
        const { id } = req.body;
        const pendingPath = path.join(DATA_DIR, "pending_places.json");
        const approvedPath = path.join(DATA_DIR, "place_data.json");
        
        let pending = await readJSON(pendingPath);
        let approved = await readJSON(approvedPath);
        
        let placeToDelete = pending.find((p) => p.id === id);
        let isPending = true;

        if (!placeToDelete) {
            placeToDelete = approved.find((p) => p.id === id);
            isPending = false;
        }

        if (!placeToDelete) return res.status(404).json({ error: "Place not found in database." });

        if (isPending) {
            pending = pending.filter((p) => p.id !== id);
            await writeJSON(pendingPath, pending);
        } else {
            approved = approved.filter((p) => p.id !== id);
            await writeJSON(approvedPath, approved);
        }

        if (placeToDelete.img) {
            const fileName = path.basename(placeToDelete.img);
            if (fileName && fileName !== "Default_img.png") {
                const imgPath = path.join(ASSET_DIR, fileName);
                fs.unlink(imgPath).catch(err => console.error("Failed to delete image:", err));
            }
        }

        res.status(200).json({ message: "Place successfully deleted from database." });
    } catch (err) { res.status(500).json({ error: "Server error during deletion." }); }
});

app.post("/api/edit-place", upload.single('image'), async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
        const { id, names, operatingHours, access, note, lat, lng } = req.body;
        const namesObj = typeof names === 'string' ? JSON.parse(names) : names; 
        const safeEn = sanitizeInput(namesObj.en);
        const finalNames = { en: safeEn, cn: sanitizeInput(namesObj.cn) || safeEn, kh: sanitizeInput(namesObj.kh) || safeEn, th: sanitizeInput(namesObj.th) || safeEn };

        const dataPath = path.join(DATA_DIR, "place_data.json");
        let places = await readJSON(dataPath);
        const index = places.findIndex((p) => p.id === parseInt(id));

        if (index !== -1) {
            places[index].building = finalNames;
            places[index].operatingHours = sanitizeInput(operatingHours);
            places[index].accessType = checkAccessRole(sanitizeInput(access));
            places[index].notes = sanitizeInput(note);
            if (lat !== undefined) places[index].lat = parseFloat(lat);
            if (lng !== undefined) places[index].lng = parseFloat(lng);
            
            if (req.file) {
                if (places[index].img) {
                    const oldFileName = path.basename(places[index].img);
                    if (oldFileName && oldFileName !== "Default_img.png") {
                        fs.unlink(path.join(ASSET_DIR, oldFileName)).catch(e => {});
                    }
                }
                places[index].img = "/place_data_asset/" + req.file.filename;
            }
            await writeJSON(dataPath, places);
        }

        const pendingPath = path.join(DATA_DIR, "pending_places.json");
        let pending = await readJSON(pendingPath);
        const pIndex = pending.findIndex((p) => p.id === parseInt(id));
        if (pIndex !== -1) {
            pending[pIndex].building = finalNames;
            pending[pIndex].operatingHours = sanitizeInput(operatingHours);
            pending[pIndex].accessType = checkAccessRole(sanitizeInput(access));
            pending[pIndex].note = sanitizeInput(note);
            if (lat !== undefined) pending[pIndex].lat = parseFloat(lat);
            if (lng !== undefined) pending[pIndex].lng = parseFloat(lng);
            
            if (req.file) {
                if (pending[pIndex].img) {
                    const oldFileName = path.basename(pending[pIndex].img);
                    if (oldFileName && oldFileName !== "Default_img.png") {
                        fs.unlink(path.join(ASSET_DIR, oldFileName)).catch(e => {});
                    }
                }
                pending[pIndex].img = "/place_data_asset/" + req.file.filename;
            }
            await writeJSON(pendingPath, pending);
        }

        res.status(200).json({ message: "Place updated successfully." });
    } catch (err) { res.status(500).json({ error: "Server error during edit." }); }
});

app.post("/api/admin-add-place", upload.single('image'), async (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    try {
        const { names, operatingHours, access, note, lat, lng } = req.body;
        const namesObj = typeof names === 'string' ? JSON.parse(names) : names; 
        const safeEn = sanitizeInput(namesObj.en);
        const finalNames = { en: safeEn, cn: sanitizeInput(namesObj.cn) || safeEn, kh: sanitizeInput(namesObj.kh) || safeEn, th: sanitizeInput(namesObj.th) || safeEn };

        let imgPath = req.file ? "/place_data_asset/" + req.file.filename : "";

        const dataPath = path.join(DATA_DIR, "place_data.json");
        let places = await readJSON(dataPath);
        const nextId = await getNextId();

        places.push({
            id: nextId, lat: parseFloat(lat), lng: parseFloat(lng), building: finalNames,
            operatingHours: sanitizeInput(operatingHours), accessType: checkAccessRole(sanitizeInput(access)),
            notes: sanitizeInput(note) || "", img: imgPath,
        });

        await writeJSON(dataPath, places);
        res.status(200).json({ message: "Place added to database!" });
    } catch (err) { res.status(500).json({ error: "Server error adding place." }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });