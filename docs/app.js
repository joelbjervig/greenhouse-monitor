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

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
