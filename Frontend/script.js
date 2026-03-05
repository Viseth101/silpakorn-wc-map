// 1. Language State & Translations
let currentLang = "en";
let translations = {};

/**
 * Loads the translations.json file and updates the UI text
 */
async function loadTranslations() {
  try {
    const response = await fetch("languages.json");
    translations = await response.json();
    updatePageText();
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

/**
 * Finds all elements with [data-i18n] and replaces their text based on currentLang
 */
function updatePageText() {
  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (translations[currentLang] && translations[currentLang][key]) {
      el.innerText = translations[currentLang][key];
    }
  });
}

/**
 * Changes the language and updates the active state of UI buttons
 */
function changeLanguage(langCode) {
  currentLang = langCode;
  
  // Update button active states
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.remove("active");
    // This assumes your buttons have text like "TH", "EN", "CN"
    if (btn.innerText.toLowerCase() === langCode.toLowerCase()) {
      btn.classList.add("active");
    }
  });
  
  updatePageText();
}

/**
 * 2. App Initialization Logic
 * This fetches the API key from the backend and then loads Google Maps
 */
async function startApp() {
  // First, load your translations
  await loadTranslations();

  // Second, fetch the API Key from your Express server (.env)
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    if (!config.mapsApiKey) {
        throw new Error("API Key not found in backend response. Check your .env file.");
    }

    // Dynamically create and inject the Google Maps Script tag
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

  } catch (error) {
    console.error("Could not load Google Maps API key from backend:", error);
    // Optional: Show a message to the user on the screen if the map fails to load
  }
}

/**
 * 3. Map Initialization
 * This is the 'callback' function triggered by the Google Maps script
 */
function initMap() {
  const silpakornCoords = { lat: 13.8194, lng: 100.0425 };

  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 15.8,
    center: silpakornCoords,
    disableDefaultUI: true, // cleaner look
    zoomControl: true,      // allows users to zoom
  });

  // Basic marker for testing
  new google.maps.Marker({
    position: silpakornCoords,
    map: map,
    title: "Silpakorn University",
    animation: google.maps.Animation.DROP,
  });

  // Future Phase: You will add a fetch('/api/data') here to loop through 
  // your data.json and add multiple markers!
}

// Start the sequence when the window is ready
window.onload = startApp;