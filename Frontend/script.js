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
let userLocationMarker = null;

const silpakornCoords = { lat: 13.8188, lng: 100.0402 };
const campusBounds = {
  north: 13.825,
  south: 13.812,
  west: 100.034,
  east: 100.047,
};

// ==========================================
// 2. INITIALIZATION
// ==========================================
window.onload = startApp;

async function startApp() {
  showLoading();
  await loadTranslations();
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    if (!config.mapsApiKey) throw new Error("API Key not found.");

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}&libraries=places&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    // photo click listener does not depend on map, register immediately
    setupPhotoClickEvents();
  } catch (error) {
    console.error("Map loading failed:", error);
    showToast("Unable to load map, please try again later.", "error");
    hideLoading();
  }
}

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 16.1,
    center: silpakornCoords,
    disableDefaultUI: true,
    zoomControl: true,
    minZoom: 16.45,
    maxZoom: 20,
    restriction: { latLngBounds: campusBounds, strictBounds: false },
    styles: cleanLightModeStyles,
  });

  infoWindow = new google.maps.InfoWindow();

  map.addListener("click", () => {
    if (infoWindow) {
      infoWindow.close();
      activeMarker = null;
    }
    document.getElementById("searchSuggestions").classList.remove("active");
    document.getElementById("filterPopup").classList.remove("active");
  });

  fetchMarkerData();
  drawCampusPolygon();
  setupMobileAndFilterListeners();
  setupLocationListener();
  initAutocomplete();
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// simple loader helpers
function showLoading() { document.getElementById("loader").style.display = "flex"; }
function hideLoading() { document.getElementById("loader").style.display = "none"; }

// ==========================================
// NEW: ROBUST ACCESS CHECKER (ALL LANGUAGES)
// ==========================================
function checkAccessRole(accessText) {
  if (!accessText) return "all";
  const text = accessText.toLowerCase();

  // Staff terms in different languages
  const staffTerms = ["staff", "เฉพาะบุคลากร", "仅限员工", "បុគ្គលិក"];
  
  // Student terms in different languages
  const studentTerms = [
    "student",                    // English: "Students only"
    "เฉพาะนักศึกษา",             // Thai: Alternative student term
    "นักศึกษาเท่านั้น",          // Thai: Actual term in database  
    "นักศึกษา",                   // Thai: Simplified student term
    "仅限学生",                   // Chinese
    "សិស្ស"                       // Khmer
  ];

  if (staffTerms.some((term) => text.includes(term.toLowerCase())))
    return "staff";
  if (studentTerms.some((term) => text.includes(term.toLowerCase())))
    return "student";

  return "all";
}

