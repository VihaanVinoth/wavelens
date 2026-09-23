const BAND_FREQUENCIES = {
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
  snapshotTime: null,
};

const elements = {
  clock: document.getElementById("utc-clock"),
  count: document.getElementById("stat-count"),
  spots: document.getElementById("spots-list"),
  filter: document.getElementById("callsign-filter"),
  frequency: document.getElementById("freq-display"),
  status: document.getElementById("connection-status"),
  statusDot: document.getElementById("status-dot"),
  feedState: document.getElementById("feed-state"),
  lastUpdate: document.getElementById("last-update"),
  update: document.getElementById("update-btn"),
  clear: document.getElementById("clear-btn"),
  export: document.getElementById("export-csv-btn"),
  meter: document.getElementById("activity-meter"),
  theme: document.getElementById("theme-toggle"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  allBands: document.getElementById("all-bands"),
};

const map = L.map("map", {
  zoomControl: false,
  minZoom: 2,
  maxZoom: 17,
  worldCopyJump: true,
}).setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const spotLayer = L.layerGroup().addTo(map);
const lineLayer = L.layerGroup().addTo(map);

let hubMarker = null;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFrequencyMHz(spot) {
  const frequency = Number(spot.frequency);

  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  return frequency / 1000000;
}

function getBand(frequency) {
  if (!Number.isFinite(frequency)) {
    return null;
  }

  const ranges = {
    "160m": [1.8, 2.0],
    "80m": [3.5, 4.0],
    "40m": [7.0, 7.3],
    "20m": [14.0, 14.35],
    "15m": [21.0, 21.45],
    "10m": [28.0, 29.7],
    "6m": [50.0, 54.0],
    "2m": [144.0, 148.0],
  };

  for (const [band, range] of Object.entries(ranges)) {
    if (frequency >= range[0] && frequency <= range[1]) {
      return band;
    }
  }

  return null;
}

function distanceBetween(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const toDegrees = (value) => (value * 180) / Math.PI;
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);
  const longitudeDifference = toRadians(lon2 - lon1);
  const y = Math.sin(longitudeDifference) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(longitudeDifference);
  let bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

function bearingName(degrees) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(degrees / 45) % 8];
}

function signalDescription(snr) {
  const value = Number(snr);
  if (!Number.isFinite(value)) {
    return "UNKNOWN";
  }
  if (value >= 5) return "STRONG";
  if (value >= -5) return "GOOD";
  if (value >= -15) return "FAIR";
  return "WEAK";
}

function updateClock() {
  const now = new Date();
  elements.clock.textContent = now.toUTCString().slice(17, 25);
}

updateClock();

setInterval(updateClock, 1000);

function selectBand(band) {
  state.band = band;
  localStorage.setItem("wavelens_band", band);
  document.querySelectorAll(".band-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.band === band);
  });
  elements.frequency.textContent = BAND_FREQUENCIES[band]?.toFixed(3) ?? "—";
  render();
}

document.querySelectorAll(".band-btn").forEach((button) => {
  button.addEventListener("click", () => selectBand(button.dataset.band));
});

elements.allBands?.addEventListener("click", () => {
  state.band = null;
  document
    .querySelectorAll(".band-btn")
    .forEach((button) => button.classList.remove("active"));
  elements.frequency.textContent = "ALL";
  render();
});

function getVisibleSpots() {
  const query = elements.filter.value.trim().toLowerCase();
  return state.spots.filter((spot) => {
    const frequency = getFrequencyMHz(spot);
    const band = getBand(frequency);
    const matchesBand = !state.band || band === state.band;
    if (!matchesBand) {
      return false;
    }
    if (!query) {
      return true;
    }
    const text = [spot.sender, spot.receiver, spot.mode, frequency]
      .join(" ")
      .toLowerCase();
    return text.includes(query);
  });
}

elements.filter.addEventListener("input", render);

function createMarker(isHub = false) {
  return L.divIcon({
    className: "map-marker-wrapper",
    html: `
            <span class="map-marker ${
              isHub ? "map-marker-hub" : "map-marker-spot"
            }"></span>
        `,
    iconSize: isHub ? [18, 18] : [14, 14],
    iconAnchor: isHub ? [9, 9] : [7, 7],
  });
}

