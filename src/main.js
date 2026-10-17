import maplibregl from 'maplibre-gl';

// 港区・大門・浜松町エリア中心座標
const DAIMON_CENTER = [139.7555, 35.6555];
const INITIAL_ZOOM = 15.6;
const INITIAL_PITCH = 52;
const INITIAL_BEARING = -25;

let map;
let underpassesData = null;
let stationFacilitiesData = null;
let landmarksData = null;
let busRoutesData = null;
let currentMode = 'peace'; // 'peace' | 'storm' | 'admin'
let buildingsVisible = true;
let busVisible = true;

// DOM Elements
const rainSlider = document.getElementById('rain-slider');
const rainDisplay = document.getElementById('rain-value-display');
const floodIndicator = document.getElementById('flood-indicator');
const stormBanner = document.getElementById('storm-alert-banner');
const detailDrawer = document.getElementById('detail-drawer');
const poiTitle = document.getElementById('poi-title');
const poiBadge = document.getElementById('poi-badge');
const drawerContent = document.getElementById('drawer-content');
const adminPanel = document.getElementById('admin-panel');
const adminTbody = document.getElementById('admin-tbody');

// Initialize Map
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: DAIMON_CENTER,
    zoom: INITIAL_ZOOM,
    pitch: INITIAL_PITCH,
    bearing: INITIAL_BEARING,
    maxPitch: 85
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

  map.on('load', async () => {
    // 3D Terrain
    try {
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15
      });
      map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
    } catch (e) {
      console.warn('3D Terrain load warning:', e);
    }

    await loadData();
    setupLayers();
    setupEvents();
    renderAdminTable();
  });
}

// Load GeoJSON data
async function loadData() {
  try {
    const [underpassRes, facilitiesRes, landmarksRes, busRes] = await Promise.all([
      fetch('./data/minato_underpass_5.geojson'),
      fetch('./data/station_facilities.geojson'),
      fetch('./data/minato_landmarks_3d.geojson'),
      fetch('./data/toei_bus_routes.geojson')
    ]);
    underpassesData = await underpassRes.json();
    stationFacilitiesData = await facilitiesRes.json();
    landmarksData = await landmarksRes.json();
    busRoutesData = await busRes.json();
  } catch (err) {
    console.error('Failed to load geojson:', err);
  }
}

