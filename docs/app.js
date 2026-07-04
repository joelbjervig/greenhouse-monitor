// Apps Script Web App URL (same deployment, doGet returns JSON)
const API_URL = 'https://script.google.com/macros/s/AKfycbzSCfVOhfDwxb2ymJmoYF-PILGAPOAikMPT1LcVcRXTBFt_Jtv_-9pq1AXAeAg57uWy/exec';

const plotLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    margin: { l: 40, r: 16, t: 8, b: 32 },
    font: { color: '#aaa', size: 10 },
    xaxis: { gridcolor: '#2a2a4a', tickformat: '%H:%M' },
    yaxis: { gridcolor: '#2a2a4a' },
    legend: { orientation: 'h', y: -0.2 },
    height: 220,
};

const plotConfig = {
    responsive: true,
    displayModeBar: false,
    scrollZoom: true,
};

async function fetchData() {
    const subtitle = document.getElementById('lastUpdate');
    subtitle.textContent = 'Refreshing...';

    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        renderDashboard(json);
    } catch (err) {
        subtitle.textContent = `Error: ${err.message}`;
        subtitle.classList.add('error');
    }
}

function renderDashboard({ headers, data }) {
    if (!data || data.length === 0) {
        document.getElementById('lastUpdate').textContent = 'No data yet';
        return;
    }

    // Find column names (flexible matching)
    const colMap = findColumns(headers);

    // Parse timestamps - use the first column as index or row number
    const timestamps = data.map((row, i) => {
        if (row.timestamp) return new Date(row.timestamp);
        if (row.date) return new Date(row.date);
        return i;
    });

    const temp = data.map(r => parseFloat(r[colMap.temp]) || 0);
    const hum = data.map(r => parseFloat(r[colMap.hum]) || 0);
    const press = data.map(r => parseFloat(r[colMap.press]) || 0);
    const red = data.map(r => parseInt(r[colMap.red]) || 0);
    const green = data.map(r => parseInt(r[colMap.green]) || 0);
    const blue = data.map(r => parseInt(r[colMap.blue]) || 0);

    // Update cards with latest values
    const latest = data[data.length - 1];
    document.getElementById('val-temp').textContent = parseFloat(latest[colMap.temp]).toFixed(1);
    document.getElementById('val-hum').textContent = parseFloat(latest[colMap.hum]).toFixed(1);
    document.getElementById('val-press').textContent = parseFloat(latest[colMap.press]).toFixed(1);
    document.getElementById('val-light').textContent = parseInt(latest[colMap.green]) || 0;

    const now = new Date();
    document.getElementById('lastUpdate').textContent = `Last refresh: ${now.toLocaleTimeString()}  ·  ${data.length} readings`;
    document.getElementById('lastUpdate').classList.remove('error');

    // Temperature & Humidity plot
    Plotly.react('plot-temp-hum', [
        { x: timestamps, y: temp, name: 'Temp °C', type: 'scatter', line: { color: '#e74c3c', width: 2 } },
        { x: timestamps, y: hum, name: 'Humidity %', type: 'scatter', yaxis: 'y2', line: { color: '#3498db', width: 2 } },
    ], {
        ...plotLayout,
        yaxis: { ...plotLayout.yaxis, title: '°C' },
        yaxis2: { overlaying: 'y', side: 'right', gridcolor: '#2a2a4a', title: '%' },
    }, plotConfig);

    // Pressure plot
    Plotly.react('plot-press', [
        { x: timestamps, y: press, name: 'Pressure', type: 'scatter', line: { color: '#9b59b6', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(155,89,182,0.1)' },
    ], {
        ...plotLayout,
        yaxis: { ...plotLayout.yaxis, title: 'kPa' },
    }, plotConfig);

    // Light plot
    Plotly.react('plot-light', [
        { x: timestamps, y: red, name: 'Red', type: 'scatter', line: { color: '#e74c3c', width: 1.5 } },
        { x: timestamps, y: green, name: 'Green', type: 'scatter', line: { color: '#2ecc71', width: 1.5 } },
        { x: timestamps, y: blue, name: 'Blue', type: 'scatter', line: { color: '#3498db', width: 1.5 } },
    ], plotLayout, plotConfig);
}

function findColumns(headers) {
    // Flexible column matching - works with various header names
    const map = { temp: 'temp', hum: 'hum', press: 'press', red: 'red', green: 'green', blue: 'blue' };

    for (const h of headers) {
        const hl = (typeof h === 'string' ? h : '').toLowerCase();
        if (hl.includes('temp')) map.temp = h;
        else if (hl.includes('hum')) map.hum = h;
        else if (hl.includes('press')) map.press = h;
        else if (hl === 'red' || hl === 'r') map.red = h;
        else if (hl === 'green' || hl === 'g') map.green = h;
        else if (hl === 'blue' || hl === 'b') map.blue = h;
    }

    return map;
}

// Auto-refresh every 2 minutes
fetchData();
setInterval(fetchData, 120000);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
