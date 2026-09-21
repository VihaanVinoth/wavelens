const DEFAULT_CENTER = [20, 0];

const BAND_FREQUENCIES = {
    "160m": "1.900",
    "80m": "3.600",
    "40m": "7.100",
    "20m": "14.074",
    "15m": "21.074",
    "10m": "28.074",
    "6m": "50.313",
    "2m": "144.174"
};

const map = L.map("map", {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 17,
    worldCopyJump: true,
    maxBounds: [
        [-90, -180],
        [90, 180]
    ],
    maxBoundsViscosity: 0.85
}).setView(DEFAULT_CENTER, 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const nodesLayer = L.layerGroup().addTo(map);
const linesLayer = L.layerGroup().addTo(map);

const elements = {
    clock: document.getElementById("utc-clock"),
    count: document.getElementById("stat-count"),
    spots: document.getElementById("spots-list"),
    filter: document.getElementById("callsign-filter"),
    frequency: document.getElementById("freq-display"),
    status: document.getElementById("connection-status"),
    statusDot: document.getElementById("status-dot"),
    mapZoomIn: document.getElementById("zoom-in"),
    mapZoomOut: document.getElementById("zoom-out"),
    panel: document.getElementById("radar-hud"),
    themeToggle: document.getElementById("theme-toggle")
};

const activeSpotsMap = new Map(); 
let hubMarkerInitialized = false;

function updateClock() {
    if (!elements.clock) return;

    const now = new Date();
    elements.clock.textContent =
        now.toUTCString().slice(17, 25) + " UTC";
}

updateClock();
setInterval(updateClock, 1000);

elements.mapZoomIn?.addEventListener("click", () => {
    map.zoomIn();
});

elements.mapZoomOut?.addEventListener("click", () => {
    map.zoomOut();
});

function setBand(band) {
    document.querySelectorAll(".band-btn").forEach(button => {
        if (button.getAttribute("data-band") === band) {
            button.classList.add("active");
        } else {
            button.classList.remove("active");
        }
    });

    const frequency = BAND_FREQUENCIES[band];

    if (frequency && elements.frequency) {
        elements.frequency.textContent = frequency;
    }
}

document.querySelectorAll(".band-btn").forEach(button => {
    button.addEventListener("click", () => {
        setBand(button.dataset.band);
    });
});

function filterSpots() {
    if (!elements.filter) return;

    const query = elements.filter.value
        .trim()
        .toUpperCase();

    document.querySelectorAll(".spot-card").forEach(card => {
        const searchableText = card.dataset.search || "";
        card.hidden = !searchableText.includes(query);
    });
}

elements.filter?.addEventListener("input", filterSpots);

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function createHubIcon() {
    return L.divIcon({
        className: "map-marker-wrapper",
        html: `<span class="map-marker map-marker-hub"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
}

function createSpotIcon() {
    return L.divIcon({
        className: "map-marker-wrapper",
        html: `<span class="map-marker map-marker-spot"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
}

function createSpotCard(spot, spotId) {
    const card = document.createElement("article");

    const frequency =
        Number(spot.frequency) > 0
            ? `${(Number(spot.frequency) / 1000000).toFixed(3)} MHz`
            : "Unknown";

    const sender = escapeHTML(spot.sender || "Unknown");
    const receiver = escapeHTML(spot.receiver || "Unknown");
    const mode = escapeHTML(spot.mode || "Unknown");
    const snr = escapeHTML(spot.snr ?? "—");

    card.className = "spot-card";
    card.dataset.spotId = spotId;

    card.dataset.search = `
        ${sender}
        ${receiver}
        ${mode}
        ${frequency}
    `.toUpperCase();

    card.innerHTML = `
        <div class="spot-topline">
            <span>${mode}</span>
            <span>${frequency}</span>
        </div>

        <div class="spot-route">
            <span>${sender}</span>
            <span class="route-arrow">-></span>
            <span>${receiver}</span>
        </div>

        <div class="spot-bottomline">
            <span>Signal report</span>
            <strong>${snr} dB</strong>
        </div>
    `;

    return card;
}

function setConnectionState(connected) {
    if (!elements.status || !elements.statusDot) return;

    if (connected) {
        elements.status.textContent = "LIVE";
        elements.statusDot.classList.add("online");
    } else {
        elements.status.textContent = "OFFLINE";
        elements.statusDot.classList.remove("online");
    }
}

async function fetchSpots() {
    try {
        const response = await fetch("/api/spots", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const spots = await response.json();

        if (!Array.isArray(spots)) {
            throw new Error("Invalid API response");
        }

        const hub = window.WAVELENS_CONFIG?.hub || {
            lat: -38.21,
            lon: 145.11,
            callsign: "LOCAL"
        };

        const hubCoordinate = [Number(hub.lat), Number(hub.lon)];

        if (!hubMarkerInitialized) {
            L.marker(hubCoordinate, {
                icon: createHubIcon(),
                keyboard: false
            })
                .bindPopup(`
                    <div class="popup">
                        <strong>${escapeHTML(hub.callsign)}</strong>
                        <span>WaveLens station</span>
                    </div>
                `)
                .addTo(nodesLayer);
            hubMarkerInitialized = true;
        }

        const currentFetchIds = new Set();
        const now = Date.now();

        spots.forEach(spot => {
            const lat1 = Number(spot.lat1);
            const lon1 = Number(spot.lon1);
            const lat2 = Number(spot.lat2);
            const lon2 = Number(spot.lon2);

            const hasSender = Number.isFinite(lat1) && Number.isFinite(lon1);
            const hasReceiver = Number.isFinite(lat2) && Number.isFinite(lon2);

            if (!hasSender && !hasReceiver) return;

            const spotId = `${spot.sender}-${spot.receiver}-${spot.frequency}-${spot.mode}`;
            currentFetchIds.add(spotId);

            const sender = escapeHTML(spot.sender || "Unknown");
            const receiver = escapeHTML(spot.receiver || "Unknown");
            const snr = escapeHTML(spot.snr ?? "—");

            if (activeSpotsMap.has(spotId)) {
                activeSpotsMap.get(spotId).lastSeen = now;
            } else {
                const card = createSpotCard(spot, spotId);
                
                if (elements.spots) {
                    elements.spots.prepend(card);
                }

                const markersGroup = [];
                let line = null;

                if (hasSender) {
                    const senderMarker = L.marker([lat1, lon1], {
                        icon: createSpotIcon(),
                        keyboard: false
                    })
                        .bindPopup(`
                            <div class="popup">
                                <strong>Sender: ${sender}</strong>
                                <span>SNR ${snr} dB</span>
                            </div>
                        `)
                        .addTo(nodesLayer);
                    markersGroup.push(senderMarker);
                }

                if (hasReceiver) {
                    const receiverMarker = L.marker([lat2, lon2], {
                        icon: createSpotIcon(),
                        keyboard: false
                    })
                        .bindPopup(`
                            <div class="popup">
                                <strong>Receiver: ${receiver}</strong>
                                <span>SNR ${snr} dB</span>
                            </div>
                        `)
                        .addTo(nodesLayer);
                    markersGroup.push(receiverMarker);
                }

                if (hasSender && hasReceiver) {
                    line = L.polyline(
                        [[lat1, lon1], [lat2, lon2]],
                        {
                            color: "#1a8f5b",
                            weight: 1,
                            opacity: 0.32,
                            dashArray: "3 7",
                            interactive: false
                        }
                    ).addTo(linesLayer);
                }

                activeSpotsMap.set(spotId, {
                    markers: markersGroup,
                    line,
                    card,
                    lastSeen: now
                });
            }
        });

        const EXPIRATION_MS = 30000;
        for (const [spotId, data] of activeSpotsMap.entries()) {
            if (now - data.lastSeen > EXPIRATION_MS) {
                if (data.markers) {
                    data.markers.forEach(marker => nodesLayer.removeLayer(marker));
                }
                if (data.line) {
                    linesLayer.removeLayer(data.line);
                }
                data.card?.remove();
                activeSpotsMap.delete(spotId);
            }
        }

        filterSpots();

        if (elements.count) {
            elements.count.textContent = activeSpotsMap.size;
        }

        setConnectionState(true);

    } catch (error) {
        console.error("WaveLens API error:", error);
        setConnectionState(false);
    }
}

function makeDraggable(element) {
    if (!element) return;

    const header = element.querySelector(".hud-header");
    if (!header) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener("pointerdown", event => {
        if (window.innerWidth <= 760) return;

        if (event.target.closest("button")) return;

        dragging = true;
        startX = event.clientX;
        startY = event.clientY;

        const rect = element.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        element.classList.add("dragging");
        header.setPointerCapture?.(event.pointerId);
    });

    header.addEventListener("pointermove", event => {
        if (!dragging) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        const maxLeft = window.innerWidth - element.offsetWidth - 12;
        const maxTop = window.innerHeight - element.offsetHeight - 12;

        const left = Math.max(12, Math.min(startLeft + dx, maxLeft));
        const top = Math.max(12, Math.min(startTop + dy, maxTop));

        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.right = "auto";
        element.style.bottom = "auto";
    });

    const stopDragging = () => {
        dragging = false;
        element.classList.remove("dragging");
    };

    header.addEventListener("pointerup", stopDragging);
    header.addEventListener("pointercancel", stopDragging);
}

function initTheme() {
    const savedTheme = localStorage.getItem("wavelens_theme") || "dark";
    if (savedTheme === "light") {
        document.documentElement.classList.add("light-theme");
    }

    elements.themeToggle?.addEventListener("click", () => {
        const isLight = document.documentElement.classList.toggle("light-theme");
        localStorage.setItem("wavelens_theme", isLight ? "light" : "dark");
    });
}

window.addEventListener("DOMContentLoaded", () => {
    makeDraggable(elements.panel);
    initTheme();
    setBand("20m");

    fetchSpots();
    setInterval(fetchSpots, 5000);
});