// Setup Map Layers
function setupLayers() {
  if (!underpassesData || !stationFacilitiesData) return;

  // 0. 3D Buildings (Carto Vector Tile - Base city blocks)
  try {
    map.addLayer({
      id: '3d-buildings-base',
      source: 'carto',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 15],
          0, '#111827',
          30, '#1e293b',
          80, '#334155'
        ],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 16],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.72
      }
    });
  } catch (err) {
    console.warn('Base 3d-buildings layer setup error:', err);
  }

  // 0.1 3D Landmarks (PLATEAU LOD1/2 Attributes - High Precision)
  if (landmarksData) {
    map.addSource('minato-landmarks', {
      type: 'geojson',
      data: landmarksData
    });

    map.addLayer({
      id: '3d-landmarks-layer',
      source: 'minato-landmarks',
      type: 'fill-extrusion',
      paint: {
        'fill-extrusion-color': [
          'case',
          ['==', ['get', 'type'], 'shelter_facility'], '#0284c7', // 一時滞在施設（ポートシティ竹芝）: シアンブルー
          ['==', ['get', 'type'], 'railway_structure'], '#475569', // 鉄道高架: スレート
          ['==', ['get', 'type'], 'welfare_facility'], '#f43f5e', // 身障者センター: ローズ
          '#2563eb' // 一般ランドマーク（WTC/クレアタワー）: ブルー
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.88
      }
    });
  }

  // 1. Water simulation puddle polygons around underpasses
  const waterPuddlesGeoJSON = {
    type: 'FeatureCollection',
    features: underpassesData.features.map(f => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: f.geometry.coordinates
      },
      properties: {
        id: f.properties.no,
        elevation: f.properties.elevation_m
      }
    }))
  };

  map.addSource('water-puddles', {
    type: 'geojson',
    data: waterPuddlesGeoJSON
  });

  // Animated Water Circle (simulating flooding in depression)
  map.addLayer({
    id: 'flood-water-layer',
    type: 'circle',
    source: 'water-puddles',
    paint: {
      'circle-radius': 0, // initially 0, modified by slider
      'circle-color': '#06b6d4',
      'circle-opacity': 0,
      'circle-blur': 0.4,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#38bdf8',
      'circle-stroke-opacity': 0
    }
  });

  // 1.5 Toei Bus GTFS Routes & Stops
  if (busRoutesData) {
    map.addSource('toei-bus-data', {
      type: 'geojson',
      data: busRoutesData
    });

    map.addLayer({
      id: 'toei-bus-routes-glow',
      type: 'line',
      source: 'toei-bus-data',
      filter: ['==', '$type', 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 8,
        'line-opacity': 0.35,
        'line-blur': 4
      }
    });

    map.addLayer({
      id: 'toei-bus-routes-core',
      type: 'line',
      source: 'toei-bus-data',
      filter: ['==', '$type', 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 4
      }
    });

    map.addLayer({
      id: 'toei-bus-stops-circle',
      type: 'circle',
      source: 'toei-bus-data',
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 6.5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#0284c7'
      }
    });
  }

  // 2. Pedestrian Deck Safe Route (Daimon B3 -> Hamamatsucho -> Sanbou Shelter)
  const safeRouteGeoJSON = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [139.7548, 35.6565], // Daimon B3 Exit
        [139.7565, 35.6561], // WTC Deck
        [139.7578, 35.6555], // JR Hamamatsucho South Deck
        [139.7595, 35.6558]  // Tokyo Sanbou Shelter
      ]
    },
    properties: {
      name: 'ペデストリアンデッキ安全避難路（アンダーパス回避）'
    }
  };

  map.addSource('safe-route', {
    type: 'geojson',
    data: safeRouteGeoJSON
  });

  map.addLayer({
    id: 'safe-route-glow',
    type: 'line',
    source: 'safe-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#10b981',
      'line-width': 8,
      'line-opacity': 0.4,
      'line-blur': 4
    }
  });

  map.addLayer({
    id: 'safe-route-core',
    type: 'line',
    source: 'safe-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#34d399',
      'line-width': 4,
      'line-dasharray': [2, 1]
    }
  });

  // 3. Station Facilities (Exits & Shelters)
  map.addSource('station-facilities', {
    type: 'geojson',
    data: stationFacilitiesData
  });

  map.addLayer({
    id: 'facility-points',
    type: 'circle',
    source: 'station-facilities',
    paint: {
      'circle-radius': [
        'case',
        ['==', ['get', 'type'], 'shelter'], 12,
        9
      ],
      'circle-color': [
        'case',
        ['==', ['get', 'deck_connected'], true], '#10b981',
        '#f59e0b'
      ],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.95
    }
  });

  // 4. Underpasses Points
  map.addSource('underpasses', {
    type: 'geojson',
    data: underpassesData
  });

  map.addLayer({
    id: 'underpass-points',
    type: 'circle',
    source: 'underpasses',
    paint: {
      'circle-radius': 11,
      'circle-color': '#f43f5e',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.95
    }
  });

  // Pulse animation effect for Underpass
  map.addLayer({
    id: 'underpass-pulse',
    type: 'circle',
    source: 'underpasses',
    paint: {
      'circle-radius': 18,
      'circle-color': '#f43f5e',
      'circle-opacity': 0.25,
      'circle-blur': 0.6
    }
  });
}