// ==========================================
// 3. DATA FETCHING & MARKER CREATION
// ==========================================
async function fetchMarkerData(lang = "en") {
  showLoading();
  try {
    allMarkers.forEach((item) => item.markerObject.setMap(null));
    allMarkers = [];

    const dataResponse = await fetch(`/wc?lang=${lang}`);
    const locationsData = await dataResponse.json();

    // compute current minutes once for performance
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    locationsData.forEach((place) => {
      const pinColor = getMarkerColor(place, currentMins);
      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: map,
        title: place.building,
        icon: createPin(pinColor),
      });

      marker.addListener("click", () => {
        if (activeMarker === marker) return;
        if (activeMarker) activeMarker.setAnimation(null);

        marker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => marker.setAnimation(null), 750);

        const buildingName = place.building || "Unknown WC";
        const openTime = place.operatingHours || "No info available";

        const openWord = translations[currentLang]?.["open"] || "Open:";
        const accessLabel =
          translations[currentLang]?.["accessLabel"] || "Access:";
        const noteLabel = translations[currentLang]?.["noteLabel"] || "Note:";

        // Dynamic UI Translation for Access Field
        const rawAccess = place.access || "All";
        const role = checkAccessRole(rawAccess);
        let accessText =
          translations[currentLang]?.["statusAll"] || "All (Staff & Students)";
        if (role === "staff")
          accessText =
            translations[currentLang]?.["statusStaff"] || "Staff Only";
        if (role === "student")
          accessText =
            translations[currentLang]?.["statusStudent"] || "Students Only";

        const placeNote = place.note || place.notes || "";
        
        // SECURITY FIX: Escape note text for safe HTML injection
        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return text.replace(/[&<>"']/g, m => map[m]);
        }
        
        let noteHTML = "";
        if (placeNote && !placeNote.toLowerCase().includes("pending review")) {
            const escapedNote = escapeHtml(placeNote);
            noteHTML = `<p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">📝 <strong>${noteLabel}</strong> ${escapedNote}</p>`;
        }

        const isPending =
          place.isPending ||
          (placeNote && placeNote.toLowerCase().includes("pending review"));
        const pendingHTML = isPending
          ? `<p style="margin: 6px 0 0 0; font-size: 13px; color: #eab308; font-weight: bold;">⚠️ Pending Admin Review</p>`
          : "";

        let cleanImgPath = "/image/Default_img.png";
        if (place.img) {
          cleanImgPath = place.img.replace("../Backend/image/", "/image/");
        }

        const imgHTML = `<img src="${cleanImgPath}" alt="Restroom Image" onerror="this.src='/image/Default_img.png'; this.style.backgroundColor='#e5e7eb';" class="animated-popup-img">`;

        const contentString = `
                    <div class="animated-popup">
                        ${imgHTML}
                        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${buildingName}</h3>
                        <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">🕒 <strong>${openWord}</strong> ${openTime}</p>
                        <p style="margin: 0; font-size: 13px; color: #3b82f6; font-weight: 500;">👥 <strong>${accessLabel}</strong> ${accessText}</p>
                        ${noteHTML}
                        ${pendingHTML}
                    </div>
                `;

        infoWindow.setContent(contentString);
        infoWindow.open({ anchor: marker, map: map, shouldFocus: false });
        activeMarker = marker;
      });

      allMarkers.push({
        markerObject: marker,
        title: place.building.toLowerCase(),
        raw: place,
        passesTimeFilter: true,
      });
    });

    applyFilters();
  } catch (error) {
    console.error("Error loading marker data:", error);
    showToast("Unable to fetch restroom data.", "error");
  } finally {
    hideLoading();
  }
}

// ==========================================
// 4. MAP HELPERS & UI LOGIC
// ==========================================
function toggleLegend() {
  document.getElementById("legendContent").classList.toggle("collapsed");
  document.getElementById("legendChevron").classList.toggle("rotated");
}

function createPin(color) {
  return {
    path: "M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9A7,7 0 0,0 12,2Z",
    fillColor: color,
    fillOpacity: 1,
    strokeWeight: 1.5,
    strokeColor: "#ffffff",
    scale: 1.4,
    anchor: new google.maps.Point(12, 22),
  };
}

function getMarkerColor(place, currentMins = null) {
  const role = checkAccessRole(place.access || place.note || place.notes || "");
  if (role === "staff") return "#f59e0b"; // Orange
  if (role === "student") return "#3b82f6"; // Blue

  const hours = (place.operatingHours || "").toLowerCase();
  if (hours.includes("24")) return "#10b981"; // Green

  if (hours.includes("-")) {
    const [mFrom, mTo] = hours.split("-").map((s) => s.trim());
    const startMins = timeToMins(mFrom);
    const endMins = timeToMins(mTo);
    if (currentMins === null) {
      const now = new Date();
      currentMins = now.getHours() * 60 + now.getMinutes();
    }

    if (endMins < startMins) {
      if (currentMins >= startMins || currentMins <= endMins) return "#10b981";
      return "#9ca3af"; // Gray
    } else {
      if (currentMins >= startMins && currentMins <= endMins) return "#10b981";
      return "#9ca3af"; // Gray
    }
  }
  return "#10b981";
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
    document.getElementById("searchSuggestions").classList.remove("active");
    document.getElementById("filterPopup").classList.remove("active");
  });
}

