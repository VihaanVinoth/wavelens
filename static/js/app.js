const bands = {
  "160m": [1.8, 2.0],
  "80m": [3.5, 4.0],
  "40m": [7.0, 7.3],
  "20m": [14.0, 14.35],
  "15m": [21.0, 21.45],
  "10m": [28.0, 29.7],
  "6m": [50.0, 54.0],
  "2m": [144.0, 148.0],
};

const frequencies = {
  "160m": 1.9,
  "80m": 3.6,
  "40m": 7.1,
  "20m": 14.074,
  "15m": 21.074,
  "10m": 28.074,
  "6m": 50.313,
  "2m": 144.174,
};

const state = {
  band: localStorage.getItem("wavelens_band") || "20m",
  spots: [],
  paused: false,
};

const map = L.map("map", {
  zoomControl: false,
  minZoom: 2,
  maxZoom: 18,
  worldCopyJump: true,
}).setView([15, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  noWrap: false,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const lines = L.layerGroup().addTo(map);
const markers = L.layerGroup().addTo(map);

let hubMarker = null;

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function frequencyMHz(spot) {
  const value = Number(spot.frequency);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value / 1000000;
}

function getBand(frequency) {
  if (!Number.isFinite(frequency)) {
    return null;
  }

  for (const [band, range] of Object.entries(bands)) {
    if (frequency >= range[0] && frequency <= range[1]) {
      return band;
    }
  }

  return null;
}

function distance(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const rad = (value) => (value * Math.PI) / 180;

  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const rad = (value) => (value * Math.PI) / 180;

  const deg = (value) => (value * 180) / Math.PI;

  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));

  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));

  return (deg(Math.atan2(y, x)) + 360) % 360;
}

function markerIcon(hub = false) {
  return L.divIcon({
    className: "map-marker-wrapper",
    html: `
            <span class="map-marker ${
              hub ? "map-marker-hub" : "map-marker-spot"
            }"></span>
        `,
    iconSize: hub ? [13, 13] : [8, 8],
    iconAnchor: hub ? [6, 6] : [4, 4],
  });
}

function showHub() {
  const hub = window.WAVELENS_CONFIG?.hub;

  if (!hub) {
    return;
  }

  if (hubMarker) {
    hubMarker.addTo(markers);
    return;
  }

  hubMarker = L.marker([hub.lat, hub.lon], {
    icon: markerIcon(true),
    keyboard: false,
  })
    .bindPopup(
      `
            <div class="popup">
                <strong>
                    ${escapeHTML(hub.callsign)}
                </strong>
                <span>
                    WaveLens station
                </span>
            </div>
        `,
    )
    .addTo(markers);
}

function drawMap(spots) {
  markers.clearLayers();
  lines.clearLayers();

  showHub();

  spots.forEach((spot) => {
    const lat1 = Number(spot.lat1);
    const lon1 = Number(spot.lon1);
    const lat2 = Number(spot.lat2);
    const lon2 = Number(spot.lon2);

    const start = Number.isFinite(lat1) && Number.isFinite(lon1);

    const end = Number.isFinite(lat2) && Number.isFinite(lon2);

    if (!start && !end) {
      return;
    }

    if (start) {
      L.marker([lat1, lon1], {
        icon: markerIcon(),
        keyboard: false,
      })
        .bindPopup(
          `
                    <div class="popup">
                        <strong>
                            ${escapeHTML(spot.sender)}
                        </strong>
                        <span>
                            Sender · ${escapeHTML(spot.snr)} dB
                        </span>
                    </div>
                `,
        )
        .addTo(markers);
    }

    if (end) {
      L.marker([lat2, lon2], {
        icon: markerIcon(),
        keyboard: false,
      })
        .bindPopup(
          `
                    <div class="popup">
                        <strong>
                            ${escapeHTML(spot.receiver)}
                        </strong>
                        <span>
                            Receiver · ${escapeHTML(spot.snr)} dB
                        </span>
                    </div>
                `,
        )
        .addTo(markers);
    }

    if (start && end) {
      L.polyline(
        [
          [lat1, lon1],
          [lat2, lon2],
        ],
        {
          color: "#16865a",
          weight: 1,
          opacity: 0.5,
          dashArray: "3 6",
          interactive: false,
        },
      ).addTo(lines);
    }
  });
}

