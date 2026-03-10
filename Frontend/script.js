// ==========================================
// 1. GLOBAL STATE & VARIABLES
// ==========================================
let userCoords = null; 
let watchId = null;
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${config.mapsApiKey}&libraries=places&callback=initMap&loading=async`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

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
    gestureHandling: "greedy",
    clickableIcons: false,
  });

  infoWindow = new google.maps.InfoWindow();

  map.addListener("click", () => {
    if (infoWindow) {
      infoWindow.close();
      activeMarker = null;
    }
    document.getElementById("searchSuggestions").classList.remove("active");
    document.getElementById("filterPopup").classList.remove("active");

    // Close directory ONLY on mobile screens
    if (window.innerWidth <= 768 && window.toggleDirectory) {
      const sidePanel = document.getElementById("sidePanel");
      if (sidePanel && sidePanel.classList.contains("is-open")) {
        window.toggleDirectory(null, "close");
      }
    }
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        document.getElementById("sortDistanceBtn").disabled = false; 
        updatePlacesList(); 
      },
      () => {},
      { timeout: 5000 }
    ); 
  }

  fetchMarkerData();
  drawCampusPolygon();
  setupMobileAndFilterListeners();
  setupLocationListener();
  initAutocomplete();

  setTimeout(() => {
    if (window.innerWidth > 768) {
      window.toggleDirectory(null, "open");
    } else {
      window.toggleDirectory(null, "close");
    }
  }, 100); 
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function showLoading() {
  document.getElementById("loader").style.display = "flex";
}

function hideLoading() {
  document.getElementById("loader").style.display = "none";
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
        const accessLabel = translations[currentLang]?.["accessLabel"] || "Access:";
        const noteLabel = translations[currentLang]?.["noteLabel"] || "Note:";

        const role = place.accessType || "all";
        let accessText = translations[currentLang]?.["statusAll"] || "All (Staff & Students)";
        if (role === "staff") accessText = translations[currentLang]?.["statusStaff"] || "Staff Only";
        if (role === "student") accessText = translations[currentLang]?.["statusStudent"] || "Students Only";

        const placeNote = place.notes || "";
        function escapeHtml(text) {
          const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
          return text.replace(/[&<>"']/g, (m) => map[m]);
        }

        let noteHTML = "";
        if (placeNote && !placeNote.toLowerCase().includes("pending review")) {
          noteHTML = `<p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">📝 <strong>${noteLabel}</strong> ${escapeHtml(placeNote)}</p>`;
        }

        const isPending = place.isPending;
        const pendingHTML = isPending ? `<p style="margin: 6px 0 0 0; font-size: 13px; color: #eab308; font-weight: bold;">⚠️ Pending Admin Review</p>` : "";

        const DEFAULT_IMG = "/place_data_asset/Default_img.png";
        let cleanImgPath = DEFAULT_IMG;
        if (place.img && place.img.startsWith("/place_data_asset/")) {
          cleanImgPath = place.img;
        }

        const imgHTML = `<img src="${cleanImgPath}" alt="Restroom Image" onerror="this.src='${DEFAULT_IMG}'; this.style.backgroundColor='#e5e7eb';" class="animated-popup-img">`;

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
    updatePlacesList(); 
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
window.toggleLegend = function () {
  const legendContent = document.getElementById("legendContent");
  legendContent.classList.toggle("collapsed");
  document.getElementById("legendChevron").classList.toggle("rotated");

  const sidePanel = document.getElementById("sidePanel");
  if (sidePanel) sidePanel.classList.toggle("legend-collapsed");
};

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
    campusPolygon.setOptions({ strokeColor: "#1b3899", strokeWeight: 3, fillOpacity: 0.1 })
  );
  campusPolygon.addListener("mouseout", () =>
    campusPolygon.setOptions({ strokeColor: "#448bef", strokeWeight: 2, fillOpacity: 0.05 })
  );
  
  campusPolygon.addListener("click", () => {
    if (infoWindow) {
      infoWindow.close();
      activeMarker = null;
    }
    document.getElementById("searchSuggestions").classList.remove("active");
    document.getElementById("filterPopup").classList.remove("active");

    // Close directory ONLY on mobile screens
    if (window.innerWidth <= 768 && window.toggleDirectory) {
      const sidePanel = document.getElementById("sidePanel");
      if (sidePanel && sidePanel.classList.contains("is-open")) {
        window.toggleDirectory(null, "close");
      }
    }
  });
}

