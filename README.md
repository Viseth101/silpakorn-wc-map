# <img src="Frontend/assets/silpakorn-icon.png" alt="Silpakorn Logo" width="45" height="45" align="top"> Silpakorn University Bathroom Map

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![Google Maps API](https://img.shields.io/badge/Google%20Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white)

A full-stack, interactive web mapping application designed to help the Silpakorn University community locate restrooms across campus. Built with a focus on accessibility, the application supports four languages and features an intuitive Admin Dashboard for community-driven data moderation.

> **Cloud‑ready architecture:** File paths, ports, and front-end locations are configurable via environment variables, allowing the server to run seamlessly in Docker containers or PaaS platforms. Local usage works out-of-the-box with default values.

---

## ✨ Key Features

* **🌍 Multilingual UI:** Seamlessly switch between English, Thai, Chinese, and Khmer. Features a dynamic typography engine that applies the professional 'Battambang' Google Font specifically for Khmer rendering.
* **📍 Live Tracking & Smart Directory:** A collapsible side-panel (desktop) and swipe-up bottom sheet (mobile) that displays all available restrooms. Utilizes `navigator.geolocation.watchPosition()` to track users in real-time, actively updating UI distances and allowing dynamic sorting by "Nearest" (via Haversine formula) as they walk.
* **🗺️ Interactive Custom Map:** Integrates the Google Maps JavaScript API with custom restricted bounds (locked to the university campus), custom SVG marker pins, and dark/satellite mode toggles.
* **🔍 Live Filtering & Search:** Users can filter locations dynamically based on specific criteria:
  * Access levels: *All (Staff & Students), Students Only, or Staff Only*.
  * Operating hours: *Open 24 hours or open within a specific user-defined time range*.
* **📸 Secure File Uploads:** Users can submit new locations with images. The backend uses `multer` to handle image uploads with strict MIME-type checking and a 5MB file size limit.
* **🛡️ Secure Admin Dashboard:** A password-protected interface allowing administrators to review, edit, approve, or reject user-submitted places directly on a live map view.
* **💾 Robust JSON Database Architecture:** Utilizes an atomic-write JSON file system (`place_data.json` & `pending_places.json`) to prevent data corruption and race conditions during simultaneous read/writes.

---

## 📂 Project Structure

The project is cleanly separated into Frontend and Backend directories:

```text
Silpakorn-WC-Map/
├── Backend/
│   ├── Database/
│   │   ├── place_data.json         # Approved production database
│   │   └── pending_places.json     # User submissions awaiting review
│   ├── place_data_asset/           # Directory for user-uploaded images
│   ├── package.json                # Backend dependencies
│   ├── server.js                   # Express server, API routes, and DB logic
│   └── .env                        # Environment variables (Ignored by Git)
├── Frontend/
│   ├── index.html                  # Main client-side map UI
│   ├── admin.html                  # Admin Dashboard UI
│   ├── styles.css                  # Global stylesheets & responsive media queries
│   ├── script.js                   # Client-side map initialization and filtering
│   ├── utils.js                    # Shared logic (Role checking, distance calculations)
│   ├── languages.json              # Multilingual dictionary
│   └── assets/                     # Static UI assets (icons, logos)
└── .gitignore
```

---

## 🚀 Installation & Setup

To run this project locally, you will need **Node.js** installed on your machine and a **Google Maps API Key** with the Maps JavaScript API and Places API enabled.

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/Silpakorn-WC-Map.git
cd Silpakorn-WC-Map
```

### 2. Install backend dependencies
```bash
cd Backend
npm install
```

### 3. Environment Setup
Create a `.env` file inside the `/Backend` directory or configure equivalent variables in your cloud environment. Required values:
```ini
PORT=3000
GOOGLE_API_KEY=your_google_maps_api_key_here
ADMIN_PASSWORD=your_secure_admin_password
```
*(Optional) Overrides useful for cloud container deployments:*
```ini
DATA_DIR=/path/to/volume/Database       # Where JSON and assets live
FRONTEND_PATH=/app/Frontend             # If static files are hosted elsewhere
```

### 4. Start the server
```bash
npm start
# or run with nodemon for development:
npm run dev
```

### 5. View the app
Open your browser and navigate to `http://localhost:3000`. 
To access the admin panel, navigate to `http://localhost:3000/admin.html`.

---

## ⚙️ Technical Highlights (For Developers)

* **DRY Principles:** Shared business logic (such as identifying access roles across four languages and calculating marker colors) is extracted into `utils.js` to ensure the Client Map and Admin Dashboard behave identically.
* **Memory Leak Prevention:** The backend file system module (`fs.unlink`) actively deletes orphaned image files from the server whenever an admin rejects a pending place or replaces an image.
* **Failsafe Parsing:** The `readJSON` helper includes robust error catching. If a database file is accidentally corrupted or emptied, it returns a blank array instead of crashing the Node server, preventing widespread outages.
* **Responsive State Management:** The frontend utilizes advanced CSS transitions, `max-height` calculations, and Javascript mutual exclusion logic to ensure floating action buttons (FABs), legend controls, and bottom-sheet drawers never overlap on mobile devices.

---

## 👨‍💻 Author

Developed as a Computer Science project by an international student at Silpakorn University.