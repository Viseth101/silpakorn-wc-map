// ==========================================
// 1. GLOBAL STATE & VARIABLES
// ==========================================
let currentLang = "en";
let translations = {};
let map;
let allMarkers = [];
let infoWindow;
let activeMarker = null;
let draggableMarker = null;
let newPlaceCoords = null;
let centerChangeListener = null;

const silpakornCoords = { lat: 13.8188, lng: 100.0402 };
const campusBounds = {
  north: 13.825,
  south: 13.812,
  west: 100.034,
  east: 100.047,
};

// ==========================================
// 2. INITIALIZATION (APP BOOTSTRAP)
// ==========================================
window.onload = startApp;

async function startApp() {
  await loadTranslations();
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    if (!config.mapsApiKey) throw new Error("API Key not found.");

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  } catch (error) {
    console.error("Map loading failed:", error);
  }
}

// ==========================================
// 3. CORE MAP LOGIC
// ==========================================
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 16.1,
    center: silpakornCoords,
    disableDefaultUI: true,
    zoomControl: true,
    minZoom: 16.45,
    maxZoom: 20,
    restriction: { latLngBounds: campusBounds, strictBounds: false },
  });

  infoWindow = new google.maps.InfoWindow();

  map.addListener("click", () => {
    if (infoWindow) {
      infoWindow.close();
      activeMarker = null;
    }
  });

  fetchMarkerData();
  drawCampusPolygon();
}

async function fetchMarkerData() {
  try {
    // 1. Fetch from your teammate's new endpoint.
    // (Assuming their server runs on port 3000 locally)
    const dataResponse = await fetch("http://localhost:3000/wc");
    const locationsData = await dataResponse.json();

    locationsData.forEach((place) => {
      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: map,
        title: place.building, // Data uses 'building' now instead of 'title'
      });

      marker.addListener("click", () => {
        if (activeMarker === marker) return;
        if (activeMarker) activeMarker.setAnimation(null);

        marker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => {
          marker.setAnimation(null);
        }, 750);

        // 2. Map the new properties from wcList.json
        const buildingName = place.building || "Unknown Building";
        const openTime = place.operatingHours || "No info available";
        const floor = place.floor || "N/A";
        const note = place.note ? `⚠️ ${place.note}` : "";
        const openWord = translations[currentLang]
          ? translations[currentLang]["open"]
          : "Open:";

        // 3. Update the popup HTML to show the new details cleanly
        const contentString = `
            <div class="animated-popup">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${buildingName}</h3>
                <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">
                    🕒 <strong>${openWord}</strong> ${openTime}
                </p>
                <p style="margin: 0 0 4px 0; font-size: 13px; color: #4b5563;">
                    🏢 <strong>Floor:</strong> ${floor}
                </p>
                <p style="margin: 0; font-size: 13px; color: #eab308; font-weight: 500;">
                    ${note}
                </p>
            </div>
        `;

        infoWindow.setContent(contentString);
        infoWindow.open({ anchor: marker, map: map, shouldFocus: false });
        activeMarker = marker;
      });

      allMarkers.push({
        markerObject: marker,
        title: place.building.toLowerCase(), // Update search logic to use building name
      });
    });
  } catch (error) {
    console.error("Error loading marker data:", error);
  }
}

function drawCampusPolygon() {
  const campusBoundary = [
    { lat: 13.814112534127576, lng: 100.03736453950187 },
    { lat: 13.817149088820887, lng: 100.03759385445753 },
    { lat: 13.821481081361016, lng: 100.03645451998987 },
    { lat: 13.823242322499835, lng: 100.03636389242274 },
    { lat: 13.823485238823954, lng: 100.0417840640988 },
    { lat: 13.819671046566414, lng: 100.04221048702905 },
    { lat: 13.818849542175005, lng: 100.04303487294773 },
    { lat: 13.818525647257585, lng: 100.04522378843339 },
    { lat: 13.817105949183121, lng: 100.04496149515515 },
    { lat: 13.815421019042226, lng: 100.04518446561096 },
  ];

  const campusPolygon = new google.maps.Polygon({
    paths: campusBoundary,
    strokeColor: "#1b3899",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#448bef",
    fillOpacity: 0.05,
    map: map,
  });

  campusPolygon.addListener("mouseover", () =>
    campusPolygon.setOptions({
      strokeColor: "#1b3899",
      strokeWeight: 3,
      fillOpacity: 0.1,
    }),
  );
  campusPolygon.addListener("mouseout", () =>
    campusPolygon.setOptions({
      strokeColor: "#448bef",
      strokeWeight: 2,
      fillOpacity: 0.05,
    }),
  );

  campusPolygon.addListener("click", () => {
    if (infoWindow) {
      infoWindow.close();
      activeMarker = null;
    }
  });
}