// UI & Map Events
function setupEvents() {
  // Rain Slider
  rainSlider.addEventListener('input', (e) => {
    const rainMm = parseInt(e.target.value, 10);
    updateRainSimulation(rainMm);
  });

  // Tabs
  document.getElementById('tab-peace').addEventListener('click', () => switchMode('peace'));
  document.getElementById('tab-storm').addEventListener('click', () => switchMode('storm'));
  document.getElementById('tab-admin').addEventListener('click', () => switchMode('admin'));

  // Perspective Controls
  document.getElementById('btn-tilt-toggle').addEventListener('click', () => {
    const currentPitch = map.getPitch();
    if (currentPitch > 10) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      document.getElementById('btn-tilt-toggle').textContent = '2D';
    } else {
      map.easeTo({ pitch: 60, bearing: -30, duration: 1000 });
      document.getElementById('btn-tilt-toggle').textContent = '3D';
    }
  });

  document.getElementById('btn-focus-daimon').addEventListener('click', () => {
    map.flyTo({
      center: DAIMON_CENTER,
      zoom: 16.2,
      pitch: 55,
      bearing: -20,
      duration: 1500
    });
  });

  // Drawer Close
  document.getElementById('btn-close-drawer').addEventListener('click', () => {
    detailDrawer.classList.remove('open');
    detailDrawer.style.display = 'none';
  });

  // Admin Panel Close
  document.getElementById('btn-close-admin').addEventListener('click', () => {
    adminPanel.classList.add('hidden');
    switchMode('peace');
  });

  // Export CSV
  document.getElementById('btn-export-csv').addEventListener('click', exportAdminCSV);

  // 3D Buildings Toggle
  const toggleBuildingsBtn = document.getElementById('btn-toggle-buildings');
  if (toggleBuildingsBtn) {
    toggleBuildingsBtn.addEventListener('click', () => {
      buildingsVisible = !buildingsVisible;
      toggleBuildingsBtn.classList.toggle('active', buildingsVisible);
      const visibility = buildingsVisible ? 'visible' : 'none';
      if (map.getLayer('3d-buildings-base')) {
        map.setLayoutProperty('3d-buildings-base', 'visibility', visibility);
      }
      if (map.getLayer('3d-landmarks-layer')) {
        map.setLayoutProperty('3d-landmarks-layer', 'visibility', visibility);
      }
    });
  }

  // Toei Bus Toggle
  const toggleBusBtn = document.getElementById('btn-toggle-bus');
  if (toggleBusBtn) {
    toggleBusBtn.addEventListener('click', () => {
      busVisible = !busVisible;
      toggleBusBtn.classList.toggle('active', busVisible);
      const visibility = busVisible ? 'visible' : 'none';
      ['toei-bus-routes-glow', 'toei-bus-routes-core', 'toei-bus-stops-circle'].forEach(layer => {
        if (map.getLayer(layer)) {
          map.setLayoutProperty(layer, 'visibility', visibility);
        }
      });
    });
  }

  // Map Feature Click Listeners
  map.on('click', 'underpass-points', (e) => {
    if (!e.features.length) return;
    const f = e.features[0];
    showUnderpassDetails(f.properties);
  });

  map.on('click', 'facility-points', (e) => {
    if (!e.features.length) return;
    const f = e.features[0];
    showFacilityDetails(f.properties);
  });

  map.on('click', '3d-landmarks-layer', (e) => {
    if (!e.features.length) return;
    const f = e.features[0];
    showLandmarkDetails(f.properties);
  });

  map.on('click', 'toei-bus-routes-core', (e) => {
    if (!e.features.length) return;
    const f = e.features[0];
    showBusRouteDetails(f.properties);
  });

  map.on('click', 'toei-bus-stops-circle', (e) => {
    if (!e.features.length) return;
    const f = e.features[0];
    showBusStopDetails(f.properties);
  });

  // Cursor change on hover
  ['underpass-points', 'facility-points', '3d-landmarks-layer', 'toei-bus-routes-core', 'toei-bus-stops-circle'].forEach(layer => {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  });
}

// Update simulation based on rain slider
function updateRainSimulation(rainMm) {
  let label = `${rainMm} mm/h (降雨なし)`;
  let statusText = '通常水位（安全）';
  let dotClass = 'dot green';

  if (rainMm > 0 && rainMm <= 20) {
    label = `${rainMm} mm/h (やや強い雨)`;
    statusText = '路面冠水なし（公共交通 平常運行）';
    dotClass = 'dot green';
  } else if (rainMm > 20 && rainMm <= 50) {
    label = `${rainMm} mm/h (激しい雨・大雨警報)`;
    statusText = '一部アンダーパスで排水能力限界に接近';
    dotClass = 'dot amber';
  } else if (rainMm > 50 && rainMm <= 80) {
    label = `${rainMm} mm/h (非常に激しい雨・土砂降り)`;
    statusText = '⚠️ 浜松町・川口架道橋下冠水開始 / 🚌 浜95系統 迂回運行';
    dotClass = 'dot amber';
  } else if (rainMm > 80) {
    label = `${rainMm} mm/h (猛烈な雨・警戒レベル4)`;
    statusText = '🚨 アンダーパス完全冠水 / 🚌 浜95系統 運行見合わせ・都06系統のみ運行';
    dotClass = 'dot red';
  }

  rainDisplay.textContent = label;
  floodIndicator.innerHTML = `<span class="${dotClass}"></span> ${statusText}`;

  // Update Toei Bus flood risk styling
  if (map.getLayer('toei-bus-routes-core')) {
    if (rainMm > 50) {
      // Warning styling: Hama95 turns into dashed red/orange, Miyako06 stays green
      map.setPaintProperty('toei-bus-routes-core', 'line-color', [
        'case',
        ['==', ['get', 'route_id'], 'Toei_Hama95'], '#f43f5e',
        '#10b981'
      ]);
      map.setPaintProperty('toei-bus-routes-core', 'line-dasharray', [
        'case',
        ['==', ['get', 'route_id'], 'Toei_Hama95'], ['literal', [2, 2]],
        ['literal', [1, 0]]
      ]);
    } else {
      map.setPaintProperty('toei-bus-routes-core', 'line-color', ['get', 'color']);
      map.setPaintProperty('toei-bus-routes-core', 'line-dasharray', [1, 0]);
    }
  }

  // Update map flood puddle visualization
  if (map.getLayer('flood-water-layer')) {
    const puddleRadius = Math.max(0, rainMm * 0.9); // max ~90px
    const opacity = Math.min(0.85, rainMm / 100 * 0.85);

    map.setPaintProperty('flood-water-layer', 'circle-radius', puddleRadius);
    map.setPaintProperty('flood-water-layer', 'circle-opacity', opacity);
    map.setPaintProperty('flood-water-layer', 'circle-stroke-opacity', opacity > 0.1 ? 0.7 : 0);
  }
}

