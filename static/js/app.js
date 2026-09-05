let currentBand = '20m';
const themes = ['dark', 'light'];
const themeNames = ['Dark', 'Light'];

let savedTheme = localStorage.getItem('wavelens_theme') || 'dark';
let currentThemeIndex = themes.indexOf(savedTheme);
if (currentThemeIndex === -1) currentThemeIndex = 0;

document.documentElement.setAttribute('data-theme', themes[currentThemeIndex]);

let initialTileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2y0s_1_cdcd0931ca75cac323a4c80b';
if (themes[currentThemeIndex] === 'light') {
    initialTileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2y0s_1_cdcd0931ca75cac323a4c80b';
}

const map = L.map('map', {
    minZoom: 2,
    worldCopyJump: true,
    maxBounds: [[-85, -Infinity], [85, Infinity]],
    maxBoundsViscosity: 1.0,
    attributionControl: false
}).setView([-25.2744, 133.7751], 3);

let tileLayer = L.tileLayer(initialTileUrl, {
    maxZoom: 19,
    subdomains: 'abcd'
}).addTo(map);

const spotLayer = L.layerGroup().addTo(map);

setTimeout(() => {
    map.invalidateSize();
}, 200);

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.innerText = `${themeNames[currentThemeIndex]}`;
    }
    
    const filterInput = document.getElementById('callsign-filter');
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            renderSpots();
        });
    }
});

document.getElementById('theme-toggle').addEventListener('click', () => {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    
    localStorage.setItem('wavelens_theme', newTheme);
    
    const htmlEl = document.documentElement;
    htmlEl.setAttribute('data-theme', newTheme);
    document.getElementById('theme-toggle').innerText = `${themeNames[currentThemeIndex]}`;

    map.removeLayer(tileLayer);
    
    let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2y0s_1_cdcd0931ca75cac323a4c80b';
    if (newTheme === 'light') {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2y0s_1_cdcd0931ca75cac323a4c80b';
    }
    tileLayer = L.tileLayer(tileUrl, { maxZoom: 19, subdomains: 'abcd' }).addTo(map);
});

setInterval(() => {
    const now = new Date();
    document.getElementById('utc-clock').innerText = now.toUTCString().slice(17, 25) + ' UTC';
}, 1000);

document.querySelectorAll('.band-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.band-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentBand = e.target.getAttribute('data-band');
        document.getElementById('vfo-freq').innerText = e.target.getAttribute('data-freq');
        loadSpots();
    });
});

let cachedSpotsData = [];

function loadSpots() {
    fetch(`/api/spots?band=${currentBand}`)
        .then(response => response.json())
        .then(data => {
            cachedSpotsData = data;
            renderSpots();
        })
        .catch(err => console.error("Telemetry fetch error:", err));
}

function renderSpots() {
    spotLayer.clearLayers();
    const listContainer = document.getElementById('spots-list');
    listContainer.innerHTML = '';

    const filterInput = document.getElementById('callsign-filter');
    const query = filterInput ? filterInput.value.toUpperCase().trim() : '';

    const filteredData = query ? cachedSpotsData.filter(spot => 
        (spot.sender && spot.sender.toUpperCase().includes(query)) || 
        (spot.receiver && spot.receiver.toUpperCase().includes(query))
    ) : cachedSpotsData;

    document.getElementById('stat-count').innerText = filteredData.length;

    if (filteredData.length === 0) {
        listContainer.innerHTML = '<div class="spot-card">No matching telemetry paths found for filter.</div>';
        document.getElementById('stat-snr').innerText = '0 dB';
        document.getElementById('s-meter-bar').style.width = '5%';
        return;
    }

    let totalSnr = 0;
    filteredData.forEach(spot => {
        if (spot.lat1 === undefined || spot.lon1 === undefined || spot.lat2 === undefined || spot.lon2 === undefined) return;
        let snrVal = parseInt(spot.snr || 0);
        totalSnr += snrVal;

        let freqMHz = spot.frequency ? (spot.frequency / 1000000).toFixed(3) : document.getElementById('vfo-freq').innerText;

        const p1 = [spot.lat1, spot.lon1];
        const p2 = [spot.lat2, spot.lon2];

        L.circleMarker(p1, {
            radius: 4.5,
            color: '#00ffcc',
            fillColor: '#00ffcc',
            fillOpacity: 1,
            weight: 1.5
        }).addTo(spotLayer).bindPopup(`<b>TX: ${spot.sender}</b><br>Mode: ${spot.mode || 'FT8'}<br>Freq: ${freqMHz} MHz<br>SNR: ${snrVal} dB`);

        L.circleMarker(p2, {
            radius: 4.5,
            color: '#ff5555',
            fillColor: '#ff5555',
            fillOpacity: 1,
            weight: 1.5
        }).addTo(spotLayer).bindPopup(`<b>RX: ${spot.receiver}</b><br>Mode: ${spot.mode || 'FT8'}<br>Freq: ${freqMHz} MHz`);

        L.polyline([p1, p2], {
            color: themes[currentThemeIndex] === 'dark' ? '#ff5555' : '#dc2626',
            weight: 1.5,
            opacity: 0.75
        }).addTo(spotLayer);

        const card = document.createElement('div');
        card.className = 'spot-card';
        card.innerHTML = `
            <div class="spot-header">
                <span>${spot.mode || 'FT8'} // ${freqMHz} MHz</span>
                <span style="color: ${snrVal >= 0 ? '#3fb950' : '#f85149'};">${snrVal >= 0 ? '+' : ''}${snrVal} dB</span>
            </div>
            <div class="spot-route">${spot.sender} &rarr; ${spot.receiver}</div>
        `;
        listContainer.appendChild(card);
    });

    const avgSnr = Math.round(totalSnr / filteredData.length);
    document.getElementById('stat-snr').innerText = `${avgSnr >= 0 ? '+' : ''}${avgSnr} dB`;

    let normalizedSnr = Math.min(Math.max(avgSnr, -25), 5);
    let meterPct = ((normalizedSnr + 25) / 30) * 100;
    meterPct = Math.max(meterPct, 10);
    
    document.getElementById('s-meter-bar').style.width = `${meterPct}%`;
    
    map.invalidateSize();
}

loadSpots();
setInterval(loadSpots, 30000);