function showHub() {
  const hub = window.WAVELENS_CONFIG?.hub;

  if (!hub) {
    return;
  }

  if (!Number.isFinite(Number(hub.lat)) || !Number.isFinite(Number(hub.lon))) {
    return;
  }

  if (hubMarker) {
    hubMarker.addTo(spotLayer);
    return;
  }

  hubMarker = L.marker([Number(hub.lat), Number(hub.lon)], {
    icon: createMarker(true),
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
    .addTo(spotLayer);
}

function drawMap(spots) {
  spotLayer.clearLayers();
  lineLayer.clearLayers();

  showHub();

  spots.forEach((spot) => {
    const lat1 = Number(spot.lat1);
    const lon1 = Number(spot.lon1);
    const lat2 = Number(spot.lat2);
    const lon2 = Number(spot.lon2);
    const validStart =
      Number.isFinite(lat1) &&
      Number.isFinite(lon1) &&
      Math.abs(lat1) <= 90 &&
      Math.abs(lon1) <= 180;
    const validEnd =
      Number.isFinite(lat2) &&
      Number.isFinite(lon2) &&
      Math.abs(lat2) <= 90 &&
      Math.abs(lon2) <= 180;
    if (!validStart && !validEnd) {
      return;
    }

    const sender = escapeHTML(spot.sender || "Unknown");
    const receiver = escapeHTML(spot.receiver || "Unknown");
    const snr = escapeHTML(spot.snr ?? "—");

    if (validStart) {
      L.marker([lat1, lon1], {
        icon: createMarker(false),
        keyboard: false,
      })
        .bindPopup(
          `
                    <div class="popup">

                        <strong>
                            ${sender}
                        </strong>

                        <span>
                            Sender · ${snr} dB
                        </span>

                    </div>
                `,
        )
        .addTo(spotLayer);
    }

    if (validEnd) {
      L.marker([lat2, lon2], {
        icon: createMarker(false),
        keyboard: false,
      })
        .bindPopup(
          `
                    <div class="popup">

                        <strong>
                            ${receiver}
                        </strong>

                        <span>
                            Receiver · ${snr} dB
                        </span>

                    </div>
                `,
        )
        .addTo(spotLayer);
    }

    if (validStart && validEnd) {
      L.polyline(
        [
          [lat1, lon1],
          [lat2, lon2],
        ],
        {
          color: "#16a36b",
          weight: 1,
          opacity: 0.4,
          dashArray: "4 6",
          interactive: false,
        },
      ).addTo(lineLayer);
    }
  });
}

function createSpotCard(spot, index) {
  const frequency = getFrequencyMHz(spot);

  const frequencyText =
    frequency === null ? "Unknown" : `${frequency.toFixed(3)} MHz`;

  const band = getBand(frequency) || "—";

  let distanceText = "—";
  let bearingText = "—";

  if (
    Number.isFinite(Number(spot.lat1)) &&
    Number.isFinite(Number(spot.lon1)) &&
    Number.isFinite(Number(spot.lat2)) &&
    Number.isFinite(Number(spot.lon2))
  ) {
    const distance = distanceBetween(
      Number(spot.lat1),
      Number(spot.lon1),
      Number(spot.lat2),
      Number(spot.lon2),
    );

    const bearing = calculateBearing(
      Number(spot.lat1),
      Number(spot.lon1),
      Number(spot.lat2),
      Number(spot.lon2),
    );

    distanceText =
      distance >= 1000
        ? `${(distance / 1000).toFixed(1)} Mm`
        : `${Math.round(distance)} km`;

    bearingText = `${Math.round(bearing)}° ${bearingName(bearing)}`;
  }

  const card = document.createElement("article");

  card.className = "spot-card";

  card.dataset.index = index;

  card.innerHTML = `
        <div class="spot-topline">

            <span>
                ${escapeHTML(spot.mode || "UNKNOWN")}
            </span>

            <span>
                ${frequencyText}
            </span>

        </div>


        <div class="spot-route">

            <span>
                ${escapeHTML(spot.sender || "?")}
            </span>

            <span class="route-arrow">
                ->
            </span>

            <span>
                ${escapeHTML(spot.receiver || "?")}
            </span>

        </div>


        <div class="spot-info">

            <span>
                ${band}
            </span>

            <span>
                ${distanceText}
            </span>

            <span>
                ${bearingText}
            </span>

        </div>


        <div class="spot-bottomline">

            <span>
                Signal
            </span>

            <strong>
                ${escapeHTML(spot.snr ?? "—")} dB
            </strong>

            <span class="signal-label">
                ${signalDescription(spot.snr)}
            </span>

        </div>
    `;

  card.addEventListener("click", () => focusSpot(spot));

  return card;
}

function renderCards(spots) {
  elements.spots.innerHTML = "";

  if (spots.length === 0) {
    elements.spots.innerHTML = `
            <div class="empty-state">

                <div>
                    NO MATCHING SPOTS
                </div>

                <span>
                    Try another band or search term.
                </span>

            </div>
        `;

    return;
  }

  spots.forEach((spot, index) => {
    elements.spots.appendChild(createSpotCard(spot, index));
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

  if (points.length === 0) {
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

function render() {
  const visibleSpots = getVisibleSpots();

  renderCards(visibleSpots);

  drawMap(visibleSpots);

  elements.count.textContent = visibleSpots.length;

  const meterValue = Math.min(visibleSpots.length * 8, 100);

  elements.meter.style.width = `${meterValue}%`;
}

function setConnectionState(online) {
  elements.status.textContent = online ? "RUNNING" : "OFFLINE";

  elements.statusDot.classList.toggle("online", online);
}

function saveLocalSnapshot(spots, savedAt) {
  try {
    localStorage.setItem(
      "wavelens_snapshot",
      JSON.stringify({
        saved_at: savedAt,
        spots,
      }),
    );
  } catch (error) {
    console.warn("Could not save local snapshot.", error);
  }
}

function loadLocalSnapshot() {
  try {
    const raw = localStorage.getItem("wavelens_snapshot");

    if (!raw) {
      return false;
    }

    const snapshot = JSON.parse(raw);

    if (!Array.isArray(snapshot.spots)) {
      return false;
    }

    state.spots = snapshot.spots;

    state.snapshotTime = snapshot.saved_at
      ? new Date(snapshot.saved_at * 1000)
      : null;

    updateSnapshotLabel();

    render();

    return true;
  } catch (error) {
    console.warn("Could not load local snapshot.", error);

    return false;
  }
}

function updateSnapshotLabel() {
  if (!state.snapshotTime) {
    elements.lastUpdate.textContent = "—";

    return;
  }

  elements.lastUpdate.textContent = "Last updated: " + state.snapshotTime.toUTCString().slice(17, 25);
}

async function loadSnapshot(replaceLocal = true) {
  try {
    const response = await fetch(`/api/snapshot?_=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.spots)) {
      throw new Error("Invalid snapshot");
    }

    if (replaceLocal || state.spots.length === 0) {
      state.spots = data.spots;

      state.snapshotTime = data.saved_at
        ? new Date(data.saved_at * 1000)
        : null;

      saveLocalSnapshot(state.spots, data.saved_at);

      updateSnapshotLabel();

      render();
    }

    setConnectionState(true);

    elements.feedState.textContent = "SNAPSHOT";
  } catch (error) {
    console.error("WaveLens snapshot:", error);

    setConnectionState(false);
  }
}

async function updateSnapshot() {
  elements.update.disabled = true;

  elements.update.textContent = "UPDATING";

  try {
    const response = await fetch("/api/snapshot/update", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    state.spots = Array.isArray(data.spots) ? data.spots : [];

    state.snapshotTime = data.saved_at
      ? new Date(data.saved_at * 1000)
      : new Date();

    saveLocalSnapshot(state.spots, data.saved_at);

    updateSnapshotLabel();

    elements.feedState.textContent = "UPDATED";

    render();

    setConnectionState(true);
  } catch (error) {
    console.error("Could not update snapshot:", error);

    elements.feedState.textContent = "ERROR";
  } finally {
    elements.update.disabled = false;

    elements.update.textContent = "UPDATE";
  }
}

elements.update.addEventListener("click", updateSnapshot);

elements.clear.addEventListener("click", () => {
  state.spots = [];

  render();

  elements.feedState.textContent = "CLEARED";

  elements.lastUpdate.textContent = "cleared";
});

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportCSV() {
  const spots = getVisibleSpots();

  if (spots.length === 0) {
    elements.feedState.textContent = "NO DATA";

    return;
  }

  const rows = [
    [
      "Sender",
      "Receiver",
      "Frequency",
      "Band",
      "Mode",
      "SNR",
      "Sender Grid",
      "Receiver Grid",
      "Sender Latitude",
      "Sender Longitude",
      "Receiver Latitude",
      "Receiver Longitude",
      "Timestamp",
    ],
  ];

  spots.forEach((spot) => {
    const frequency = getFrequencyMHz(spot);

    rows.push([
      spot.sender,
      spot.receiver,

      frequency === null ? "" : frequency.toFixed(3),

      getBand(frequency) || "",

      spot.mode,
      spot.snr,

      spot.sender_grid,
      spot.receiver_grid,

      spot.lat1,
      spot.lon1,

      spot.lat2,
      spot.lon2,

      spot.timestamp ? new Date(spot.timestamp * 1000).toISOString() : "",
    ]);
  });

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download = `wavelens-${new Date()
    .toISOString()
    .slice(0, 19)
    .replaceAll(":", "-")}.csv`;

  document.body.appendChild(link);

  link.click();

  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  elements.feedState.textContent = "CSV EXPORTED";
}

elements.export.addEventListener("click", exportCSV);

function loadTheme() {
  const theme = localStorage.getItem("wavelens_theme") || "dark";

  document.documentElement.classList.toggle("dark-theme", theme === "dark");
}

elements.theme.addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark-theme");

  localStorage.setItem("wavelens_theme", dark ? "dark" : "light");
});

elements.zoomIn.addEventListener("click", () => map.zoomIn());

elements.zoomOut.addEventListener("click", () => map.zoomOut());

loadTheme();

selectBand(state.band);

loadLocalSnapshot();

loadSnapshot(true);

setTimeout(() => map.invalidateSize(), 300);

window.addEventListener("resize", () => map.invalidateSize());
