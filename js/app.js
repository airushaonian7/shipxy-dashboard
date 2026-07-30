/* ===== ShipXY Dashboard - 主应用：双视图(2D地图+3D地球) ===== */
(function () { 'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// 状态
let currentView = 'map';
let currentPanel = 'dashboard';
let currentShips = [];
let shipMarkersData = new Map();
let refreshTimer = null;
let refreshSecs = 60;
let globeModule = null;

// 初始化
async function init() {
    setupNav();
    setupViewToggle();
    setupModals();
    setupTime();
    setupSettings();
    setupSearch();
    setupRoute();
    setupWeather();
    setupPort();

    // 初始化2D地图（默认）
    Map2D.init('map-container');
    Map2D.setOnShipClick(handleShipClick2D);
    updateMapCoords();

    // 加载数据
    await loadData();
    startRefresh();

    setTimeout(() => $('#loading-screen')?.classList.add('hidden'), 1200);
}

// ===== 视图切换 =====
function setupViewToggle() {
    $$('.view-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
}

function switchView(view) {
    currentView = view;
    $$('.view-btn').forEach(b => b.classList.remove('active'));
    $(`.view-btn[data-view="${view}"]`)?.classList.add('active');
    $('#globe-container').style.display = view === 'globe' ? 'block' : 'none';
    $('#map-container').style.display = view === 'map' ? 'block' : 'none';
    if (view === 'globe') { initGlobe(); updateGlobeMarkers(); }
    else { Map2D.resize(); updateMapMarkers(); }
}

async function initGlobe() {
    if (globeModule) return;
    try {
        const mod = await import('./globe.js');
        globeModule = mod.default;
        globeModule.init($('#globe-container'), $('#globe-canvas'));
        globeModule.setOnShipClick((mmsi) => {
            const ship = shipMarkersData.get(mmsi);
            if (ship) openShipDetail(ship);
        });
    } catch (e) { console.warn('3D地球失败:', e.message); showToast('3D地球加载失败','warning'); switchView('map'); }
}

// ===== 导航 =====
function setupNav() {
    $('#nav-tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.nav-tab'); if (!tab) return;
        const panel = tab.dataset.panel;
        $$('.nav-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
        $$('.panel').forEach(p => p.classList.remove('active'));
        const p = $(`#panel-${panel}`); if (p) p.classList.add('active');
        currentPanel = panel; if (panel === 'dashboard') loadData();
    });
}

// ===== 时间 =====
function setupTime() {
    const update = () => {
        const n = new Date();
        const utc = n.toISOString().replace('T',' ').slice(0,19);
        const bjt = new Date(n.getTime()+8*3600000).toISOString().replace('T',' ').slice(0,19);
        $('#time-display').innerHTML = `UTC ${utc.slice(11,19)}<br><span style="color:var(--accent);font-size:10px">BJT ${bjt.slice(11,19)}</span>`;
    };
    update(); setInterval(update, 1000);
}

// ===== 弹窗 =====
function setupModals() {
    $$('.modal-backdrop, .modal-close').forEach(el => el.addEventListener('click', () => el.closest('.modal')?.classList.remove('show')));
    $('#btn-settings').addEventListener('click', () => $('#settings-modal').classList.add('show'));
    $('#btn-fullscreen').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
}

function showToast(msg, type='info') {
    const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
    $('#toast-container').appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ===== 数据加载 =====
// 中国沿海及全球主要船舶MMSI列表
const DEFAULT_MMSI_LIST = '413961925,477172700,477276900,636018258,219265000,228379800,412304788,370286000,413761246,413761521,413698530,413552478,413215487,412703890,538008645,212759000,311000576,566914000,636017492,352898159';

async function loadData() {
    try {
        // 优先使用多船查询获取实时位置数据
        const result = await ShipXYAPI.getManyShip(DEFAULT_MMSI_LIST);
        let ships = [];
        let isRealData = false;

        if (!result.error && result.data) {
            ships = Array.isArray(result.data) ? result.data : [];
            isRealData = true;
        }

        if (ships.length === 0) {
            // 降级：尝试区域查询（模拟数据）
            const areaResult = await ShipXYAPI.getAreaShip(24, 117, 36, 126);
            if (!areaResult.error && areaResult.data?.ship_list) {
                ships = areaResult.data.ship_list;
            }
        }

        updateAPIStatus(isRealData, ships.length === 0 ? '无数据' : undefined);
        currentShips = ships;
        shipMarkersData.clear();
        ships.forEach(s => shipMarkersData.set(String(s.mmsi), s));

        const total = ships.length;
        const atPort = ships.filter(s => s.navistat === 5).length;
        const underway = ships.filter(s => s.navistat === 0).length;
        const srcs = [...new Set(ships.map(s => s.data_source))];
        const src = srcs.length === 0 ? '--' : srcs.every(s=>s===0) ? 'AIS岸基' : srcs.every(s=>s===1) ? 'AIS卫星' : '岸基+卫星';

        $('#stat-total-ships').textContent = total||'--';
        $('#stat-at-port').textContent = atPort||'--';
        $('#stat-underway').textContent = underway||'--';
        $('#stat-data-source').textContent = src;
        $('#ship-count-map').textContent = total;
        $('#ship-count-globe').textContent = total;

        updateChart(ships);
        updateRecentList(ships.slice(0,8));
        if (currentView === 'map') { Map2D.resize(); updateMapMarkers(); }
        else updateGlobeMarkers();

        if (total > 0 && currentView === 'map') Map2D.fitAllMarkers();
    } catch (e) { console.error('加载失败:', e); updateAPIStatus(false, e.message); }
}

function updateAPIStatus(online, msg) {
    const el = $('#api-status');
    el.textContent = online ? '🟢' : '🟡';
    el.title = online ? 'API在线 - 真实数据' : ('API离线 - ' + (msg||'使用模拟数据'));
}

// ===== 图表 =====
function updateChart(ships) {
    const c = $('#chart-ship-types'); if (!c) return;
    if (c._chart) c._chart.destroy();
    const types = {}; ships.forEach(s => { const t = s.ship_type||0; types[t] = (types[t]||0)+1; });
    const names = {30:'渔船',60:'客船',70:'货船',80:'油轮',90:'其他'};
    const colors = {30:'#10b981',60:'#8b5cf6',70:'#00d4ff',80:'#f59e0b',90:'#94a3b8'};
    c._chart = new Chart(c, {
        type:'doughnut',
        data:{labels:Object.keys(types).map(t=>names[t]||t),datasets:[{data:Object.values(types),backgroundColor:Object.keys(types).map(t=>colors[t]||'#94a3b8'),borderColor:'#111827',borderWidth:2}]},
        options:{responsive:true,plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',padding:10,font:{size:10},usePointStyle:true}}}}
    });
}

function updateRecentList(ships) {
    const el = $('#recent-ships-list'); if (!el) return;
    el.innerHTML = ships.map(s => `<div class="recent-ship-item" onclick="App.showShip(${s.mmsi})"><div class="ship-item-icon">🚢</div><div class="ship-item-info"><div class="ship-item-name">${s.ship_name||'Unknown'}</div><div class="ship-item-meta">MMSI:${s.mmsi} | ${s.sog?.toFixed(1)||'--'}节</div></div><div class="ship-item-status">${s.navistat===5?'靠泊':s.navistat===0?'航行':'锚泊'}</div></div>`).join('');
}

// ===== 地图标记 =====
function updateMapMarkers() {
    Map2D.clearAllMarkers();
    shipMarkersData.forEach((ship, id) => { if (ship.lat && ship.lng) Map2D.addShipMarker(id, ship.lat, ship.lng, ship); });
}

function updateGlobeMarkers() {
    if (!globeModule) return;
    globeModule.clearAllMarkers();
    shipMarkersData.forEach((ship, id) => { if (ship.lat && ship.lng) globeModule.addShipMarker(id, ship.lat, ship.lng, ship.ship_type||70); });
}

function handleShipClick2D(id, shipData) { openShipDetail(shipData); }

function updateMapCoords() {
    setTimeout(() => {
        const m = Map2D.getMap(); if (!m) return;
        m.on('mousemove', e => { const el = $('#map-coords'); if (el) el.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`; });
    }, 1500);
}

// ===== 船舶详情 =====
function openShipDetail(ship) {
    const navi = {'-1':'无效',0:'航行中',1:'锚泊',5:'靠泊'};
    $('#ship-detail-content').innerHTML = `<div class="ship-detail-header"><div class="ship-detail-avatar">🚢</div><div class="ship-detail-title"><h2>${ship.ship_name||'未知'}</h2><p>${ship.ship_cnname||''} | MMSI:${ship.mmsi} | IMO:${ship.imo||'--'}</p></div></div>
    <div class="detail-grid">
        <div class="detail-item"><div class="label">纬度</div><div class="value highlight">${ship.lat?.toFixed(4)||'--'}</div></div>
        <div class="detail-item"><div class="label">经度</div><div class="value highlight">${ship.lng?.toFixed(4)||'--'}</div></div>
        <div class="detail-item"><div class="label">航速</div><div class="value">${ship.sog===-1?'无效':(ship.sog?.toFixed(1)||'--')+' 节'}</div></div>
        <div class="detail-item"><div class="label">航向</div><div class="value">${ship.cog===-1?'无效':(ship.cog?.toFixed(1)||'--')+'°'}</div></div>
        <div class="detail-item"><div class="label">状态</div><div class="value">${navi[ship.navistat]||'未知'}</div></div>
        <div class="detail-item"><div class="label">目的地</div><div class="value">${ship.dest||'--'}</div></div>
        <div class="detail-item"><div class="label">船长/宽</div><div class="value">${ship.length||'--'}m / ${ship.width||'--'}m</div></div>
        <div class="detail-item"><div class="label">吃水</div><div class="value">${ship.draught?.toFixed(1)||'--'} m</div></div>
        <div class="detail-item"><div class="label">呼号</div><div class="value">${ship.call_sign||'--'}</div></div>
        <div class="detail-item"><div class="label">数据源</div><div class="value">${ship.data_source===0?'AIS岸基':'AIS卫星'}</div></div>
        <div class="detail-item"><div class="label">更新</div><div class="value" style="font-size:11px">${ship.last_time||'--'}</div></div>
        <div class="detail-item"><div class="label">ETA</div><div class="value" style="font-size:11px">${ship.eta||'--'}</div></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-primary" onclick="App.showOnMap(${ship.lat},${ship.lng})">📍 地图定位</button>
        <button class="btn-secondary" onclick="App.showOnGlobe(${ship.lat},${ship.lng})">🌍 地球定位</button>
        <button class="btn-secondary" onclick="App.trackShip(${ship.mmsi})">📈 历史轨迹</button>
        <button class="btn-secondary" onclick="App.nearbyShips(${ship.mmsi})">🔍 周边船舶</button>
    </div>`;
    $('#ship-modal').classList.add('show');
}

// ===== 搜索 =====
function setupSearch() {
    $('#btn-search').addEventListener('click', doSearch);
    $('#search-input').addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });
}

async function doSearch() {
    const kw = $('#search-input').value.trim(); if (!kw) return showToast('请输入关键字','warning');
    const el = $('#search-results');
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">🔍 搜索中...</div>';
    const r = await ShipXYAPI.searchShip(kw, parseInt($('#search-max').value)||10);
    if (r.error) { el.innerHTML = `<div style="color:var(--accent-red);text-align:center;padding:20px">❌ ${r.msg||'搜索失败'}</div>`; return; }
    const ships = r.data||[]; if (!ships.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">未找到</div>'; return; }
    const labels = {1:'船名',2:'呼号',3:'MMSI',5:'IMO'};
    el.innerHTML = ships.map(s => `<div class="search-result-item" onclick="App.showShip(${s.mmsi})"><div class="ship-header"><div><div class="ship-name">${s.ship_name||'未知'}</div><div class="ship-cnname">${s.ship_cnname||''}</div></div><span class="match-type">${labels[s.match_type]||'匹配'}</span></div><div class="ship-details"><div><span class="detail-label">MMSI:</span>${s.mmsi}</div><div><span class="detail-label">IMO:</span>${s.imo||'--'}</div><div><span class="detail-label">呼号:</span>${s.call_sign||'--'}</div><div><span class="detail-label">更新:</span>${s.last_time||'--'}</div></div></div>`).join('');
}

// ===== 航线 =====
function setupRoute() {
    $$('.route-type-btn').forEach(b => b.addEventListener('click', () => { $$('.route-type-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }));
    $('#btn-route').addEventListener('click', planRoute);
}

async function planRoute() {
    const type = $('.route-type-btn.active')?.dataset.type||'points';
    const el = $('#route-result');
    if (type==='points') {
        const l1=parseFloat($('#route-lat1').value)||31.23, g1=parseFloat($('#route-lng1').value)||121.47;
        const l2=parseFloat($('#route-lat2').value)||1.35, g2=parseFloat($('#route-lng2').value)||103.82;
        el.innerHTML='<div style="text-align:center;padding:20px">🗺️ 规划中...</div>';
        const r=await ShipXYAPI.routeByPoints(l1,g1,l2,g2);
        if (r.error) { el.innerHTML='<div style="color:var(--accent-red)">❌ 失败</div>'; return; }
        const d=r.data; el.innerHTML=`<div class="chart-container"><h3>📏 航线结果</h3><div style="text-align:center;margin:10px 0"><span style="font-size:28px;font-weight:700;color:var(--accent)">${d.distance_nm?.toFixed(0)||'--'}</span> <span style="color:var(--text-muted);font-size:13px">海里</span></div></div>`;
        if (currentView==='map') Map2D.addRoute(d.waypoints||[], '#00d4ff');
        else if (globeModule) { globeModule.clearRoutes(); globeModule.addRouteLine(d.waypoints||[], 0x00d4ff); globeModule.focusOnLocation((l1+l2)/2,(g1+g2)/2,4); }
    } else {
        el.innerHTML='<div style="text-align:center;padding:20px">📡 查询ETA...</div>';
        const r=await ShipXYAPI.getETA(477172700,'CNSHA');
        if (!r.error) { const e=r.data; el.innerHTML=`<div class="chart-container"><h3>⏱️ ETA</h3><div class="detail-grid"><div class="detail-item"><div class="label">预计到达</div><div class="value highlight">${e.eta||'--'}</div></div><div class="detail-item"><div class="label">剩余距离</div><div class="value">${e.distance_remaining?.toFixed(0)||'--'} 海里</div></div><div class="detail-item"><div class="label">平均航速</div><div class="value">${e.avg_speed||'--'} 节</div></div><div class="detail-item"><div class="label">预计时间</div><div class="value">${e.time_remaining_hours||'--'} 小时</div></div></div></div>`; }
    }
}

// ===== 气象 =====
function setupWeather() {
    $$('.weather-type-btn').forEach(b => b.addEventListener('click', () => { $$('.weather-type-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }));
    $('#btn-weather').addEventListener('click', queryWeather);
}

async function queryWeather() {
    const type=$('.weather-type-btn.active')?.dataset.type||'point';
    const el=$('#weather-result');
    if (type==='point') {
        const lat=parseFloat($('#weather-lat').value)||31.23, lng=parseFloat($('#weather-lng').value)||121.47;
        el.innerHTML='<div style="text-align:center;padding:20px">🌊 查询中...</div>';
        const r=await ShipXYAPI.getPointWeather(lat,lng);
        if (r.error) { el.innerHTML='<div style="color:var(--accent-red)">❌ 失败</div>'; return; }
        const w=r.data;
        el.innerHTML=`<div class="chart-container"><h3>🌡️ 气象 (${w.lat?.toFixed(2)},${w.lng?.toFixed(2)})</h3><div class="detail-grid"><div class="detail-item"><div class="label">温度</div><div class="value highlight">${w.temperature?.toFixed(1)||'--'}°C</div></div><div class="detail-item"><div class="label">湿度</div><div class="value">${w.humidity?.toFixed(0)||'--'}%</div></div><div class="detail-item"><div class="label">风速</div><div class="value">${w.wind_speed?.toFixed(1)||'--'} m/s</div></div><div class="detail-item"><div class="label">风向</div><div class="value">${w.wind_direction?.toFixed(0)||'--'}°</div></div><div class="detail-item"><div class="label">浪高</div><div class="value">${w.wave_height?.toFixed(1)||'--'} m</div></div><div class="detail-item"><div class="label">能见度</div><div class="value">${w.visibility?.toFixed(1)||'--'} km</div></div><div class="detail-item"><div class="label">气压</div><div class="value">${w.pressure?.toFixed(0)||'--'} hPa</div></div><div class="detail-item"><div class="label">涌浪</div><div class="value">${w.swell_height?.toFixed(1)||'--'} m</div></div></div></div>`;
    } else if (type==='typhoon') {
        el.innerHTML='<div style="text-align:center;padding:20px">🌀 查询中...</div>';
        const r=await ShipXYAPI.getTyphoons();
        if (!r.error&&r.data?.[0]) { const t=r.data[0];
            el.innerHTML=`<div class="chart-container"><h3>🌀 ${t.cn_name||t.name}</h3><div class="detail-grid"><div class="detail-item"><div class="label">风级</div><div class="value highlight">${t.level} 级</div></div><div class="detail-item"><div class="label">风速</div><div class="value">${t.wind_speed} m/s</div></div><div class="detail-item"><div class="label">气压</div><div class="value">${t.pressure} hPa</div></div><div class="detail-item"><div class="label">位置</div><div class="value">${t.lat?.toFixed(1)},${t.lng?.toFixed(1)}</div></div></div></div>`;
            if (currentView==='map') Map2D.addRoute(t.forecast||[], '#ef4444'); }
    } else {
        const r=await ShipXYAPI.getGlobalPortTide('CNSHA');
        if (!r.error) { const tides=r.data.tides||[];
            el.innerHTML=`<div class="chart-container"><h3>🌊 ${r.data.port_cnname} 潮汐</h3><canvas id="tide-chart" height="160"></canvas></div>`;
            setTimeout(()=>{ const tc=$('#tide-chart'); if (tc) new Chart(tc,{type:'line',data:{labels:tides.map(t=>t.time),datasets:[{label:'潮汐(m)',data:tides.map(t=>t.height?.toFixed(2)),borderColor:'#00d4ff',backgroundColor:'rgba(0,212,255,0.1)',fill:true,tension:.4,pointRadius:0}]},options:{responsive:true,scales:{x:{ticks:{color:'#64748b',font:{size:9}},grid:{color:'#1e3a5f'}},y:{ticks:{color:'#64748b'},grid:{color:'#1e3a5f'}}},plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}}}}); },100); }
    }
}

// ===== 港口 =====
function setupPort() {
    $('#btn-port-search').addEventListener('click', searchPort);
    $('#port-search-input').addEventListener('keydown', e => { if (e.key==='Enter') searchPort(); });
    $$('.port-action-btn').forEach(b => b.addEventListener('click', () => loadPortShips(b.dataset.action)));
}

let currentPortCode = null;
async function searchPort() {
    const kw=$('#port-search-input').value.trim(); if (!kw) return showToast('请输入港口名称','warning');
    const r=await ShipXYAPI.searchPort(kw);
    if (r.error||!r.data?.length) { $('#port-results').innerHTML='<div style="color:var(--accent-red)">未找到港口</div>'; return; }
    const p=r.data[0]; currentPortCode=p.port_code;
    $('#port-results').innerHTML=`<div class="chart-container"><h3>⚓ ${p.port_cnname||p.port_name}</h3><div class="detail-grid"><div class="detail-item"><div class="label">代码</div><div class="value highlight">${p.port_code}</div></div><div class="detail-item"><div class="label">国家</div><div class="value">${p.country_cn||p.country}</div></div><div class="detail-item"><div class="label">时区</div><div class="value">${p.timezone||'--'}</div></div><div class="detail-item"><div class="label">EN</div><div class="value">${p.port_name}</div></div></div></div>`;
    $('#port-actions').style.display='flex';
}

async function loadPortShips(type) {
    const el=$('#port-detail'); el.innerHTML='<div style="text-align:center;padding:10px">⏳ 加载中...</div>';
    let r; const labels={berthed:'靠泊',anchored:'锚泊',expected:'预抵'};
    if (type==='berthed') r=await ShipXYAPI.getPortBerthedShips(currentPortCode);
    else if (type==='anchored') r=await ShipXYAPI.getPortAnchoredShips(currentPortCode);
    else r=await ShipXYAPI.getPortExpectedShips(currentPortCode);
    if (r.error) { el.innerHTML='<div style="color:var(--accent-red)">❌ 失败</div>'; return; }
    const ships=r.data||[];
    el.innerHTML=`<div class="chart-container"><h3>🚢 ${labels[type]}船舶 (${ships.length}艘)</h3>${ships.slice(0,10).map(s=>`<div class="recent-ship-item" onclick="App.showShip(${s.mmsi})"><div class="ship-item-icon">🚢</div><div class="ship-item-info"><div class="ship-item-name">${s.ship_name||'Unknown'}</div><div class="ship-item-meta">MMSI:${s.mmsi} | ${s.length||'--'}m×${s.width||'--'}m</div></div></div>`).join('')}${ships.length>10?`<div style="color:var(--text-muted);text-align:center;padding:8px">还有${ships.length-10}艘...</div>`:''}</div>`;
}

// ===== 设置 =====
function setupSettings() {
    $('#btn-save-settings').addEventListener('click', () => {
        ShipXYAPI.setKey($('#settings-apikey').value.trim());
        refreshSecs = parseInt($('#settings-refresh').value) || 60;
        localStorage.setItem('shipxy_refresh', refreshSecs);
        $('#settings-modal').classList.remove('show');
        startRefresh();
        showToast('✅ 设置已保存，重新加载数据...','success');
        loadData();
    });
}

function startRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (currentPanel==='dashboard') loadData(); }, refreshSecs*1000);
}

// ===== 全局方法 =====
window.App = {
    showShip: async (mmsi) => {
        const r = await ShipXYAPI.getSingleShip(mmsi);
        if (!r.error && r.data) { openShipDetail(r.data);
            if (currentView==='map') Map2D.focusOnLocation(r.data.lat, r.data.lng, 10);
            else if (globeModule) globeModule.focusOnLocation(r.data.lat, r.data.lng, 2); }
        else showToast('无法获取详情','error');
    },
    showOnMap: (lat,lng) => { switchView('map'); Map2D.focusOnLocation(lat,lng,10); },
    showOnGlobe: (lat,lng) => { switchView('globe'); initGlobe().then(() => globeModule?.focusOnLocation(lat,lng,2)); },
    trackShip: async (mmsi) => {
        const r=await ShipXYAPI.getShipTrack(mmsi);
        if (!r.error&&r.data) {
            if (currentView==='map') Map2D.addRoute(r.data,'#10b981');
            else { switchView('globe'); await initGlobe(); globeModule?.clearRoutes(); globeModule?.addRouteLine(r.data,0x10b981); if(r.data[0])globeModule?.focusOnLocation(r.data[0].lat,r.data[0].lng,3); }
            showToast('✅ 轨迹已加载','success');
        }
    },
    nearbyShips: async (mmsi) => {
        const r=await ShipXYAPI.getNearbyShip(mmsi);
        if (!r.error&&r.data) { shipMarkersData.clear(); r.data.forEach(s=>shipMarkersData.set(String(s.mmsi),s));
            if (currentView==='map') updateMapMarkers(); else updateGlobeMarkers();
            Map2D.fitAllMarkers(); showToast(`✅ 显示${r.data.length}艘周边船舶`,'success'); }
    }
};

// ===== 键盘快捷键 =====
document.addEventListener('keydown', e => {
    if (e.ctrlKey) {
        const map={1:'dashboard',2:'search',3:'route',4:'weather',5:'port'};
        const panel=map[e.key]; if (panel) { e.preventDefault();
            $$('.nav-tab').forEach(t=>t.classList.remove('active'));
            const tab=$(`.nav-tab[data-panel="${panel}"]`); if (tab) tab.classList.add('active');
            $$('.panel').forEach(p=>p.classList.remove('active'));
            const p=$(`#panel-${panel}`); if (p) p.classList.add('active');
            currentPanel=panel; }
        if (e.key==='k') { e.preventDefault(); $('#search-input')?.focus(); }
    }
});

document.addEventListener('DOMContentLoaded', init);
})();