// Switch Mode
function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  if (mode === 'peace') {
    stormBanner.classList.add('hidden');
    adminPanel.classList.add('hidden');
    rainSlider.value = 0;
    updateRainSimulation(0);
    map.setLayoutProperty('safe-route-glow', 'visibility', 'none');
    map.setLayoutProperty('safe-route-core', 'visibility', 'none');
  } else if (mode === 'storm') {
    stormBanner.classList.remove('hidden');
    adminPanel.classList.add('hidden');
    rainSlider.value = 80;
    updateRainSimulation(80);
    map.setLayoutProperty('safe-route-glow', 'visibility', 'visible');
    map.setLayoutProperty('safe-route-core', 'visibility', 'visible');

    // Ensure bus routes are visible in storm mode to show alternative transit
    ['toei-bus-routes-glow', 'toei-bus-routes-core', 'toei-bus-stops-circle'].forEach(layer => {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, 'visibility', 'visible');
      }
    });
    const toggleBusBtn = document.getElementById('btn-toggle-bus');
    if (toggleBusBtn) {
      busVisible = true;
      toggleBusBtn.classList.add('active');
    }

    // Fly to Daimon B3 Exit to showcase evacuation
    map.flyTo({
      center: [139.7565, 35.6560],
      zoom: 16.5,
      pitch: 58,
      bearing: -15,
      duration: 1600
    });
  } else if (mode === 'admin') {
    stormBanner.classList.add('hidden');
    adminPanel.classList.remove('hidden');
  }
}

// Show Underpass Details in Drawer
function showUnderpassDetails(props) {
  detailDrawer.style.display = 'flex';
  detailDrawer.classList.add('open');

  poiBadge.className = 'badge danger';
  poiBadge.textContent = '冠水注意箇所（国交省リスト）';
  poiTitle.textContent = props.short_name || props.route_and_name;

  let equipObj = {};
  try {
    equipObj = typeof props.equipment === 'string' ? JSON.parse(props.equipment) : props.equipment;
  } catch (e) {}

  const sensorText = equipObj?.sensor ? '✅ 水位計あり' : '❌ 水位計なし';
  const lightText = equipObj?.warning_light ? '✅ 赤色灯あり' : '❌ 赤色灯なし';
  const barrierText = equipObj?.barrier ? '✅ 遮断機あり' : '❌ 遮断機なし';

  drawerContent.innerHTML = `
    <div class="poi-property-list">
      <div class="poi-item">
        <div class="poi-item-label">正式名称 / 路線</div>
        <div class="poi-item-value">${props.route_and_name}</div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">鉄道交差・構造</div>
        <div class="poi-item-value">${props.rail_crossing ? '⚠️ 鉄道高架下（立体交差）' : '道路単独トンネル'}<br><small style="color:#94a3b8;">${props.rail_crossing_line || ''}</small></div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">地盤標高 / 近接交通</div>
        <div class="poi-item-value">標高: <strong>${props.elevation_m}m</strong>（すり鉢窪地）<br><small style="color:#94a3b8;">${props.station_proximity}</small></div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">国交省4区分（仮判定）</div>
        <div class="poi-item-value"><span class="badge-tag cat-1">${props.category_tentative}</span></div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">市民確認設備（平時報告データ）</div>
        <div class="poi-item-value">${sensorText} / ${lightText} / ${barrierText}</div>
      </div>
    </div>
    <div class="poi-route-guidance">
      <div class="guidance-title">🚶‍♂️ 豪雨時アメミチ迂回アドバイス</div>
      <div>${props.risk_note} 大雨の際は地上道路を避け、大門駅B3出口からペデストリアンデッキ経由で通行してください。</div>
    </div>
  `;
}