// ==========================================
// 5. SEARCH & FILTER LOGIC
// ==========================================
function setupMobileAndFilterListeners() {
  const filterPopup = document.getElementById("filterPopup");
  const filterToggleBtn = document.getElementById("filterToggleBtn");
  const searchSuggestions = document.getElementById("searchSuggestions");

  document
    .getElementById("mobileSearchToggle")
    .addEventListener("click", () => {
      document
        .getElementById("searchContainer")
        .classList.toggle("mobile-search-active");
    });

  document.getElementById("mobileMenuToggle").addEventListener("click", () => {
    document.getElementById("bottomControls").classList.toggle("menu-expanded");
  });

  filterToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    filterPopup.classList.remove("hidden");
    filterPopup.classList.toggle("active");
  });

  document.getElementById("applyFilterBtn").addEventListener("click", () => {
    filterPopup.classList.remove("active");
    applyFilters();
  });

  // new: search input listener moved from inline attribute
  document
    .getElementById("searchInput")
    .addEventListener("input", handleSearchInput);

  document.addEventListener("click", (e) => {
    if (filterPopup.classList.contains("active")) {
      if (
        !filterPopup.contains(e.target) &&
        !filterToggleBtn.contains(e.target)
      )
        filterPopup.classList.remove("active");
    }
    if (searchSuggestions.classList.contains("active")) {
      if (!document.getElementById("searchInput").contains(e.target))
        searchSuggestions.classList.remove("active");
    }
  });
}

function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(":");
  return parseInt(h) * 60 + parseInt(m);
}

function checkTimeOverlap(pFrom, pTo, fFrom, fTo) {
  const overlap = (start1, end1, start2, end2) =>
    Math.max(start1, start2) < Math.min(end1, end2);
  const pIntervals =
    pFrom < pTo
      ? [[pFrom, pTo]]
      : [
          [pFrom, 1440],
          [0, pTo],
        ];
  const fIntervals =
    fFrom < fTo
      ? [[fFrom, fTo]]
      : [
          [fFrom, 1440],
          [0, fTo],
        ];

  for (let [ps, pe] of pIntervals) {
    for (let [fs, fe] of fIntervals) {
      if (overlap(ps, pe, fs, fe)) return true;
    }
  }
  return false;
}

function applyFilters() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const filter24h = document.getElementById("filter24h").checked;
  const filterFrom = document.getElementById("filterTimeFrom").value;
  const filterTo = document.getElementById("filterTimeTo").value;
  const filterAccess = document.getElementById("filterAccess").value;

  allMarkers.forEach((item) => {
    let textMatch = item.title.includes(query);
    let timeMatch = true;
    let accessMatch = true;

    const hours = (item.raw.operatingHours || "").toLowerCase();

    if (filter24h) {
      timeMatch = hours.includes("24");
    } else if (filterFrom && filterTo) {
      if (hours.includes("-")) {
        const [mFrom, mTo] = hours.split("-").map((s) => s.trim());
        timeMatch = checkTimeOverlap(
          timeToMins(mFrom),
          timeToMins(mTo),
          timeToMins(filterFrom),
          timeToMins(filterTo),
        );
      } else if (!hours.includes("24")) {
        timeMatch = false;
      }
    }

    if (filterAccess !== "any") {
      const role = checkAccessRole(item.raw.access || "");
      if (role !== filterAccess) {
        accessMatch = false;
      }
    }

    item.passesTimeFilter = timeMatch && accessMatch;
    item.markerObject.setMap(
      textMatch && timeMatch && accessMatch ? map : null,
    );
  });
}

function handleSearchInput() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const suggestionsBox = document.getElementById("searchSuggestions");
  suggestionsBox.innerHTML = "";
  applyFilters();

  if (!query) {
    suggestionsBox.classList.remove("active");
    return;
  }

  const matches = allMarkers.filter(
    (item) => item.title.includes(query) && item.passesTimeFilter,
  );

  if (matches.length > 0) {
    suggestionsBox.classList.add("active");
    matches.forEach((match) => {
      const li = document.createElement("li");
      li.innerText = match.raw.building;
      li.onclick = () => {
        document.getElementById("searchInput").value = match.raw.building;
        suggestionsBox.classList.remove("active");
        applyFilters();
        map.panTo(match.markerObject.getPosition());
        google.maps.event.trigger(match.markerObject, "click");
      };
      suggestionsBox.appendChild(li);
    });
  } else {
    suggestionsBox.classList.remove("active");
  }
}