// ==========================================
// 5. SEARCH & FILTER LOGIC
// ==========================================
function setupMobileAndFilterListeners() {
  const filterPopup = document.getElementById("filterPopup");
  const filterToggleBtn = document.getElementById("filterToggleBtn");
  const searchSuggestions = document.getElementById("searchSuggestions");
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");

  searchInput.addEventListener("input", () => {
    clearSearchBtn.style.display = searchInput.value ? "block" : "none";
    handleSearchInput(); 
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    handleSearchInput(); 
  });

  document.getElementById("mobileSearchToggle").addEventListener("click", () => {
    document.getElementById("searchContainer").classList.toggle("mobile-search-active");
  });

  document.getElementById("mobileMenuToggle").addEventListener("click", (e) => {
    e.stopPropagation();
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

  document.getElementById("searchInput").addEventListener("input", handleSearchInput);

  document.addEventListener("click", (e) => {
    if (filterPopup.classList.contains("active") && !filterPopup.contains(e.target) && !filterToggleBtn.contains(e.target)) {
      filterPopup.classList.remove("active");
    }
    if (searchSuggestions.classList.contains("active") && !document.getElementById("searchContainer").contains(e.target)) {
      searchSuggestions.classList.remove("active");
    }

    const bottomControls = document.getElementById("bottomControls");
    const mobileMenuToggle = document.getElementById("mobileMenuToggle");
    if (bottomControls && bottomControls.classList.contains("menu-expanded") && !bottomControls.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
      bottomControls.classList.remove("menu-expanded");
    }
  });

  // --- Unified Directory Toggle ---
  window.toggleDirectory = function (e, forceState = null) {
    if (e) e.stopPropagation();
    const panel = document.getElementById("sidePanel");
    if (!panel) return;

    let isOpening;
    if (forceState === "close") {
      panel.classList.remove("is-open");
      isOpening = false;
    } else if (forceState === "open") {
      panel.classList.add("is-open");
      isOpening = true;
    } else {
      isOpening = panel.classList.toggle("is-open");
    }

    const icon = document.getElementById("directoryToggleIcon");
    if (icon) icon.innerText = isOpening ? "▲" : "▼";

    if (isOpening) {
      document.body.classList.add("sheet-is-open");

      // Auto-close legend ONLY if opening the directory on mobile
      if (window.innerWidth <= 768) {
        const legendContent = document.getElementById("legendContent");
        if (legendContent && !legendContent.classList.contains("collapsed")) {
          legendContent.classList.add("collapsed");
          document.getElementById("legendChevron").classList.add("rotated");
        }
        const bc = document.getElementById("bottomControls");
        if (bc) bc.classList.remove("menu-expanded");
      }
    } else {
      document.body.classList.remove("sheet-is-open");

      // Re-open legend when directory closes on mobile
      if (window.innerWidth <= 768) {
        const legendContent = document.getElementById("legendContent");
        if (legendContent && legendContent.classList.contains("collapsed")) {
          legendContent.classList.remove("collapsed");
          document.getElementById("legendChevron").classList.remove("rotated");
        }
      }
    }
  };
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
        timeMatch = checkTimeOverlap(timeToMins(mFrom), timeToMins(mTo), timeToMins(filterFrom), timeToMins(filterTo));
      } else if (!hours.includes("24")) {
        timeMatch = false;
      }
    }

    if (filterAccess !== "any") {
      const role = item.raw.accessType || "all";
      if (role !== filterAccess) {
        accessMatch = false;
      }
    }

    item.passesTimeFilter = timeMatch && accessMatch;
    item.markerObject.setMap(textMatch && timeMatch && accessMatch ? map : null);
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

  const matches = allMarkers.filter((item) => item.title.includes(query) && item.passesTimeFilter);

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
    if (!navigator.geolocation) {
      return showToast("Browser doesn't support geolocation.", "error");
    }

    // If tracking is already active, just snap the camera back to the user's current spot
    if (userCoords && userLocationMarker) {
        map.panTo(userCoords);
        map.setZoom(17);
        return;
    }

    showToast("Locating you...", "success");

    // Start live tracking using watchPosition instead of getCurrentPosition
    if (!watchId) {
        const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
        
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
            userCoords = pos; 
            
            // Unlock the 'Nearest' button and update live distances as they walk!
            document.getElementById("sortDistanceBtn").disabled = false; 
            updatePlacesList(); 

            // Allow map to zoom out if they are far away from campus
            const isOutsideCampus = pos.lat < campusBounds.south || pos.lat > campusBounds.north || pos.lng < campusBounds.west || pos.lng > campusBounds.east;
            if (isOutsideCampus) map.setOptions({ restriction: null, minZoom: 5 });

            if (!userLocationMarker) {
              // First time getting location: Drop the marker and pan camera
              map.panTo(pos);
              map.setZoom(17);
              userLocationMarker = new google.maps.Marker({
                position: pos,
                map: map,
                title: "You are here",
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#3b82f6", fillOpacity: 1, strokeWeight: 2, strokeColor: "#ffffff" },
              });
            } else {
              // Location updated: Smoothly move the blue dot to follow the user
              userLocationMarker.setPosition(pos);
            }
          },
          (err) => {
              if(err.code === 1) showToast("Location permission denied.", "error");
              else console.error("Live tracking error:", err);
          },
          options
        );
    }
  });
}