// Show Facility Details in Drawer
function showFacilityDetails(props) {
  detailDrawer.style.display = 'flex';
  detailDrawer.classList.add('open');

  if (props.type === 'shelter') {
    poiBadge.className = 'badge success';
    poiBadge.textContent = '都立一時滞在施設（帰宅困難者用）';
    poiTitle.textContent = props.name;

    drawerContent.innerHTML = `
      <div class="poi-property-list">
        <div class="poi-item">
          <div class="poi-item-label">収容可能人数</div>
          <div class="poi-item-value">${props.capacity.toLocaleString()} 名</div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">歩行者デッキ接続</div>
          <div class="poi-item-value">✅ <strong>ペデストリアンデッキ直結</strong>（地上冠水路面を一切通らずに安全到達可能）</div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">豪雨時ステータス</div>
          <div class="poi-item-value"><span class="badge-tag cat-3">${props.status}</span></div>
        </div>
      </div>
      <div class="poi-route-guidance">
        <div class="guidance-title">🛡️ 避難推奨</div>
        <div>${props.note}</div>
      </div>
    `;
  } else {
    // Station Exit
    poiBadge.className = props.deck_connected ? 'badge success' : 'badge danger';
    poiBadge.textContent = `GTFS-Pathways ${props.exit_code}`;
    poiTitle.textContent = `${props.station_name} ${props.exit_code}`;

    drawerContent.innerHTML = `
      <div class="poi-property-list">
        <div class="poi-item">
          <div class="poi-item-label">出口属性（GTFS-Pathways）</div>
          <div class="poi-item-value">${props.recommendation_in_flood}</div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">高架・アンダーパス関係</div>
          <div class="poi-item-value">${props.deck_connected ? '✅ 陸橋・ペデストリアンデッキ接続（ガード下を潜らない）' : '⚠️ 地上路面直結（近くのアンダーパス冠水に注意）'}</div>
        </div>
      </div>
      <div class="poi-route-guidance">
        <div class="guidance-title">💡 出口アメミチ案内</div>
        <div>${props.note}</div>
      </div>
    `;
  }
}

// Show 3D Landmark Building Details in Drawer
function showLandmarkDetails(props) {
  detailDrawer.style.display = 'flex';
  detailDrawer.classList.add('open');

  poiBadge.className = 'badge';
  poiBadge.textContent = `3D都市モデル (PLATEAU LOD${props.plateau_lod || 1})`;
  poiTitle.textContent = props.name;

  drawerContent.innerHTML = `
    <div class="poi-property-list">
      <div class="poi-item">
        <div class="poi-item-label">建物規模（PLATEAU属性）</div>
        <div class="poi-item-value">地上 <strong>${props.floors}階</strong> / 高さ <strong>約${props.height}m</strong></div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">建築種別 / 役割</div>
        <div class="poi-item-value">${props.name_en || ''}<br><span class="badge-tag cat-3">${props.type}</span></div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">ペデストリアンデッキ接続</div>
        <div class="poi-item-value">${props.deck_level ? `✅ 2階〜${props.deck_level}階レベルで歩行者デッキ直結` : '地上道路接続'}</div>
      </div>
    </div>
    <div class="poi-route-guidance">
      <div class="guidance-title">🏢 防災・空間特性</div>
      <div>${props.note}</div>
    </div>
  `;
}