function visibleSpots() {
  const query = $("callsign-filter").value.trim().toLowerCase();

  return state.spots.filter((spot) => {
    const frequency = frequencyMHz(spot);

    const band = getBand(frequency);

    if (state.band && band !== state.band) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [spot.sender, spot.receiver, spot.mode, frequency]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function render() {
  const spots = visibleSpots();

  $("stat-count").textContent = spots.length;

  $("activity-meter").style.width = `${Math.min(spots.length * 8, 100)}%`;

  renderSpots(spots);
  drawMap(spots);
}

function renderSpots(spots) {
  const container = $("spots-list");

  container.innerHTML = "";

  if (!spots.length) {
    container.innerHTML = `
            <div class="empty-state">
                <div>NO REPORTS</div>
                <span>
                    Waiting for propagation data
                </span>
            </div>
        `;
    return;
  }

  spots.forEach((spot, index) => {
    const frequency = frequencyMHz(spot);

    const band = getBand(frequency) || "—";

    let distanceText = "—";

    if (
      Number.isFinite(Number(spot.lat1)) &&
      Number.isFinite(Number(spot.lon1)) &&
      Number.isFinite(Number(spot.lat2)) &&
      Number.isFinite(Number(spot.lon2))
    ) {
      distanceText = `${Math.round(
        distance(
          Number(spot.lat1),
          Number(spot.lon1),
          Number(spot.lat2),
          Number(spot.lon2),
        ),
      )} km`;
    }

    const card = document.createElement("article");

    card.className = "spot-card";

    card.innerHTML = `
            <div class="spot-topline">
                <span>
                    ${escapeHTML(spot.mode || "UNKNOWN")}
                </span>

                <span>
                    ${frequency ? frequency.toFixed(3) : "—"} MHz
                </span>
            </div>

            <div class="spot-route">
                <span>
                    ${escapeHTML(spot.sender || "?")}
                </span>
                <span class="route-arrow">
                    →
                </span>
                <span>
                    ${escapeHTML(spot.receiver || "?")}
                </span>
            </div>
            <div class="spot-info">
                <span>${band}</span>
                <span>${distanceText}</span>
                <span>${escapeHTML(spot.snr ?? "—")} dB</span>
            </div>
        `;

    card.addEventListener("click", () => focusSpot(spot));

    container.appendChild(card);
  });
}

function focusSpot(spot) {
  const points = [];

  if (
    Number.isFinite(Number(spot.lat1)) &&
    Number.isFinite(Number(spot.lon1))
  ) {
    points.push([Number(spot.lat1), Number(spot.lon1)]);
  }

  if (
    Number.isFinite(Number(spot.lat2)) &&
    Number.isFinite(Number(spot.lon2))
  ) {
    points.push([Number(spot.lat2), Number(spot.lon2)]);
  }

  if (!points.length) {
    return;
  }

  if (points.length === 1) {
    map.setView(points[0], 6);
    return;
  }

  map.fitBounds(points, {
    padding: [80, 80],
    maxZoom: 7,
  });
}

async function refresh() {
  if (state.paused) {
    return;
  }

  try {
    const response = await fetch("/api/spots", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const spots = await response.json();

    state.spots = Array.isArray(spots) ? spots : [];

    $("connection-status").textContent = "LIVE";

    $("status-dot").classList.add("online");

    $("last-update").textContent = new Date().toISOString().slice(11, 19);

    render();
  } catch (error) {
    console.error(error);

    $("connection-status").textContent = "OFFLINE";

    $("status-dot").classList.remove("online");
  }
}

function setBand(band) {
  state.band = band;

  if (band) {
    localStorage.setItem("wavelens_band", band);
  } else {
    localStorage.removeItem("wavelens_band");
  }

  document.querySelectorAll(".band-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.band === band);
  });

  $("freq-display").textContent = band ? frequencies[band].toFixed(3) : "ALL";

  $("active-band").textContent = band ? band.toUpperCase() : "ALL";

  render();
}

document.querySelectorAll(".band-btn").forEach((button) => {
  button.addEventListener("click", () => setBand(button.dataset.band));
});

$("all-bands").addEventListener("click", () => setBand(null));

$("callsign-filter").addEventListener("input", render);

$("pause-btn").addEventListener("click", () => {
  state.paused = !state.paused;

  $("pause-btn").textContent = state.paused ? "RESUME" : "PAUSE";

  $("feed-state").textContent = state.paused ? "PAUSED" : "LIVE";
});

$("clear-btn").addEventListener("click", () => {
  state.spots = [];
  render();

  $("last-update").textContent = "CLEARED";
});

$("zoom-in").addEventListener("click", () => map.zoomIn());

$("zoom-out").addEventListener("click", () => map.zoomOut());

$("theme-toggle").addEventListener("click", () => {
  const light =
    document.documentElement.classList.toggle("dark-theme") === false;

  localStorage.setItem("wavelens_theme", light ? "light" : "dark");
});

function updateClock() {
  const now = new Date();

  $("utc-clock").textContent = now.toISOString().slice(11, 19);
}

function loadTheme() {
  const theme = localStorage.getItem("wavelens_theme");

  if (theme !== "light") {
    document.documentElement.classList.add("dark-theme");
  }
}

loadTheme();

setBand(state.band);

updateClock();

setInterval(updateClock, 1000);

refresh();

setInterval(refresh, 5000);

setTimeout(() => map.invalidateSize(), 250);

window.addEventListener("resize", () => map.invalidateSize());