function initAutocomplete() {
  const input = document.getElementById("placeTitle");
  const autocomplete = new google.maps.places.Autocomplete(input, { bounds: campusBounds, strictBounds: false });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;
    newPlaceCoords = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
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

const _imageInput = document.getElementById("placeImage");
const _imageSection = document.getElementById("placeImageSection");
const _clearBtn = _imageSection?.querySelector(".clear-btn");

if (_imageInput && _imageSection) {
  _imageInput.addEventListener("change", () => {
    if (_imageInput.files && _imageInput.files[0]) {
      const url = URL.createObjectURL(_imageInput.files[0]);
      _imageSection.style.backgroundImage = `url(${url})`;
      _imageSection.classList.add("has-preview");
    } else {
      _imageSection.style.backgroundImage = "";
      _imageSection.classList.remove("has-preview");
    }
  });
  if (_clearBtn) {
    _clearBtn.addEventListener("click", () => {
      _imageInput.value = "";
      _imageSection.style.backgroundImage = "";
      _imageSection.classList.remove("has-preview");
    });
  }
}

document.getElementById("addPlaceFab").addEventListener("click", () => addPlaceModal.classList.add("active"));
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

document.getElementById("submitPlaceBtn").addEventListener("click", async () => {
  const submitBtn = document.getElementById("submitPlaceBtn");
  submitBtn.disabled = true;

  const enName = document.getElementById("placeTitle").value;
  const thName = document.getElementById("placeTitleTh") ? document.getElementById("placeTitleTh").value : "";
  const cnName = document.getElementById("placeTitleCn") ? document.getElementById("placeTitleCn").value : "";
  const khName = document.getElementById("placeTitleKh") ? document.getElementById("placeTitleKh").value : "";

  const access = document.getElementById("placeAccess").value;
  const note = document.getElementById("placeNote").value;

  let openTime = "Not specified";
  if (is24hCheckbox.checked) openTime = "24 Hours";
  else if (placeTimeFrom.value && placeTimeTo.value) openTime = `${placeTimeFrom.value} - ${placeTimeTo.value}`;

  if (!enName) {
    showToast("Please enter a Primary (English) WC name.", "error");
    submitBtn.disabled = false;
    return;
  }
  if (!newPlaceCoords) {
    showToast("Please pick a location on the map.", "error");
    submitBtn.disabled = false;
    return;
  }

  const namesObj = { en: enName, th: thName, cn: cnName, kh: khName };

  const form = new FormData();
  form.append("names", JSON.stringify(namesObj)); 
  form.append("lat", newPlaceCoords.lat);
  form.append("lng", newPlaceCoords.lng);
  form.append("openTime", openTime);
  form.append("access", access);
  form.append("note", note);

  const imageInput = document.getElementById("placeImage");
  if (imageInput && imageInput.files[0]) {
    form.append("image", imageInput.files[0]);
  }

  try {
    const response = await fetch("/api/submit-place", {
      method: "POST",
      body: form,
    });
    if (response.ok) {
      showToast("WC submitted successfully! Pending admin review.", "success");
      addPlaceModal.classList.remove("active");
      resetForm();
    } else {
      const errText = await response.text();
      showToast(`Failed to submit WC. ${errText}`, "error");
    }
  } catch (error) {
    showToast("Failed to submit WC.", "error");
  }
  submitBtn.disabled = false;
});

function resetForm() {
  document.getElementById("placeTitle").value = "";
  if (document.getElementById("placeTitleTh")) document.getElementById("placeTitleTh").value = "";
  if (document.getElementById("placeTitleCn")) document.getElementById("placeTitleCn").value = "";
  if (document.getElementById("placeTitleKh")) document.getElementById("placeTitleKh").value = "";

  document.getElementById("placeAccess").value = "all";
  document.getElementById("placeNote").value = "";
  is24hCheckbox.checked = false;
  placeTimeFrom.value = "";
  placeTimeTo.value = "";
  placeTimeFrom.disabled = false;
  placeTimeTo.disabled = false;
  document.getElementById("placeImage").value = "";

  const sec = document.getElementById("placeImageSection");
  if (sec) {
    sec.style.backgroundImage = "";
    sec.classList.remove("has-preview");
  }

  document.getElementById("selectedCoordsText").style.display = "none";
  newPlaceCoords = null;
  if (draggableMarker) draggableMarker.setMap(null);
}

// ==========================================
// 7. TRANSLATIONS & THEMES
// ==========================================
function updateMapAppearance() {
  const isSat = document.getElementById("satelliteToggle").checked;
  const isDark = document.getElementById("darkModeToggle").checked;
  document.body.classList.toggle("dark-theme", isDark);
  map.setOptions({
    mapTypeId: isSat ? "satellite" : "roadmap",
    styles: isDark ? darkModeMapStyles : cleanLightModeStyles,
  });
}

function toggleSatelliteMode() { updateMapAppearance(); }
function toggleDarkMode() { updateMapAppearance(); }

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
      el.placeholder = translations[currentLang][el.getAttribute("data-i18n-placeholder")];
  });
}

