// Apps Script Web App URL (same deployment, doGet returns JSON)
const API_URL = 'https://script.google.com/macros/s/AKfycbzSCfVOhfDwxb2ymJmoYF-PILGAPOAikMPT1LcVcRXTBFt_Jtv_-9pq1AXAeAg57uWy/exec';

const plotLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    margin: { l: 32, r: 8, t: 4, b: 24 },
    font: { color: '#aaa', size: 10 },
    xaxis: { gridcolor: '#2a2a4a', tickformat: '%H:%M', showgrid: false, tickfont: { size: 9 } },
    yaxis: { gridcolor: '#2a2a4a', showgrid: false, tickfont: { size: 9 } },
    showlegend: false,
};

const plotConfig = {
    responsive: true,
    displayModeBar: false,
    scrollZoom: false,
    staticPlot: true,
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

    // Parse timestamps from the first column (Apps Script writes ISO datetime)
    const timestamps = data.map((row, i) => {
        // Try common timestamp column names
        const ts = row[colMap.timestamp] || row[headers[0]];
        if (ts) {
            const d = new Date(ts);
            if (!isNaN(d)) return d;
        }
        return i;
    });

    const temp = data.map(r => parseFloat(r[colMap.temp]) || 0);
    const hum = data.map(r => parseFloat(r[colMap.hum]) || 0);
    const press = data.map(r => parseFloat(r[colMap.press]) || 0);
    const red = data.map(r => parseInt(r[colMap.red]) || 0);
    const green = data.map(r => parseInt(r[colMap.green]) || 0);
    const blue = data.map(r => parseInt(r[colMap.blue]) || 0);
    const gas = data.map(r => parseInt(r[colMap.gas]) || 0);
    const ir = data.map(r => parseInt(r[colMap.ir]) || 0);

    // Update latest values
    const latest = data[data.length - 1];
    document.getElementById('val-temp').textContent = parseFloat(latest[colMap.temp]).toFixed(1) + '°C';
    document.getElementById('val-hum').textContent = parseFloat(latest[colMap.hum]).toFixed(1) + '%';
    document.getElementById('val-press').textContent = parseFloat(latest[colMap.press]).toFixed(1) + ' kPa';
    document.getElementById('val-gas').textContent = (parseInt(latest[colMap.gas]) || 0) + ' Ω';
    document.getElementById('val-light').textContent = parseInt(latest[colMap.green]) || 0;
    document.getElementById('val-ir').textContent = parseInt(latest[colMap.ir]) || 0;

    // Set page background gradient based on current RGB sensor values
    const rVal = Math.min(parseInt(latest[colMap.red]) || 0, 255);
    const gVal = Math.min(parseInt(latest[colMap.green]) || 0, 255);
    const bVal = Math.min(parseInt(latest[colMap.blue]) || 0, 255);
    // Scale for visibility (sensor values are often low), keep it subtle
    const scale = 0.6;
    const rBg = Math.min(Math.round(rVal * scale), 60);
    const gBg = Math.min(Math.round(gVal * scale), 60);
    const bBg = Math.min(Math.round(bVal * scale), 60);
    document.body.style.background = `linear-gradient(to bottom, rgb(${rBg + 15}, ${gBg + 15}, ${bBg + 15}), rgb(${Math.round(rBg * 0.4)}, ${Math.round(gBg * 0.4)}, ${Math.round(bBg * 0.4)}))`;
    document.body.style.minHeight = '100vh';

    const now = new Date();
    document.getElementById('lastUpdate').textContent = `Last refresh: ${now.toLocaleTimeString()}  ·  ${data.length} readings`;
    document.getElementById('lastUpdate').classList.remove('error');

    // Render individual tile plots
    const tileTrace = (y, color) => [{ x: timestamps, y, type: 'scatter', mode: 'lines', line: { color, width: 1.5 }, fill: 'tozeroy', fillcolor: color + '18' }];

    Plotly.react('plot-temp', tileTrace(temp, '#e74c3c'), plotLayout, plotConfig);
    Plotly.react('plot-hum', tileTrace(hum, '#3498db'), plotLayout, plotConfig);
    Plotly.react('plot-press', tileTrace(press, '#9b59b6'), plotLayout, plotConfig);
    Plotly.react('plot-gas', tileTrace(gas, '#f39c12'), plotLayout, plotConfig);
    Plotly.react('plot-light', [
        { x: timestamps, y: red, type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 1 } },
        { x: timestamps, y: green, type: 'scatter', mode: 'lines', line: { color: '#2ecc71', width: 1 } },
        { x: timestamps, y: blue, type: 'scatter', mode: 'lines', line: { color: '#3498db', width: 1 } },
    ], plotLayout, plotConfig);
    Plotly.react('plot-ir', tileTrace(ir, '#8e44ad'), plotLayout, plotConfig);

    // Store data for expanded interactive view
    storeChartData('plot-temp', 'Temperature', parseFloat(latest[colMap.temp]).toFixed(1) + '°C',
        [{ x: timestamps, y: temp, type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(231,76,60,0.1)' }]);
    storeChartData('plot-hum', 'Humidity', parseFloat(latest[colMap.hum]).toFixed(1) + '%',
        [{ x: timestamps, y: hum, type: 'scatter', mode: 'lines', line: { color: '#3498db', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(52,152,219,0.1)' }]);
    storeChartData('plot-press', 'Pressure', parseFloat(latest[colMap.press]).toFixed(1) + ' kPa',
        [{ x: timestamps, y: press, type: 'scatter', mode: 'lines', line: { color: '#9b59b6', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(155,89,182,0.1)' }]);
    storeChartData('plot-gas', 'Gas Resistance', (parseInt(latest[colMap.gas]) || 0) + ' Ω',
        [{ x: timestamps, y: gas, type: 'scatter', mode: 'lines', line: { color: '#f39c12', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(243,156,18,0.1)' }]);
    storeChartData('plot-light', 'Light (RGB)', 'R:' + (parseInt(latest[colMap.red])||0) + ' G:' + (parseInt(latest[colMap.green])||0) + ' B:' + (parseInt(latest[colMap.blue])||0), [
        { x: timestamps, y: red, name: 'Red', type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 2 } },
        { x: timestamps, y: green, name: 'Green', type: 'scatter', mode: 'lines', line: { color: '#2ecc71', width: 2 } },
        { x: timestamps, y: blue, name: 'Blue', type: 'scatter', mode: 'lines', line: { color: '#3498db', width: 2 } },
    ]);
    storeChartData('plot-ir', 'Infrared', (parseInt(latest[colMap.ir]) || 0).toString(),
        [{ x: timestamps, y: ir, type: 'scatter', mode: 'lines', line: { color: '#8e44ad', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(142,68,173,0.1)' }]);
}

function findColumns(headers) {
    // Flexible column matching - works with various header names
    const map = { timestamp: null, temp: 'temp', hum: 'hum', press: 'press', red: 'red', green: 'green', blue: 'blue', gas: 'gas', ir: 'ir' };

    for (const h of headers) {
        const hl = (typeof h === 'string' ? h : '').toLowerCase();
        if (hl.includes('time') || hl.includes('date') || hl.includes('stamp')) map.timestamp = h;
        else if (hl.includes('temp')) map.temp = h;
        else if (hl.includes('hum')) map.hum = h;
        else if (hl.includes('press')) map.press = h;
        else if (hl === 'red' || hl === 'r') map.red = h;
        else if (hl === 'green' || hl === 'g') map.green = h;
        else if (hl === 'blue' || hl === 'b') map.blue = h;
        else if (hl.includes('gas')) map.gas = h;
        else if (hl === 'ir') map.ir = h;
    }

    return map;
}

// Auto-refresh every 2 minutes
fetchData();
setInterval(fetchData, 120000);

// --- Expand tile on click ---
let chartData = {}; // Store data for expanded view

function storeChartData(id, title, value, traces) {
    chartData[id] = { title, value, traces };
}

function openOverlay(id) {
    const info = chartData[id];
    if (!info) return;

    document.getElementById('overlay-title').textContent = info.title;
    document.getElementById('overlay-value').textContent = info.value;
    document.getElementById('overlay').classList.add('active');

    const expandedLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        margin: { l: 40, r: 16, t: 8, b: 36 },
        font: { color: '#aaa', size: 11 },
        xaxis: { gridcolor: '#2a2a4a', tickformat: '%H:%M', tickfont: { size: 10 } },
        yaxis: { gridcolor: '#2a2a4a', tickfont: { size: 10 } },
        showlegend: info.traces.length > 1,
        legend: { orientation: 'h', y: -0.15, font: { color: '#aaa' } },
    };

    const expandedConfig = {
        responsive: true,
        displayModeBar: false,
        scrollZoom: true,
    };

    setTimeout(() => {
        Plotly.react('plot-expanded', info.traces, expandedLayout, expandedConfig);
    }, 50);
}

function closeOverlay(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('overlay').classList.remove('active');
    Plotly.purge('plot-expanded');
}

// Add click listeners to tiles
document.querySelectorAll('.plot-tile').forEach(tile => {
    tile.style.cursor = 'pointer';
    tile.addEventListener('click', () => {
        const plotArea = tile.querySelector('.plot-area');
        if (plotArea) openOverlay(plotArea.id);
    });
});

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