// ==========================================
// 6. ADD NEW PLACE, GEOLOCATION, AUTOCOMPLETE
// ==========================================
function setupLocationListener() {
  document.getElementById("locateMeBtn").addEventListener("click", () => {
    if (navigator.geolocation) {
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      };
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const isOutsideCampus =
            pos.lat < campusBounds.south ||
            pos.lat > campusBounds.north ||
            pos.lng < campusBounds.west ||
            pos.lng > campusBounds.east;
          if (isOutsideCampus)
            map.setOptions({ restriction: null, minZoom: 5 });

          map.panTo(pos);
          map.setZoom(17);

          if (!userLocationMarker) {
            userLocationMarker = new google.maps.Marker({
              position: pos,
              map: map,
              title: "You are here",
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#3b82f6",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#ffffff",
              },
            });
          } else {
            userLocationMarker.setPosition(pos);
          }
        },
        (err) => showToast(`Could not fetch location.`, "error"),
        options,
      );
    } else {
      showToast("Browser doesn't support geolocation.", "error");
    }
  });
}

function initAutocomplete() {
  const input = document.getElementById("placeTitle");
  const autocomplete = new google.maps.places.Autocomplete(input, {
    bounds: campusBounds,
    strictBounds: false,
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;
    newPlaceCoords = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
    const coordsText = document.getElementById("selectedCoordsText");
    coordsText.innerText = "✅ Location auto-grabbed from Google!";
    coordsText.style.color = "#059669";
    coordsText.style.display = "block";
  });
}

const addPlaceModal = document.getElementById("addPlaceModal");
const mapConfirmUI = document.getElementById("mapConfirmUI");
const is24hCheckbox = document.getElementById("is24hCheckbox");
const placeTimeFrom = document.getElementById("placeTimeFrom");
const placeTimeTo = document.getElementById("placeTimeTo");

is24hCheckbox.addEventListener("change", (e) => {
  placeTimeFrom.disabled = e.target.checked;
  placeTimeTo.disabled = e.target.checked;
});

addPlaceModal.addEventListener("click", (e) => {
  if (e.target === addPlaceModal) {
    addPlaceModal.classList.remove("active");
    resetForm();
  }
});

document
  .getElementById("addPlaceFab")
  .addEventListener("click", () => addPlaceModal.classList.add("active"));
document.getElementById("cancelModalBtn").addEventListener("click", () => {
  addPlaceModal.classList.remove("active");
  resetForm();
});

document.getElementById("pickLocationBtn").addEventListener("click", () => {
  addPlaceModal.classList.remove("active");
  mapConfirmUI.classList.add("active");
  draggableMarker = new google.maps.Marker({
    position: map.getCenter(),
    map: map,
    animation: google.maps.Animation.DROP,
  });
  centerChangeListener = map.addListener("center_changed", () => {
    if (draggableMarker) draggableMarker.setPosition(map.getCenter());
  });
});

document.getElementById("cancelMarkerBtn").addEventListener("click", () => {
  mapConfirmUI.classList.remove("active");
  addPlaceModal.classList.add("active");
  if (draggableMarker) draggableMarker.setMap(null);
  if (centerChangeListener) {
    google.maps.event.removeListener(centerChangeListener);
    centerChangeListener = null;
  }
});

document.getElementById("confirmMarkerBtn").addEventListener("click", () => {
  newPlaceCoords = { lat: map.getCenter().lat(), lng: map.getCenter().lng() };
  mapConfirmUI.classList.remove("active");
  if (draggableMarker) draggableMarker.setMap(null);
  if (centerChangeListener) {
    google.maps.event.removeListener(centerChangeListener);
    centerChangeListener = null;
  }
  addPlaceModal.classList.add("active");
  const coordsText = document.getElementById("selectedCoordsText");
  coordsText.innerText = "📍 Manual location selected!";
  coordsText.style.color = "#1b3899";
  coordsText.style.display = "block";
});

