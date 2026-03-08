# 📍 Silpakorn Campus Resource Map

A full-stack, multilingual interactive map application designed for students and staff at Silpakorn University (Sanam Chandra Palace Campus). This project allows users to find campus facilities, view real-time operating status, and contribute new locations via an admin-moderated system.

## 🚀 Technical Features

### 🗺️ Frontend & API Integration
* **Google Maps JavaScript API**: Custom-styled map interface with a strict campus boundary restriction.
* **Google Places API**: Integrated Autocomplete for seamless facility searching and location verification.
* **Multilingual Support**: Real-time UI translation for **English, Thai, and Chinese**.
* **Dynamic UI**: 
    * Markers change color in real-time based on system time (Open/Closed).
    * Responsive design optimized for both desktop and mobile devices (tested for 412x915px).
    * Custom SVG markers with high-visibility shadows.
* **Geolocation**: Native HTML5 Geolocation integration to find user position relative to campus facilities.

### ⚙️ Backend & Security
* **Node.js & Express**: Lightweight RESTful API handling data requests and admin operations.
* **Data Persistence**: JSON-based flat-file database system for locations (`wcList.json`) and user submissions (`pending_places.json`).
* **Input Sanitization**: Server-side protection against XSS attacks by stripping malicious HTML tags.
* **Toast Notifications**: Custom-built asynchronous notification system for non-blocking user feedback.

### 🛡️ Admin CMS
* **Secure Dashboard**: Password-protected portal for campus administrators.
* **Moderation Loop**: Full CRUD capabilities allowing admins to:
    * Preview user-submitted markers on a dedicated admin map.
    * Approve or reject new facility submissions.
    * Edit existing facility details (Name, Hours, Access, Notes) directly in the UI.

## 🛠️ Installation & Setup

1.  **Clone the repository** and navigate to the project folder.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure environment variables**:
    Create a `.env` file in the root directory and add your Google Maps API Key:
    ```env
    GOOGLE_API_KEY=your_api_key_here
    ADMIN_PASSWORD=admin123
    ```
4.  **Start the server**:
    ```bash
    node server.js
    ```
5.  **Access the application**:
    * **User Map**: `http://localhost:3000`
    * **Admin Dashboard**: `http://localhost:3000/admin.html`

## 📂 Project Structure
* `server.js`: Node.js backend logic and API routes.
* `Frontend/`:
    * `index.html`: Main map interface.
    * `admin.html`: Secure administrative dashboard.
    * `script.js`: Core frontend logic, API calls, and map rendering.
    * `styles.css`: consolidated, responsive styling and animations.
    * `languages.json`: Translation strings for i18n support.
* `Backend/`:
    * `wcList.json`: Master database of campus locations.
    * `pending_places.json`: Temporary storage for user submissions.

---
Created for **Course 517 242 (Web Development)** - Silpakorn University.
By  670710259 Mr. Udtarakviseth Lay
    670710258 Mr. Sokea Sothea