// ==========================================
// 4. UI INTERACTIONS & TOGGLES
// ==========================================
function toggleSatelliteMode() {
  const isSatellite = document.getElementById("satelliteToggle").checked;
  map.setMapTypeId(isSatellite ? "satellite" : "roadmap");
}

function searchMarkers() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  allMarkers.forEach((item) => {
    item.markerObject.setMap(item.title.includes(query) ? map : null);
  });
}

// ==========================================
// 5. LANGUAGE & TRANSLATION LOGIC
// ==========================================
async function loadTranslations() {
  try {
    const response = await fetch("languages.json");
    translations = await response.json();
    updatePageText();
  } catch (error) {
    console.error("Error loading translations:", error);
  }
}

function updatePageText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (translations[currentLang]?.[key])
      el.innerText = translations[currentLang][key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (translations[currentLang]?.[key])
      el.placeholder = translations[currentLang][key];
  });
}

function changeLanguage(langCode) {
  currentLang = langCode;
  updatePageText();
}

// ==========================================
// 6. DARK MODE LOGIC & STYLES
// ==========================================
const darkModeMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  { featureType: "transit.line", stylers: [{ visibility: "off" }] },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
];

function toggleDarkMode() {
  const isDark = document.getElementById("darkModeToggle").checked;
  document.body.classList.toggle("dark-theme", isDark);
  map.setOptions({ styles: isDark ? darkModeMapStyles : [] });
}

// ==========================================
// 7. ADD NEW PLACE LOGIC
// ==========================================
const addPlaceFab = document.getElementById("addPlaceFab");
const addPlaceModal = document.getElementById("addPlaceModal");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const pickLocationBtn = document.getElementById("pickLocationBtn");
const mapConfirmUI = document.getElementById("mapConfirmUI");
const confirmMarkerBtn = document.getElementById("confirmMarkerBtn");
const cancelMarkerBtn = document.getElementById("cancelMarkerBtn");
const submitPlaceBtn = document.getElementById("submitPlaceBtn");

// 1. Open Modal
addPlaceFab.addEventListener("click", () => {
  addPlaceModal.classList.remove("hidden");
});

// 2. Close Modal
cancelModalBtn.addEventListener("click", () => {
  addPlaceModal.classList.add("hidden");
  resetForm();
});

// 3. Start Picking Location
pickLocationBtn.addEventListener("click", () => {
  addPlaceModal.classList.add("hidden");
  mapConfirmUI.classList.remove("hidden");

  // Create the marker right in the middle
  draggableMarker = new google.maps.Marker({
    position: map.getCenter(),
    map: map,
    animation: google.maps.Animation.DROP,
  });

  // Lock the marker to the center of the screen when the map is dragged
  centerChangeListener = map.addListener("center_changed", () => {
    if (draggableMarker) {
      draggableMarker.setPosition(map.getCenter());
    }
  });
});

// 4. Cancel Picking Location
cancelMarkerBtn.addEventListener("click", () => {
  mapConfirmUI.classList.add("hidden");
  addPlaceModal.classList.remove("hidden");

  if (draggableMarker) draggableMarker.setMap(null);
  if (centerChangeListener) {
    google.maps.event.removeListener(centerChangeListener);
    centerChangeListener = null;
  }
});

// 5. Confirm Picked Location
confirmMarkerBtn.addEventListener("click", () => {
  // Get the exact center of the map at the moment they click confirm
  newPlaceCoords = {
    lat: map.getCenter().lat(),
    lng: map.getCenter().lng(),
  };

  // Cleanup UI & Listeners
  mapConfirmUI.classList.add("hidden");
  if (draggableMarker) draggableMarker.setMap(null);
  if (centerChangeListener) {
    google.maps.event.removeListener(centerChangeListener);
    centerChangeListener = null;
  }

  // Reopen modal and show success text
  addPlaceModal.classList.remove("hidden");
  document.getElementById("selectedCoordsText").style.display = "block";
});

// 6. Submit the Form to the Backend
submitPlaceBtn.addEventListener("click", async () => {
  const title = document.getElementById("placeTitle").value;
  const openTime = document.getElementById("placeOpenTime").value;

  if (!title) return alert("Please enter a place name.");
  if (!newPlaceCoords) return alert("Please pick a location on the map.");

  const payload = {
    title: title,
    lat: newPlaceCoords.lat,
    lng: newPlaceCoords.lng,
    openTime: openTime || "Not specified",
  };

  try {
    const response = await fetch("/api/submit-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      alert("Place submitted successfully! Pending admin review.");
      addPlaceModal.classList.add("hidden");
      resetForm();
    } else {
      alert("Failed to submit place.");
    }
  } catch (error) {
    console.error("Error submitting:", error);
  }
});

function resetForm() {
  document.getElementById("placeTitle").value = "";
  document.getElementById("placeOpenTime").value = "";
  document.getElementById("selectedCoordsText").style.display = "none";
  newPlaceCoords = null;
  if (draggableMarker) draggableMarker.setMap(null);
}