document
  .getElementById("submitPlaceBtn")
  .addEventListener("click", async () => {
    const submitBtn = document.getElementById("submitPlaceBtn");
    submitBtn.disabled = true;

    const title = document.getElementById("placeTitle").value;
    const access = document.getElementById("placeAccess").value;
    const note = document.getElementById("placeNote").value;

    let openTime = "Not specified";
    if (is24hCheckbox.checked) openTime = "24 Hours";
    else if (placeTimeFrom.value && placeTimeTo.value)
      openTime = `${placeTimeFrom.value} - ${placeTimeTo.value}`;

    if (!title) {
      showToast("Please enter a WC name.", "error");
      submitBtn.disabled = false;
      return;
    }
    if (!newPlaceCoords) {
      showToast("Please pick a location on the map.", "error");
      submitBtn.disabled = false;
      return;
    }

    const payload = {
      title,
      lat: newPlaceCoords.lat,
      lng: newPlaceCoords.lng,
      openTime,
      access,
      note,
    };

    try {
      const response = await fetch("/api/submit-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showToast(
          "WC submitted successfully! Pending admin review.",
          "success",
        );
        addPlaceModal.classList.remove("active");
        resetForm();
      } else {
        const errText = await response.text();
        showToast(`Failed to submit WC. ${errText}`, "error");
      }
    } catch (error) {
      console.error("Error submitting:", error);
      showToast("Failed to submit WC.", "error");
    }

    submitBtn.disabled = false;
  });

function resetForm() {
  document.getElementById("placeTitle").value = "";
  document.getElementById("placeAccess").value = "all";
  document.getElementById("placeNote").value = "";
  is24hCheckbox.checked = false;
  placeTimeFrom.value = "";
  placeTimeTo.value = "";
  placeTimeFrom.disabled = false;
  placeTimeTo.disabled = false;
  document.getElementById("selectedCoordsText").style.display = "none";
  newPlaceCoords = null;
  if (draggableMarker) draggableMarker.setMap(null);
}

// ==========================================
// 7. TRANSLATIONS & THEMES
// ==========================================
function toggleSatelliteMode() {
  map.setMapTypeId(
    document.getElementById("satelliteToggle").checked
      ? "satellite"
      : "roadmap",
  );
}
async function loadTranslations() {
  try {
    translations = await (await fetch("languages.json")).json();
    updatePageText();
  } catch (error) {
    console.error(error);
  }
}

function updatePageText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (translations[currentLang]?.[el.getAttribute("data-i18n")])
      el.innerText = translations[currentLang][el.getAttribute("data-i18n")];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    if (translations[currentLang]?.[el.getAttribute("data-i18n-placeholder")])
      el.placeholder =
        translations[currentLang][el.getAttribute("data-i18n-placeholder")];
  });
}

function changeLanguage(langCode) {
  currentLang = langCode;

  // NEW: Toggles the body class to apply the Khmer font exclusively when chosen
  document.body.className = document.body.className.replace(
    /\blang-\w+\b/g,
    "",
  );
  if (langCode === "kh") document.body.classList.add("lang-kh");

  updatePageText();
  fetchMarkerData(langCode);
}

const cleanLightModeStyles = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "landscape",
    elementType: "labels",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "on" }],
  },
];
const darkModeMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
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
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
];

function toggleDarkMode() {
  const isDark = document.getElementById("darkModeToggle").checked;
  document.body.classList.toggle("dark-theme", isDark);
  map.setOptions({ styles: isDark ? darkModeMapStyles : cleanLightModeStyles });
}
// --- PHOTO FULLSCREEN LOGIC ---
function setupPhotoClickEvents() {
  document.body.addEventListener("click", function (e) {
    // Only trigger if an image inside a map popup is clicked
    if (
      e.target.tagName === "IMG" &&
      (e.target.closest(".animated-popup") || e.target.closest(".gm-style-iw"))
    ) {
      openFullscreenImage(e.target.src);
    }
  });
}

function openFullscreenImage(imgUrl) {
  const overlay = document.createElement("div");
  overlay.style = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; opacity: 0; transition: opacity 0.3s ease;
    `;

  const fullImg = document.createElement("img");
  fullImg.src = imgUrl;
  fullImg.style = `
        max-width: 90%; max-height: 90%;
        border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        cursor: default;
    `;

  // Prevent closing when clicking the actual image
  fullImg.addEventListener("click", (e) => e.stopPropagation());

  overlay.appendChild(fullImg);
  document.body.appendChild(overlay);

  // Fade in effect
  setTimeout(() => (overlay.style.opacity = "1"), 10);

  // Close when clicking the dark background
  overlay.onclick = function () {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 300);
  };
}
