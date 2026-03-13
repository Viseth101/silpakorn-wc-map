# <img src="Frontend/assets/silpakorn-icon.png" alt="Silpakorn Logo" width="45" height="45" align="top"> Silpakorn University Sanam Chan Bathroom Map

![MySQL](https://img.shields.io/badge/mysql-%2300f.svg?style=for-the-badge&logo=mysql&logoColor=white)
![Cloudinary](https://img.shields.io/badge/Cloudinary-3448C5?style=for-the-badge&logo=Cloudinary&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![Google Maps API](https://img.shields.io/badge/Google%20Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white)

A full-stack, production-ready mapping application designed to help the Silpakorn University community locate restrooms across campus. Built with a focus on accessibility and modern cloud architecture, the application features a **stateless backend**, a **relational 3NF database**, and **automated cloud image processing**.

> **Cloud‑ready architecture:** By offloading data to MySQL and images to Cloudinary, this application is entirely stateless. The server can be redeployed or restarted on platforms like Railway without any data loss.

---

## ✨ Key Features

* **🌍 Multilingual UI:** Seamlessly switch between English, Thai, Chinese, and Khmer. Features a dynamic typography engine that applies the professional 'Battambang' Google Font specifically for Khmer rendering.
* **📍 Live Tracking & Smart Directory:** Utilizes `navigator.geolocation.watchPosition()` to track users in real-time, actively updating UI distances and allowing dynamic sorting by "Nearest" (via Haversine formula) as they walk.
* **📸 Stateless Cloud Storage:** User-submitted images are automatically processed, optimized via `sharp`, and stored on **Cloudinary**, ensuring permanent availability.
* **🛡️ Secure Admin Dashboard:** A password-protected interface allowing administrators to review, edit, approve, or reject user-submitted places directly on a live map view.
* **💎 Glassmorphism Design:** A modern UI inspired by iOS/iPadOS, featuring high-blur vibrancy, deep saturation, and 0.45 opacity for maximum readability over map layers.
* **🔒 Security:** Uses `helmet` to secure the app by setting various HTTP headers and `express-rate-limit` to prevent brute-force attacks.

---

## 🛠️ Architecture & Database Design

The application utilizes a **Third Normal Form (3NF)** relational schema to ensure academic and professional data integrity standards.

### Database Normalization (3NF)
By splitting data into two tables, the system avoids "Repeating Groups" and allows for infinite language expansion:
* **`restrooms`**: Stores universal data (lat/lng, operating hours, access type, Cloudinary image URLs).
* **`restroom_translations`**: A table linked via Foreign Key storing names and notes mapped to language codes (`en`, `th`, `cn`, `kh`).

---

## 📂 Project Structure

The project is cleanly separated into Frontend and Backend directories:

```text
Silpakorn-WC-Map/
├── Backend/
│   ├── server.js                # Express server with MySQL Pool & Cloudinary logic
│   └── .env                     # Environment variables (Ignored by Git)
├── Frontend/
│   ├── index.html               # Main client-side map UI
│   ├── admin.html               # Admin Dashboard UI
│   ├── styles.css               # iOS-style Glassmorphism UI
│   ├── script.js                # Client-side map initialization and filtering
│   ├── utils.js                 # Shared logic (Role checking, distance calculations)
│   └── assets/                  # Static UI icons & logos
└── package.json                 # Project configuration
```

---

## 🚀 Installation & Setup

To run this project, you will need **Node.js** installed and a **Google Maps API Key**.

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/Silpakorn-WC-Map.git
cd Silpakorn-WC-Map
```

### 2. Install dependencies
```bash
npm install
```
If you encounter peer dependency issues, you can try:
```bash
npm install --legacy-peer-deps
```

### 3. Environment Setup
Create a `.env` file inside the `/Backend` directory. Required values:
```ini
PORT=3000
GOOGLE_API_KEY=your_google_maps_api_key_here
DATABASE_URL=mysql://user:pass@host:port/database
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
ADMIN_PASSWORD=your_secure_admin_password
```

### 4. Start the server
```bash
# This will install backend dependencies and start the server
npm start
```

### 5. View the app
Open your browser and navigate to `http://localhost:3000`.
To access the admin panel, navigate to `http://localhost:3000/admin.html`.

---

## ⚙️ Technical Highlights

* **Atomic Transactions:** Uses MySQL transactions (`beginTransaction`, `commit`, `rollback`) to ensure that restrooms and their translations are either saved perfectly together or not at all.
* **Memory Management:** The system is entirely stateless; no images or data points are stored on the local disk, making it 100% compatible with modern containerized environments.
* **DRY Principles:** Shared business logic (access role checks and distance calculations) is extracted into `utils.js` to ensure the Client Map and Admin Dashboard behave identically.

---

## 👨‍💻 Author

Developed as a Computer Science project by an international student at Silpakorn University.