function changeLanguage(langCode) {
  currentLang = langCode;
  document.body.className = document.body.className.replace(/\blang-\w+\b/g, "");
  if (langCode === "kh") document.body.classList.add("lang-kh");
  updatePageText();
  fetchMarkerData(langCode);
}

const cleanLightModeStyles = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "on" }] },
];

const darkModeMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
];

function setupPhotoClickEvents() {
  document.body.addEventListener("click", function (e) {
    if (e.target.tagName === "IMG" && (e.target.closest(".animated-popup") || e.target.closest(".gm-style-iw"))) {
      openFullscreenImage(e.target.src);
    }
  });
}

function openFullscreenImage(imgUrl) {
  const overlay = document.createElement("div");
  overlay.style = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity 0.3s ease;`;
  const fullImg = document.createElement("img");
  fullImg.src = imgUrl;
  fullImg.style = `max-width: 90%; max-height: 90%; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); cursor: default;`;
  fullImg.addEventListener("click", (e) => e.stopPropagation());
  overlay.appendChild(fullImg);
  document.body.appendChild(overlay);
  setTimeout(() => (overlay.style.opacity = "1"), 10);
  overlay.onclick = function () {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 300);
  };
}

// ==========================================
// 8. DIRECTORY SORTING & SEARCH OVERRIDES
// ==========================================
window.updatePlacesList = function () {
  const container = document.getElementById("placesListContainer");
  if (!container) return;

  let visiblePlaces = [...allMarkers].filter((m) => m.passesTimeFilter);
  const sortByElement = document.querySelector('input[name="sortOrder"]:checked');
  const sortBy = sortByElement ? sortByElement.value : "alpha";

  if (sortBy === "distance" && userCoords) {
    visiblePlaces.sort((a, b) => {
      const dA = calculateDistance(userCoords.lat, userCoords.lng, a.raw.lat, a.raw.lng);
      const dB = calculateDistance(userCoords.lat, userCoords.lng, b.raw.lat, b.raw.lng);
      return dA - dB;
    });
  } else {
    visiblePlaces.sort((a, b) => {
      const nameA = (a.raw.building || "").toString().trim().toLowerCase();
      const nameB = (b.raw.building || "").toString().trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  container.innerHTML = "";
  visiblePlaces.forEach((item) => {
    const div = document.createElement("div");
    div.className = "place-list-item";
    const role = item.raw.accessType === "staff" ? "Staff Only" : item.raw.accessType === "student" ? "Students Only" : "All";

    let distText = "";
    if (userCoords) {
      const dist = calculateDistance(userCoords.lat, userCoords.lng, item.raw.lat, item.raw.lng);
      distText = `<span style="float:right; color:#10b981; font-weight:bold;">${dist > 1000 ? (dist / 1000).toFixed(1) + "km" : Math.round(dist) + "m"}</span>`;
    }

    div.innerHTML = `<h4>${item.raw.building} ${distText}</h4><p>🕒 ${item.raw.operatingHours}</p><p>👥 ${role}</p>`;
    div.onclick = (e) => {
      e.stopPropagation();
      map.panTo(item.markerObject.getPosition());
      map.setZoom(18);
      google.maps.event.trigger(item.markerObject, "click");
      if (window.innerWidth <= 768) toggleDirectory(null, "close"); 
    };
    container.appendChild(div);
  });

  return visiblePlaces;
};

// Override the original search to use the new sorting engine logic
function handleSearchInput() {
  const query = document.getElementById("searchInput").value.toLowerCase();
  const suggestionsBox = document.getElementById("searchSuggestions");
  suggestionsBox.innerHTML = "";

  applyFilters();
  let sortedPlaces = updatePlacesList() || [];

  if (query) {
    sortedPlaces = sortedPlaces.filter((item) => item.title.includes(query));
  }

  if (sortedPlaces.length > 0) {
    suggestionsBox.classList.add("active");
    sortedPlaces.forEach((match) => {
      const li = document.createElement("li");

      let distText = "";
      if (userCoords) {
        const dist = calculateDistance(userCoords.lat, userCoords.lng, match.raw.lat, match.raw.lng);
        distText = `<span style="float:right; font-size: 11px; color:#10b981;">${dist > 1000 ? (dist / 1000).toFixed(1) + "km" : Math.round(dist) + "m"}</span>`;
      }

      li.innerHTML = `${match.raw.building} ${distText}`;
      li.onclick = () => {
        document.getElementById("searchInput").value = match.raw.building;
        suggestionsBox.classList.remove("active");
        applyFilters();
        map.panTo(match.markerObject.getPosition());
        map.setZoom(18);
        google.maps.event.trigger(match.markerObject, "click");
      };
      suggestionsBox.appendChild(li);
    });
  } else {
    suggestionsBox.classList.remove("active");
  }
}