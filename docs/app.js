// Apps Script Web App URL (same deployment, doGet returns JSON)
const API_URL = 'https://script.google.com/macros/s/AKfycbzSCfVOhfDwxb2ymJmoYF-PILGAPOAikMPT1LcVcRXTBFt_Jtv_-9pq1AXAeAg57uWy/exec';

/*
 * BH1749NUC Color Mapper
 * Converts raw 16-bit sensor counts to displayable RGB.
 * whiteRef should be recalibrated when the lighting environment changes —
 * point sensor at white paper under neutral light and record R/G/B values.
 */
function createColorMapper(whiteRef, options = {}) {
    const irCoeff = options.irCoeff ?? 0.15;
    const gamma = options.gamma ?? 2.2;
    const mode = options.mode ?? 'chroma';

    function mapToRGB({ r, g, b, ir }) {
        // Check for saturation
        const saturated = r >= 65535 || g >= 65535 || b >= 65535;

        // IR subtraction
        let rC = Math.max(0, r - irCoeff * ir);
        let gC = Math.max(0, g - irCoeff * ir);
        let bC = Math.max(0, b - irCoeff * ir);

        // White balance (divide by reference, guard zero)
        rC = rC / (whiteRef.r || 1);
        gC = gC / (whiteRef.g || 1);
        bC = bC / (whiteRef.b || 1);

        // Normalize
        if (mode === 'chroma') {
            const maxVal = Math.max(rC, gC, bC, 0.001);
            rC /= maxVal;
            gC /= maxVal;
            bC /= maxVal;
        } else {
            // brightness mode — clamp to 1
            rC = Math.min(rC, 1);
            gC = Math.min(gC, 1);
            bC = Math.min(bC, 1);
        }

        // Gamma correction (linear sensor → perceptual display)
        rC = Math.pow(rC, 1 / gamma);
        gC = Math.pow(gC, 1 / gamma);
        bC = Math.pow(bC, 1 / gamma);

        // Scale to 0-255
        return {
            r: Math.round(Math.min(255, Math.max(0, rC * 255))),
            g: Math.round(Math.min(255, Math.max(0, gC * 255))),
            b: Math.round(Math.min(255, Math.max(0, bC * 255))),
            saturated,
        };
    }

    return { mapToRGB };
}

function toCssColor({ r, g, b }) {
    return `rgb(${r}, ${g}, ${b})`;
}

// White balance reference — calibrated with white paper under daylight (2026-07-04).
// Recalibrate by reading R/G/B from Google Sheet when sensor faces a white target.
const colorMapper = createColorMapper({ r: 946, g: 1617, b: 1881 });

const plotLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    margin: { l: 32, r: 8, t: 4, b: 24 },
    font: { color: 'rgba(255,255,255,0.6)', size: 10 },
    xaxis: { type: 'date', gridcolor: 'rgba(255,255,255,0.1)', tickformat: '%H:%M', showgrid: false, tickfont: { size: 9, color: 'rgba(255,255,255,0.5)' } },
    yaxis: { gridcolor: 'rgba(255,255,255,0.1)', showgrid: false, tickfont: { size: 9, color: 'rgba(255,255,255,0.5)' } },
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

    // Sort data by timestamp
    data.sort((a, b) => new Date(a[colMap.timestamp]) - new Date(b[colMap.timestamp]));

    // Pass timestamp strings directly to Plotly (it parses date strings natively)
    const timestamps = data.map(row => row[colMap.timestamp]);

    const temp = data.map(r => parseFloat(r[colMap.temp]) || 0);
    const hum = data.map(r => parseFloat(r[colMap.hum]) || 0);
    const press = data.map(r => parseFloat(r[colMap.press]) || 0);
    const red = data.map(r => parseInt(r[colMap.red]) || 0);
    const green = data.map(r => parseInt(r[colMap.green]) || 0);
    const blue = data.map(r => parseInt(r[colMap.blue]) || 0);
    const gas = data.map(r => parseInt(r[colMap.gas]) || 0);
    const ir = data.map(r => parseInt(r[colMap.ir]) || 0);
    const battery = data.map(r => parseInt(r[colMap.battery]) || 0);
    const rsrp = data.map(r => parseInt(r[colMap.rsrp]) || 0);
    const uptime = data.map(r => parseInt(r[colMap.uptime]) || 0);
    const failures = data.map(r => parseInt(r[colMap.failures]) || 0);

    // Update latest values
    const latest = data[data.length - 1];
    document.getElementById('val-temp').textContent = parseFloat(latest[colMap.temp]).toFixed(1) + '°C';
    document.getElementById('val-hum').textContent = parseFloat(latest[colMap.hum]).toFixed(1) + '%';
    document.getElementById('val-press').textContent = parseFloat(latest[colMap.press]).toFixed(1) + ' kPa';
    document.getElementById('val-gas').textContent = (parseInt(latest[colMap.gas]) || 0) + ' Ω';
    document.getElementById('val-light').textContent = parseInt(latest[colMap.green]) || 0;
    document.getElementById('val-ir').textContent = parseInt(latest[colMap.ir]) || 0;
    const batteryVal = parseInt(latest[colMap.battery]);
    document.getElementById('val-battery').textContent = batteryVal >= 0 ? batteryVal + '%' : '—';
    document.getElementById('val-rsrp').textContent = rsrpLabel(parseInt(latest[colMap.rsrp]) || -999);
    const uptimeSec = parseInt(latest[colMap.uptime]) || 0;
    const uptimeHrs = Math.floor(uptimeSec / 3600);
    const uptimeMin = Math.floor((uptimeSec % 3600) / 60);
    document.getElementById('val-uptime').textContent = uptimeHrs > 0 ? uptimeHrs + 'h ' + uptimeMin + 'm' : uptimeMin + 'm';
    document.getElementById('val-failures').textContent = parseInt(latest[colMap.failures]) || 0;

    // Set page background gradient using calibrated color mapping
    const rVal = parseInt(latest[colMap.red]) || 0;
    const gVal = parseInt(latest[colMap.green]) || 0;
    const bVal = parseInt(latest[colMap.blue]) || 0;
    const irVal = parseInt(latest[colMap.ir]) || 0;
    const mappedColor = colorMapper.mapToRGB({ r: rVal, g: gVal, b: bVal, ir: irVal });
    console.log('Color sensor raw:', { r: rVal, g: gVal, b: bVal, ir: irVal }, '→ mapped:', mappedColor);
    // Brightness scaling: dim at night, brighter in day
    const totalNow = rVal + gVal + bVal;
    const maxTotal = Math.max(...red.map((r, i) => r + green[i] + blue[i]), 1);
    const intensityRatio = Math.min(totalNow / maxTotal, 1);
    const brightScale = 0.6 + intensityRatio * 0.7; // 30% min brightness
    const rBg = Math.round(mappedColor.r * brightScale);
    const gBg = Math.round(mappedColor.g * brightScale);
    const bBg = Math.round(mappedColor.b * brightScale);
    document.body.style.background = `linear-gradient(to bottom, rgb(${rBg}, ${gBg}, ${bBg}), rgb(${Math.round(rBg * 0.4)}, ${Math.round(gBg * 0.4)}, ${Math.round(bBg * 0.4)}))`;
    document.body.style.minHeight = '100vh';

    // Set text color based on background brightness (perceptual luminance)
    const brightness = 0.299 * (rBg + 15) + 0.587 * (gBg + 15) + 0.114 * (bBg + 15);
    const textColor = brightness > 128 ? '#111' : '#eee';
    const valueColor = brightness > 128 ? '#000' : '#fff';
    document.body.style.color = textColor;
    document.querySelectorAll('.plot-tile .latest').forEach(el => el.style.color = valueColor);
    document.querySelectorAll('.plot-tile h2').forEach(el => el.style.color = textColor);

    // Adapt tile and popup backgrounds based on brightness
    const tileBg = brightness > 128 ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    const tileBorder = brightness > 128 ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
    document.querySelectorAll('.plot-tile').forEach(el => {
        el.style.background = tileBg;
        el.style.borderColor = tileBorder;
    });
    const overlayCard = document.querySelector('.overlay-card');
    if (overlayCard) {
        overlayCard.style.background = brightness > 128 ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
        overlayCard.style.borderColor = tileBorder;
    }

    const now = new Date();
    document.getElementById('lastUpdate').textContent = `Last refresh: ${now.toLocaleTimeString()}  ·  ${data.length} readings`;
    document.getElementById('lastUpdate').classList.remove('error');

    // Render individual tile plots with auto-ranged y-axis (10% padding)
    const autoRange = (arr) => {
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const pad = (max - min) * 0.15 || 1;
        return [min - pad, max + pad];
    };
    const tileLayout = (yRange) => ({
        ...plotLayout,
        yaxis: { ...plotLayout.yaxis, range: yRange, fixedrange: true },
    });
    const tileTrace = (y, color) => [{ x: timestamps, y, type: 'scatter', mode: 'lines', line: { color, width: 1.5 }, fill: 'tozeroy', fillcolor: color + '18' }];

    Plotly.react('plot-temp', tileTrace(temp, '#e74c3c'), tileLayout(autoRange(temp)), plotConfig);
    Plotly.react('plot-hum', tileTrace(hum, '#3498db'), tileLayout(autoRange(hum)), plotConfig);
    Plotly.react('plot-press', tileTrace(press, '#9b59b6'), tileLayout(autoRange(press)), plotConfig);
    Plotly.react('plot-gas', tileTrace(gas, '#f39c12'), tileLayout(autoRange(gas)), plotConfig);
    Plotly.react('plot-light', [
        { x: timestamps, y: red, type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 1 } },
        { x: timestamps, y: green, type: 'scatter', mode: 'lines', line: { color: '#2ecc71', width: 1 } },
        { x: timestamps, y: blue, type: 'scatter', mode: 'lines', line: { color: '#3498db', width: 1 } },
    ], tileLayout(autoRange([...red, ...green, ...blue])), plotConfig);
    Plotly.react('plot-ir', tileTrace(ir, '#8e44ad'), tileLayout(autoRange(ir)), plotConfig);
    Plotly.react('plot-battery', tileTrace(battery, '#27ae60'), tileLayout([0, 105]), plotConfig);
    Plotly.react('plot-rsrp', tileTrace(rsrp, '#e67e22'), rsrpTileLayout(rsrp), plotConfig);
    Plotly.react('plot-uptime', tileTrace(uptime.map(s => s / 3600), '#1abc9c'), tileLayout(autoRange(uptime.map(s => s / 3600))), plotConfig);
    Plotly.react('plot-failures', tileTrace(failures, '#e74c3c'), tileLayout(autoRange(failures)), plotConfig);

    // Store data for expanded interactive view
    storeChartData('plot-temp', 'Temperature', parseFloat(latest[colMap.temp]).toFixed(1) + '°C',
        [{ x: timestamps, y: temp, type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(231,76,60,0.1)' }], autoRange(temp));
    storeChartData('plot-hum', 'Humidity', parseFloat(latest[colMap.hum]).toFixed(1) + '%',
        [{ x: timestamps, y: hum, type: 'scatter', mode: 'lines', line: { color: '#3498db', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(52,152,219,0.1)' }], autoRange(hum));
    storeChartData('plot-press', 'Pressure', parseFloat(latest[colMap.press]).toFixed(1) + ' kPa',
        [{ x: timestamps, y: press, type: 'scatter', mode: 'lines', line: { color: '#9b59b6', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(155,89,182,0.1)' }], autoRange(press));
    storeChartData('plot-gas', 'Gas Resistance', (parseInt(latest[colMap.gas]) || 0) + ' Ω',
        [{ x: timestamps, y: gas, type: 'scatter', mode: 'lines', line: { color: '#f39c12', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(243,156,18,0.1)' }], autoRange(gas));
    storeChartData('plot-light', 'Light (RGB)', 'R:' + (parseInt(latest[colMap.red])||0) + ' G:' + (parseInt(latest[colMap.green])||0) + ' B:' + (parseInt(latest[colMap.blue])||0), [
        { x: timestamps, y: red, name: 'Red', type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 2 } },
        { x: timestamps, y: green, name: 'Green', type: 'scatter', mode: 'lines', line: { color: '#2ecc71', width: 2 } },
        { x: timestamps, y: blue, name: 'Blue', type: 'scatter', mode: 'lines', line: { color: '#3498db', width: 2 } },
    ], autoRange([...red, ...green, ...blue]));
    storeChartData('plot-ir', 'Infrared', (parseInt(latest[colMap.ir]) || 0).toString(),
        [{ x: timestamps, y: ir, type: 'scatter', mode: 'lines', line: { color: '#8e44ad', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(142,68,173,0.1)' }], autoRange(ir));
    storeChartData('plot-battery', 'Battery', (parseInt(latest[colMap.battery]) || 0) + '%',
        [{ x: timestamps, y: battery, type: 'scatter', mode: 'lines', line: { color: '#27ae60', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(39,174,96,0.1)' }], [0, 105]);
    storeChartData('plot-rsrp', 'Signal (RSRP)', rsrpLabel(parseInt(latest[colMap.rsrp]) || -999),
        [{ x: timestamps, y: rsrp, type: 'scatter', mode: 'lines', line: { color: '#fff', width: 2 } }], [-130, -40], rsrpShapes());
    storeChartData('plot-uptime', 'Uptime', uptimeHrs > 0 ? uptimeHrs + 'h ' + uptimeMin + 'm' : uptimeMin + 'm',
        [{ x: timestamps, y: uptime.map(s => s / 3600), type: 'scatter', mode: 'lines', line: { color: '#1abc9c', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(26,188,156,0.1)' }], autoRange(uptime.map(s => s / 3600)));
    storeChartData('plot-failures', 'Failures', (parseInt(latest[colMap.failures]) || 0).toString(),
        [{ x: timestamps, y: failures, type: 'scatter', mode: 'lines', line: { color: '#e74c3c', width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(231,76,60,0.1)' }], autoRange(failures));
}

function rsrpLabel(dbm) {
    if (dbm <= -999) return '—';
    if (dbm > -80) return 'Excellent (' + dbm + ' dBm)';
    if (dbm > -90) return 'Good (' + dbm + ' dBm)';
    if (dbm > -110) return 'Fair (' + dbm + ' dBm)';
    return 'Poor (' + dbm + ' dBm)';
}

function rsrpShapes() {
    return [
        { type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: -80, y1: -40, fillcolor: 'rgba(39,174,96,0.15)', line: { width: 0 } },
        { type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: -90, y1: -80, fillcolor: 'rgba(241,196,15,0.15)', line: { width: 0 } },
        { type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: -110, y1: -90, fillcolor: 'rgba(230,126,34,0.15)', line: { width: 0 } },
        { type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: -130, y1: -110, fillcolor: 'rgba(231,76,60,0.15)', line: { width: 0 } },
    ];
}

function rsrpTileLayout(rsrpArr) {
    return {
        ...plotLayout,
        yaxis: { ...plotLayout.yaxis, range: [-130, -40], fixedrange: true },
        shapes: rsrpShapes(),
    };
}

function findColumns(headers) {
    return {
        timestamp: 'timestamp',
        temp: 'temp',
        hum: 'hum',
        press: 'press',
        gas: 'gas',
        red: 'r',
        green: 'g',
        blue: 'b',
        ir: 'ir',
        battery: 'battery',
        rsrp: 'rsrp',
        uptime: 'uptime',
        failures: 'failures',
    };
}

// Auto-refresh every 2 minutes
fetchData();
setInterval(fetchData, 60000);

// --- Expand tile on click ---
let chartData = {}; // Store data for expanded view

function storeChartData(id, title, value, traces, yRange, shapes) {
    chartData[id] = { title, value, traces, yRange, shapes };
}

function openOverlay(id, tileEl) {
    const info = chartData[id];
    if (!info) return;

    document.getElementById('overlay-title').textContent = info.title;
    document.getElementById('overlay-value').textContent = info.value;

    const card = document.querySelector('.overlay-card');
    card.style.width = '85%';
    card.style.maxWidth = '500px';
    card.style.height = '55%';
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%) scale(0.9)';
    card.style.bottom = 'auto';

    document.getElementById('overlay').classList.add('active');
    requestAnimationFrame(() => {
        card.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    const expandedLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        margin: { l: 30, r: 30, t: 8, b: 36 },
        font: { color: 'rgba(255,255,255,0.7)', size: 11 },
        xaxis: { type: 'date', gridcolor: 'rgba(255,255,255,0.1)', tickformat: '%H:%M', tickfont: { size: 10, color: 'rgba(255,255,255,0.6)' } },
        yaxis: { gridcolor: 'rgba(255,255,255,0.1)', tickfont: { size: 10, color: 'rgba(255,255,255,0.6)' }, range: info.yRange },
        shapes: info.shapes || [],
        showlegend: info.traces.length > 1,
        legend: { orientation: 'h', y: -0.15, font: { color: 'rgba(255,255,255,0.7)' } },
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
    const card = document.querySelector('.overlay-card');
    card.style.transform = 'translate(-50%, -50%) scale(0.9)';
    document.getElementById('overlay').classList.remove('active');
    Plotly.purge('plot-expanded');
}

// Add click listeners to tiles
document.querySelectorAll('.plot-tile').forEach(tile => {
    tile.style.cursor = 'pointer';
    tile.addEventListener('click', () => {
        const plotArea = tile.querySelector('.plot-area');
        if (plotArea) openOverlay(plotArea.id, tile);
    });
});

// Resize all plots when tiles change size
const resizeObserver = new ResizeObserver(() => {
    document.querySelectorAll('.plot-area').forEach(el => {
        if (el.data) Plotly.Plots.resize(el);
    });
});
document.querySelectorAll('.plot-area').forEach(el => resizeObserver.observe(el));

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
