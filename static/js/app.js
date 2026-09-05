const map = L.map('map').setView([-25.2744, 133.7751], 4);

// Map tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap Contributors"
}).addTo(map);

fetch('/api/spots')
    .then(response => response.json())
    .then(data => {
        data.forEach(spot => {
            L.marker([spot.lat1, spot.lon1]).addTo(map)
                .bindPopup(`Sender: ${spot.sender} <br> SNR: ${spot.snr} dB`);

            const latlngs = [
                [spot.lat1, spot.lon1],
                [spot.lat2, spot.lon2],
            ]
            L.polyline(latlngs, {color: 'cyan', weight: 2}).addTo(map);
        });
    });