// Show Toei Bus Route Details in Drawer
function showBusRouteDetails(props) {
  detailDrawer.style.display = 'flex';
  detailDrawer.classList.add('open');

  const isSafe = props.is_safe_alternative === true || props.is_safe_alternative === 'true';
  poiBadge.className = isSafe ? 'badge success' : 'badge danger';
  poiBadge.textContent = isSafe ? '都営バス（安全代替幹線）' : '都営バス（冠水影響注意路線）';
  poiTitle.textContent = `${props.route_name} (${props.terminal})`;

  drawerContent.innerHTML = `
    <div class="poi-property-list">
      <div class="poi-item">
        <div class="poi-item-label">系統番号 / 運行間隔</div>
        <div class="poi-item-value"><strong>${props.route_short_name}</strong>（${props.frequency}）</div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">アンダーパス立体交差 / 冠水影響</div>
        <div class="poi-item-value">${props.underpass_crossing ? `⚠️ 冠水影響あり（${props.affected_underpass || '川口架道橋下付近'}）` : '✅ アンダーパス不通過（安全走行可能）'}</div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">地下鉄運休時の代替性</div>
        <div class="poi-item-value">${isSafe ? '<span class="badge-tag cat-3">最優先推奨（安全幹線）</span>' : '<span class="badge-tag cat-1">迂回・遅延注意</span>'}</div>
      </div>
    </div>
    <div class="poi-route-guidance">
      <div class="guidance-title">🚌 運行・避難ガイダンス</div>
      <div>${props.note}</div>
    </div>
  `;
}

// Show Toei Bus Stop Details in Drawer
function showBusStopDetails(props) {
  detailDrawer.style.display = 'flex';
  detailDrawer.classList.add('open');

  const isSafe = props.safe_stop === true || props.safe_stop === 'true';
  poiBadge.className = isSafe ? 'badge success' : 'badge danger';
  poiBadge.textContent = '都営バス停留所（GTFS stops）';
  poiTitle.textContent = props.stop_name;

  let routesStr = props.routes;
  try {
    if (typeof routesStr === 'string' && routesStr.startsWith('[')) {
      routesStr = JSON.parse(routesStr).join(', ');
    }
  } catch (e) {}

  drawerContent.innerHTML = `
    <div class="poi-property-list">
      <div class="poi-item">
        <div class="poi-item-label">停車系統（GTFS）</div>
        <div class="poi-item-value"><strong>${routesStr}</strong></div>
      </div>
      <div class="poi-item">
        <div class="poi-item-label">豪雨時安全性評価</div>
        <div class="poi-item-value">${isSafe ? '✅ 安全（冠水浸水想定エリア外・高台）' : '⚠️ 低地近接（大雨時は冠水によるバス遅延に注意）'}</div>
      </div>
    </div>
    <div class="poi-route-guidance">
      <div class="guidance-title">🚏 利用ガイダンス</div>
      <div>${props.note}</div>
    </div>
  `;
}

// Render Admin Table
function renderAdminTable() {
  if (!underpassesData) return;
  adminTbody.innerHTML = underpassesData.features.map(f => {
    const p = f.properties;
    let equip = {};
    try {
      equip = typeof p.equipment === 'string' ? JSON.parse(p.equipment) : p.equipment;
    } catch(e) {}
    const equipStr = [
      equip.sensor ? '水位計' : '',
      equip.warning_light ? '赤色灯' : '',
      equip.barrier ? '遮断機' : ''
    ].filter(Boolean).join('・') || '設備なし';

    let catClass = 'cat-1';
    if (p.category_tentative.includes('区分II')) catClass = 'cat-2';
    if (p.category_tentative.includes('区分III')) catClass = 'cat-3';

    return `
      <tr>
        <td><strong>#${p.no}</strong></td>
        <td><strong>${p.short_name || p.route_and_name}</strong><br><small style="color:#94a3b8">${p.road_type} (${p.municipality})</small></td>
        <td>${p.rail_crossing ? 'あり（高架下）' : 'なし'}</td>
        <td>${p.elevation_m}m</td>
        <td>${p.bus_routes_count}系統</td>
        <td>${equipStr}</td>
        <td><span class="badge-tag ${catClass}">${p.category_tentative}</span></td>
        <td><small>${p.rail_crossing ? '遠隔監視センサ設置・通行規制事前告知' : '現状維持・通常監視'}</small></td>
      </tr>
    `;
  }).join('');
}

// Export CSV
function exportAdminCSV() {
  if (!underpassesData) return;
  const header = ['no,municipality,road_type,route_and_name,rail_crossing,elevation_m,bus_routes,category_tentative,risk_note'];
  const rows = underpassesData.features.map(f => {
    const p = f.properties;
    return `"${p.no}","${p.municipality}","${p.road_type}","${p.route_and_name}","${p.rail_crossing}","${p.elevation_m}","${p.bus_routes_count}","${p.category_tentative}","${p.risk_note}"`;
  });
  const csvContent = '\uFEFF' + [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amemichi3d_minato_4category_export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Launch
initMap();
