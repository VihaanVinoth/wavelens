document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map', { zoomControl: false }).setView([-25, 135], 3);
    
    const darkTileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_2y0s_1_cdcd0931ca75cac323a4c80b';
    const lightTileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_2y0s_1_cdcd0931ca75cac323a4c80b';
    
    let tileLayer = L.tileLayer(darkTileUrl, {
        maxZoom: 19,
        subdomains: 'abcd',
    }).addTo(map);

    let spotLayers = L.layerGroup().addTo(map);
    let allSpots = [];

    function updateClock() {
        const now = new Date();
        const utcString = now.toISOString().slice(11, 19);
        const clockEl = document.getElementById('utc-clock');
        if (clockEl) clockEl.textContent = utcString;
    }
    setInterval(updateClock, 1000);
    updateClock();

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const html = document.documentElement;
            const current = html.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);

            map.removeLayer(tileLayer);
            tileLayer = L.tileLayer(next === 'light' ? lightTileUrl : darkTileUrl, {
                maxZoom: 19,
                subdomains: 'abcd',
            }).addTo(map);
        });
    }

    const bandBtns = document.querySelectorAll('.band-btn');
    const freqDisplay = document.getElementById('vfo-freq');
    bandBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            bandBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const freq = btn.getAttribute('data-freq');
            if (freqDisplay) freqDisplay.textContent = freq;
            renderSpots(allSpots);
        });
    });

    async function fetchSpots() {
        try {
            const res = await fetch('/api/spots');
            const data = await res.json();
            allSpots = data;
            renderSpots(allSpots);
        } catch (err) {
            console.error('Telemetry ingestion error:', err);
            const listEl = document.getElementById('spots-list');
            if (listEl) {
                listEl.innerHTML = `<div class="spot-card" style="border-left-color: var(--danger);">Stream Offline</div>`;
            }
        }
    }

    function renderSpots(spots) {
        spotLayers.clearLayers();
        const listEl = document.getElementById('spots-list');
        const countEl = document.getElementById('stat-count');
        const snrEl = document.getElementById('stat-snr');
        const meterBar = document.getElementById('s-meter-bar');

        if (!listEl) return;
        listEl.innerHTML = '';

        const filterInput = document.getElementById('callsign-filter');
        const filterVal = filterInput ? filterInput.value.toUpperCase() : '';
        const activeBandBtn = document.querySelector('.band-btn.active');
        const activeFreqHz = activeBandBtn ? parseFloat(activeBandBtn.getAttribute('data-freq').replace(/\./g, '')) * 10 : 14074000;

        const filtered = spots.filter(s => {
            if (Math.abs(s.frequency - activeFreqHz) > 50000) return false;
            if (!filterVal) return true;
            return s.sender.includes(filterVal) || s.receiver.includes(filterVal);
        });

        if (countEl) countEl.textContent = filtered.length;

        let totalSnr = 0;
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const lineColor = currentTheme === 'light' ? '#57606a' : '#8b949e';

        filtered.forEach(spot => {
            totalSnr += spot.snr || 0;
            const freqMHz = (spot.frequency / 1000000).toFixed(3);

            if (spot.lat1 && spot.lon1 && spot.lat2 && spot.lon2) {
                const latlngs = [
                    [spot.lat1, spot.lon1],
                    [spot.lat2, spot.lon2]
                ];
                
                const line = L.polyline(latlngs, { 
                    color: lineColor, 
                    weight: 1.5, 
                    opacity: 0.6 
                });
                line.bindPopup(`<b>Path Route:</b> ${spot.sender} → ${spot.receiver}<br><b>Mode:</b> ${spot.mode}<br><b>Freq:</b> ${freqMHz} MHz<br><b>SNR:</b> ${spot.snr} dB`);
                spotLayers.addLayer(line);

                const senderDot = L.circleMarker([spot.lat1, spot.lon1], {
                    radius: 5,
                    color: '#f85149',
                    fillColor: '#f85149',
                    fillOpacity: 0.9,
                    weight: 1
                });
                senderDot.bindPopup(`<b>Sender (TX):</b> ${spot.sender}<br><b>Target:</b> ${spot.receiver}<br><b>Mode:</b> ${spot.mode}<br><b>Freq:</b> ${freqMHz} MHz<br><b>SNR Reported:</b> ${spot.snr} dB`);
                spotLayers.addLayer(senderDot);
                
                const receiverDot = L.circleMarker([spot.lat2, spot.lon2], {
                    radius: 4,
                    color: '#58a6ff',
                    fillColor: '#58a6ff',
                    fillOpacity: 0.9,
                    weight: 1
                });
                receiverDot.bindPopup(`<b>Receiver (RX):</b> ${spot.receiver}<br><b>From:</b> ${spot.sender}<br><b>Mode:</b> ${spot.mode}<br><b>Freq:</b> ${freqMHz} MHz<br><b>SNR Received:</b> ${spot.snr} dB`);
                spotLayers.addLayer(receiverDot);
            }

            const card = document.createElement('div');
            card.className = 'spot-card';
            card.innerHTML = `
                <div class="spot-header">
                    <span>${spot.mode} · ${(spot.frequency / 1000000).toFixed(3)} MHz</span>
                    <span>${spot.snr} dB</span>
                </div>
                <div class="spot-route">${spot.sender} → ${spot.receiver}</div>
            `;
            listEl.appendChild(card);
        });

        if (filtered.length > 0) {
            const avgSnr = Math.round(totalSnr / filtered.length);
            if (snrEl) snrEl.textContent = `${avgSnr} dB`;
            if (meterBar) {
                const pct = Math.min(Math.max(((avgSnr + 30) / 40) * 100, 5), 100);
                meterBar.style.width = `${pct}%`;
            }
        } else {
            if (snrEl) snrEl.textContent = `0 dB`;
            if (meterBar) meterBar.style.width = `0%`;
        }
    }

    const filterInput = document.getElementById('callsign-filter');
    if (filterInput) {
        filterInput.addEventListener('input', () => renderSpots(allSpots));
    }

    fetchSpots();
});