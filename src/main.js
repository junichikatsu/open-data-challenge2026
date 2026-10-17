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
let isDrawing = false;
let drawnPoints = [];

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

// Maker & Score Modal Elements
const makerPanel = document.getElementById('maker-panel');
const drawToggleBtn = document.getElementById('btn-draw-toggle');
const scoreRouteBtn = document.getElementById('btn-score-route');
const clearRouteBtn = document.getElementById('btn-clear-route');
const drawStatusBadge = document.getElementById('draw-status-badge');
const drawHintBox = document.getElementById('draw-hint-box');

const scoreModal = document.getElementById('score-modal');
const scoreVal = document.getElementById('score-val');
const scoreRank = document.getElementById('score-rank');
const scoreDetails = document.getElementById('score-details');
const closeScoreBtn = document.getElementById('btn-close-score');
const testFloodBtn = document.getElementById('btn-test-flood');
const redrawBtn = document.getElementById('btn-redraw');

// Mitekita Survey Elements
const mitekitaModal = document.getElementById('mitekita-modal');
const mitekitaTitle = document.getElementById('mitekita-title');
const closeMitekitaBtn = document.getElementById('btn-close-mitekita');
const submitSurveyBtn = document.getElementById('btn-submit-survey');
let currentSurveyUnderpassNo = null;

// Scenario Player Elements & State
const scenarioToggleBtn = document.getElementById('btn-scenario-toggle');
const scenarioPanel = document.getElementById('scenario-panel');
const scenarioPlayBtn = document.getElementById('btn-scenario-play');
const scenarioSpeedBtn = document.getElementById('btn-scenario-speed');
const scenarioResetBtn = document.getElementById('btn-scenario-reset');
const closeScenarioBtn = document.getElementById('btn-close-scenario');
const scenarioTimeBadge = document.getElementById('scenario-time-badge');
const scenarioStoryBox = document.getElementById('scenario-story-box');
const storyTimeDisplay = document.getElementById('story-time-display');
const storyTextDisplay = document.getElementById('story-text-display');
const timelineProgressBar = document.getElementById('timeline-progress-bar');
const stepBtns = document.querySelectorAll('.scenario-timeline .step-btn');

let scenarioPlaying = false;
let scenarioCurrentStep = 0;
let scenarioTimer = null;
let scenarioSpeed = 1; // 1 or 2

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

  // 5. User Amemichi Drawing Layer
  map.addSource('user-amemichi-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  });

  map.addLayer({
    id: 'user-amemichi-line-glow',
    type: 'line',
    source: 'user-amemichi-source',
    filter: ['==', '$type', 'LineString'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#06b6d4',
      'line-width': 9,
      'line-opacity': 0.5,
      'line-blur': 4
    }
  });

  map.addLayer({
    id: 'user-amemichi-line-core',
    type: 'line',
    source: 'user-amemichi-source',
    filter: ['==', '$type', 'LineString'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#38bdf8',
      'line-width': 4
    }
  });

  map.addLayer({
    id: 'user-amemichi-points',
    type: 'circle',
    source: 'user-amemichi-source',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': [
        'case',
        ['==', ['get', 'point_type'], 'start'], '#10b981',
        ['==', ['get', 'point_type'], 'end'], '#f59e0b',
        '#06b6d4'
      ],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Scenario Auto-Navigation Safe Route Source & Layers
  map.addSource('scenario-safe-route-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  });

  map.addLayer({
    id: 'scenario-safe-route-glow',
    type: 'line',
    source: 'scenario-safe-route-source',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#10b981',
      'line-width': 12,
      'line-opacity': 0.6,
      'line-blur': 6
    }
  });

  map.addLayer({
    id: 'scenario-safe-route-core',
    type: 'line',
    source: 'scenario-safe-route-source',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#34d399',
      'line-width': 5
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
    map.on('mouseenter', layer, () => {
      if (!isDrawing) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layer, () => {
      if (!isDrawing) map.getCanvas().style.cursor = '';
    });
  });

  // Amemichi Maker Events
  if (drawToggleBtn) {
    drawToggleBtn.addEventListener('click', toggleDrawingMode);
  }

  if (clearRouteBtn) {
    clearRouteBtn.addEventListener('click', clearDrawnRoute);
  }

  if (scoreRouteBtn) {
    scoreRouteBtn.addEventListener('click', handleScoreRoute);
  }

  if (closeScoreBtn) {
    closeScoreBtn.addEventListener('click', () => scoreModal.classList.add('hidden'));
  }
  if (redrawBtn) {
    redrawBtn.addEventListener('click', () => {
      scoreModal.classList.add('hidden');
      toggleDrawingMode(true);
    });
  }
  if (testFloodBtn) {
    testFloodBtn.addEventListener('click', runFloodTestForRoute);
  }

  // Mitekita Survey Modal Events
  if (closeMitekitaBtn) {
    closeMitekitaBtn.addEventListener('click', () => mitekitaModal.classList.add('hidden'));
  }
  if (submitSurveyBtn) {
    submitSurveyBtn.addEventListener('click', () => handleMitekitaSubmit());
  }

  // Option buttons in survey modal
  document.querySelectorAll('.survey-question .opt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const parent = e.target.closest('.survey-options');
      parent.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  // Map Click for Drawing Points
  map.on('click', (e) => {
    if (!isDrawing) return;
    const pt = [e.lngLat.lng, e.lngLat.lat];
    drawnPoints.push(pt);
    updateUserAmemichiMapLayer();

    if (drawnPoints.length >= 2) {
      scoreRouteBtn.disabled = false;
      scoreRouteBtn.textContent = `🏆 採点する (${drawnPoints.length}地点)`;
    }
    clearRouteBtn.disabled = false;
  });

  // Scenario Player Events
  if (scenarioToggleBtn) {
    scenarioToggleBtn.addEventListener('click', () => {
      if (scenarioPanel.classList.contains('hidden')) {
        openScenarioPlayer();
      } else {
        closeScenarioPlayer();
      }
    });
  }

  if (closeScenarioBtn) {
    closeScenarioBtn.addEventListener('click', closeScenarioPlayer);
  }

  if (scenarioPlayBtn) {
    scenarioPlayBtn.addEventListener('click', toggleScenarioPlayback);
  }

  if (scenarioSpeedBtn) {
    scenarioSpeedBtn.addEventListener('click', () => {
      scenarioSpeed = scenarioSpeed === 1 ? 2 : 1;
      scenarioSpeedBtn.textContent = `⏩ ${scenarioSpeed}x`;
    });
  }

  if (scenarioResetBtn) {
    scenarioResetBtn.addEventListener('click', stopScenarioPlayback);
  }

  stepBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const stepIdx = parseInt(e.currentTarget.dataset.step, 10);
      pauseScenarioPlayback();
      goToScenarioStep(stepIdx);
    });
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
      // Warning styling: Hama95 turns into warning red, Miyako06 stays green
      map.setPaintProperty('toei-bus-routes-core', 'line-color', [
        'case',
        ['==', ['get', 'route_id'], 'Toei_Hama95'], '#f43f5e',
        '#10b981'
      ]);
      map.setPaintProperty('toei-bus-routes-core', 'line-width', [
        'case',
        ['==', ['get', 'route_id'], 'Toei_Hama95'], 5.5,
        4
      ]);
    } else {
      map.setPaintProperty('toei-bus-routes-core', 'line-color', ['get', 'color']);
      map.setPaintProperty('toei-bus-routes-core', 'line-width', 4);
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
    if (makerPanel) makerPanel.classList.remove('hidden');
    rainSlider.value = 0;
    updateRainSimulation(0);
    map.setLayoutProperty('safe-route-glow', 'visibility', 'none');
    map.setLayoutProperty('safe-route-core', 'visibility', 'none');
  } else if (mode === 'storm') {
    stormBanner.classList.remove('hidden');
    adminPanel.classList.add('hidden');
    if (makerPanel) makerPanel.classList.add('hidden');
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
    if (makerPanel) makerPanel.classList.add('hidden');
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

  const rainMm = parseInt(rainSlider.value, 10);
  const isRainy = rainMm >= 50;

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
    ${isRainy ?
      '<button class="btn-survey-launch" disabled>⚠️ 豪雨時: 安全のため現地調査は停止中</button>' :
      `<button id="btn-open-survey" class="btn-survey-launch" data-no="${props.no}">📸 現地設備を「見てきた」報告</button>`
    }
  `;

  const openSurveyBtn = document.getElementById('btn-open-survey');
  if (openSurveyBtn) {
    openSurveyBtn.addEventListener('click', () => openMitekitaSurvey(props));
  }
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

// ==========================================
// Amemichi Maker & Scoring Logic
// ==========================================

function toggleDrawingMode(forceState) {
  isDrawing = typeof forceState === 'boolean' ? forceState : !isDrawing;

  if (isDrawing) {
    drawToggleBtn.textContent = '⏹️ 描画を完了';
    drawToggleBtn.classList.replace('btn-primary', 'btn-accent');
    drawStatusBadge.className = 'badge danger';
    drawStatusBadge.textContent = '描画中（地図をクリック）';
    if (drawHintBox) drawHintBox.classList.remove('hidden');
    map.getCanvas().style.cursor = 'crosshair';
  } else {
    drawToggleBtn.textContent = '✏️ ルートを描く';
    drawToggleBtn.classList.replace('btn-accent', 'btn-primary');
    drawStatusBadge.className = 'badge';
    drawStatusBadge.textContent = drawnPoints.length > 0 ? `${drawnPoints.length}地点 登録済` : '待機中';
    if (drawHintBox) drawHintBox.classList.add('hidden');
    map.getCanvas().style.cursor = '';
  }
}

function clearDrawnRoute() {
  drawnPoints = [];
  updateUserAmemichiMapLayer();
  scoreRouteBtn.disabled = true;
  scoreRouteBtn.textContent = '🏆 採点する';
  clearRouteBtn.disabled = true;
  drawStatusBadge.className = 'badge';
  drawStatusBadge.textContent = '待機中';
}

function updateUserAmemichiMapLayer() {
  const source = map.getSource('user-amemichi-source');
  if (!source) return;

  const features = [];

  // Line
  if (drawnPoints.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: drawnPoints
      },
      properties: {}
    });
  }

  // Points
  drawnPoints.forEach((pt, idx) => {
    let pType = 'mid';
    if (idx === 0) pType = 'start';
    else if (idx === drawnPoints.length - 1) pType = 'end';

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: pt
      },
      properties: {
        point_type: pType,
        index: idx
      }
    });
  });

  source.setData({
    type: 'FeatureCollection',
    features: features
  });
}

function handleScoreRoute() {
  if (drawnPoints.length < 2) return;
  toggleDrawingMode(false);

  const res = scoreAmemichi(drawnPoints);
  if (!res) return;

  scoreVal.textContent = res.score;
  scoreRank.textContent = `RANK ${res.rank}`;

  // Styling based on rank
  scoreRank.className = 'score-rank-badge';
  if (res.rank === 'S') scoreRank.style.background = 'linear-gradient(135deg, #10b981, #059669)';
  else if (res.rank === 'A') scoreRank.style.background = 'linear-gradient(135deg, #06b6d4, #2563eb)';
  else if (res.rank === 'B') scoreRank.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
  else scoreRank.style.background = 'linear-gradient(135deg, #f43f5e, #be123c)';

  scoreDetails.innerHTML = res.breakdown.map(item => `
    <div class="breakdown-row ${item.status}">
      <span class="breakdown-icon">${item.icon}</span>
      <div class="breakdown-text">
        <div class="breakdown-title">${item.title}</div>
        <div class="breakdown-desc">${item.desc}</div>
      </div>
      <div class="breakdown-pts ${item.pts.startsWith('+') ? 'pos' : (item.pts.startsWith('-') ? 'neg' : '')}">${item.pts}</div>
    </div>
  `).join('');

  scoreModal.classList.remove('hidden');
}

function scoreAmemichi(points) {
  if (points.length < 2) return null;

  let score = 100;
  const breakdown = [];

  const underpassCoords = [
    { name: '浜松町ガード下 (No.122)', coords: [139.7582, 35.6542] },
    { name: 'JR川口架道橋下 (No.121)', coords: [139.7547, 35.6515] },
    { name: '東新橋こ道橋 (No.123)', coords: [139.7600, 35.6630] },
    { name: '築地虎ノ門トンネル (No.65)', coords: [139.7540, 35.6660] },
    { name: 'JR高輪架道橋下 (No.126)', coords: [139.7408, 35.6372] }
  ];

  let closestUnderpassDist = Infinity;
  let closestUnderpassName = '';

  for (const up of underpassCoords) {
    for (let i = 0; i < points.length - 1; i++) {
      const d = distToSegment(up.coords, points[i], points[i + 1]);
      if (d < closestUnderpassDist) {
        closestUnderpassDist = d;
        closestUnderpassName = up.name;
      }
    }
  }

  // 1. Underpass flood risk penalty
  if (closestUnderpassDist < 45) {
    score -= 50;
    breakdown.push({
      status: 'fail',
      icon: '🚨',
      title: '冠水危険アンダーパスを通過',
      desc: `${closestUnderpassName}（最接近: 約${Math.round(closestUnderpassDist)}m）を通過しています。豪雨時は完全水没立ち往生のリスクが極めて高いです。`,
      pts: '-50点'
    });
  } else if (closestUnderpassDist < 90) {
    score -= 20;
    breakdown.push({
      status: 'warning',
      icon: '⚠️',
      title: '低地すり鉢窪地への接近注意',
      desc: `${closestUnderpassName}の浸水警戒エリア（最接近: 約${Math.round(closestUnderpassDist)}m）に接近しています。`,
      pts: '-20点'
    });
  } else {
    breakdown.push({
      status: 'pass',
      icon: '✅',
      title: 'アンダーパス冠水箇所を完全回避',
      desc: 'すべてのアンダーパス注意箇所から十分な安全距離（90m以上）を保って迂回できています。',
      pts: '+0点'
    });
  }

  // 2. Station Exit Selection (GTFS-Pathways)
  const daimonB3 = [139.7548, 35.6565];
  const startPt = points[0];
  const distToB3 = getDistanceMeters(startPt, daimonB3);

  if (distToB3 < 100) {
    score = Math.min(100, score + 10);
    breakdown.push({
      status: 'pass',
      icon: '🌉',
      title: 'GTFS-Pathways: 大門駅B3出口（デッキ直結）を選択',
      desc: '地上道路へ降りずにペデストリアンデッキ経由で高所移動できる最良の出口から出発しています。',
      pts: '+10点 (ボーナス)'
    });
  } else {
    breakdown.push({
      status: 'warning',
      icon: '🚶',
      title: 'GTFS-Pathways: 地上出口からの出発',
      desc: '地上出口は直後に低位路面を通るため、大雨時はB3出口（デッキ直結）の活用を推奨します。',
      pts: '±0点'
    });
  }

  // 3. Shelter / Safe Landmark Connection
  const shelterCoord = [139.7595, 35.6558];
  const endPt = points[points.length - 1];
  const distToShelter = getDistanceMeters(endPt, shelterCoord);

  if (distToShelter < 120) {
    score = Math.min(100, score + 10);
    breakdown.push({
      status: 'pass',
      icon: '🏢',
      title: '都立一時滞在施設（産業貿易センター）へ安全到達',
      desc: '水害時の帰宅困難者用一時滞在施設へ、浸水区域を通らずデッキ経由で安全に到達できています。',
      pts: '+10点 (ボーナス)'
    });
  }

  score = Math.max(10, Math.min(100, score));
  let rank = 'C';
  if (score >= 90) rank = 'S';
  else if (score >= 75) rank = 'A';
  else if (score >= 50) rank = 'B';

  return { score, rank, breakdown };
}

function runFloodTestForRoute() {
  scoreModal.classList.add('hidden');
  rainSlider.value = 0;
  updateRainSimulation(0);

  let currentMm = 0;
  const targetMm = 80;
  const timer = setInterval(() => {
    currentMm += 5;
    rainSlider.value = currentMm;
    updateRainSimulation(currentMm);
    if (currentMm >= targetMm) {
      clearInterval(timer);
    }
  }, 70);
}

// Distance calculation helpers (Haversine & Point-to-Segment)
function getDistanceMeters(c1, c2) {
  const R = 6371000;
  const dLat = (c2[1] - c1[1]) * Math.PI / 180;
  const dLon = (c2[0] - c1[0]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(c1[1] * Math.PI / 180) * Math.cos(c2[1] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function distToSegment(p, v, w) {
  const l2 = (v[0] - w[0])**2 + (v[1] - w[1])**2;
  if (l2 === 0) return getDistanceMeters(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])];
  return getDistanceMeters(p, projection);
}

// ==========================================
// Mitekita Survey Implementation
// ==========================================

function openMitekitaSurvey(props) {
  currentSurveyUnderpassNo = props.no;
  mitekitaTitle.textContent = `${props.short_name || props.route_and_name} の設備報告`;

  let equipObj = {};
  try {
    equipObj = typeof props.equipment === 'string' ? JSON.parse(props.equipment) : props.equipment;
  } catch (e) {}

  document.querySelectorAll('.survey-question').forEach(q => {
    const key = q.dataset.key;
    const val = equipObj ? equipObj[key] : null;
    const opts = q.querySelectorAll('.opt-btn');
    opts.forEach(b => b.classList.remove('active'));

    if (val === true) {
      q.querySelector('.opt-btn[data-val="true"]')?.classList.add('active');
    } else if (val === false) {
      q.querySelector('.opt-btn[data-val="false"]')?.classList.add('active');
    } else {
      q.querySelector('.opt-btn[data-val="unknown"]')?.classList.add('active');
    }
  });

  mitekitaModal.classList.remove('hidden');
}

function handleMitekitaSubmit() {
  if (!currentSurveyUnderpassNo || !underpassesData) return;

  const targetFeature = underpassesData.features.find(f => f.properties.no === currentSurveyUnderpassNo);
  if (!targetFeature) return;

  const newEquip = {};
  document.querySelectorAll('.survey-question').forEach(q => {
    const key = q.dataset.key;
    const activeBtn = q.querySelector('.opt-btn.active');
    const val = activeBtn ? activeBtn.dataset.val : 'unknown';
    if (val === 'true') newEquip[key] = true;
    else if (val === 'false') newEquip[key] = false;
    else newEquip[key] = null;
  });

  targetFeature.properties.equipment = newEquip;

  // Re-calculate category tentative if needed
  if (newEquip.barrier && newEquip.sensor) {
    targetFeature.properties.category_tentative = '区分II（設備強化済）';
  }

  // Update Drawer
  showUnderpassDetails(targetFeature.properties);

  // Update Admin Table & GeoJSON source
  renderAdminTable();
  const source = map.getSource('underpasses');
  if (source) source.setData(underpassesData);

  mitekitaModal.classList.add('hidden');
}

// ==========================================
// Scenario Simulation Playback Engine
// ==========================================

const SCENARIO_SAFE_ROUTE = {
  type: 'Feature',
  properties: {
    name: 'アメミチ安全推奨ルート (B3出口〜竹芝デッキ〜産業貿易センター)',
    underpass_count: 0,
    deck_usage: true
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [139.75535, 35.65525], // 大門駅 B3出口
      [139.75620, 35.65510], // 浜松町2丁目ペデストリアン入口
      [139.75715, 35.65495], // JR線横断高架歩道デッキ
      [139.75860, 35.65475], // ポートシティ竹芝 連絡デッキ
      [139.75980, 35.65490], // スカイデッキ歩行者専用通路
      [139.76060, 35.65550]  // 都立産業貿易センター浜松町館（東京都指定・帰宅困難者一時滞在施設）
    ]
  }
};

const SCENARIO_STEPS = [
  {
    step: 0,
    time: '16:50',
    badge: '16:50 (降雨開始)',
    title: '16:50 ｜ 通常降雨 (20mm/h)',
    text: '港区一帯で雨が降り始めました。都営地下鉄（大江戸線・浅草線）およびJR山手線・京浜東北線は平常運行中です。アンダーパスの水位も平常です。',
    rainMm: 20,
    camera: { center: [139.7555, 35.6555], zoom: 15.6, pitch: 52, bearing: -25 },
    stateClass: 'normal-state',
    showBanner: false,
    showSafeRoute: false
  },
  {
    step: 1,
    time: '17:10',
    badge: '17:10 (局地豪雨・冠水警戒)',
    title: '17:10 ｜ 線状降水帯急変 (65mm/h)',
    text: '急激なゲリラ豪雨が発生！札の辻ガード・芝五丁目アンダーパスの水位が急速に上昇し、国交省ガイドライン【区分I（冠水注意・事前閉鎖準備）】に移行。浜95系統バス路線が冠水警戒エリアに突入します。',
    rainMm: 65,
    camera: { center: [139.7465, 35.6482], zoom: 16.5, pitch: 62, bearing: 22 },
    stateClass: 'warning-state',
    showBanner: false,
    showSafeRoute: false
  },
  {
    step: 2,
    time: '17:15',
    badge: '17:15 (全線運転見合わせ)',
    title: '17:15 ｜ 【ODPT速報】地下鉄・JR全線 運転見合わせ！',
    text: '⚠️ 【ODPTリアルタイム速報】都営浅草線・大江戸線が大雨冠水のため全線運転見合わせ！JR各線も抑止。大門駅・三田駅で改札制限が発生。地下通路は浸水危険のため、低所出入口（A1等）は使用禁止です。',
    rainMm: 80,
    camera: { center: [139.7555, 35.6555], zoom: 16.3, pitch: 58, bearing: -15 },
    stateClass: 'danger-state',
    showBanner: true,
    bannerData: {
      badge: '🚨 ODPT速報: 全線見合わせ発令',
      msg: '⚠️ 都営大江戸線・浅草線・JR各線: 豪雨のため全線運転見合わせ',
      advice: '地下通路浸水のおそれ。<strong>「大門駅 B3出口」</strong>よりペデストリアンデッキ経由で一時滞在施設へ退避してください。<br>🚌 <strong>平常運行代替バス</strong>: 高台幹線を走る<strong>都営バス【都06系統】</strong>は平常運行中。'
    },
    showSafeRoute: false
  },
  {
    step: 3,
    time: '17:20',
    badge: '17:20 (アメミチ誘導完了)',
    title: '17:20 ｜ 「アメミチ・ナビ」発動・くぐらずに帰る！',
    text: '✅ ガード下を通らない【アメミチ安全ルート】が自動提示されました！大門駅B3出口から地上デッキへ直結し、冠水危険箇所を100%回避して安全な都立一時滞在施設（産業貿易センター）および平常運行中の【都営バス 都06系統】へ安全に誘導します。',
    rainMm: 85,
    camera: { center: [139.7580, 35.6552], zoom: 16.8, pitch: 66, bearing: -38 },
    stateClass: 'safe-state',
    showBanner: true,
    bannerData: {
      badge: '✅ アメミチ・ナビ発動中 (安全避難誘導)',
      msg: '🚶 ガード下完全回避ルートへ誘導中 (安全性100点)',
      advice: 'ガード下を一切くぐらず地上デッキ・高台へ。平常運行中の<strong>都営バス【都06系統】</strong>（停留所まで徒歩2分）への安全な乗換退避が可能です。'
    },
    showSafeRoute: true
  }
];

function openScenarioPlayer() {
  scenarioPanel.classList.remove('hidden');
  scenarioToggleBtn.classList.add('playing');
  goToScenarioStep(0);
}

function closeScenarioPlayer() {
  stopScenarioPlayback();
  scenarioPanel.classList.add('hidden');
  scenarioToggleBtn.classList.remove('playing');
  clearScenarioRoute();
}

function toggleScenarioPlayback() {
  if (scenarioPlaying) {
    pauseScenarioPlayback();
  } else {
    startScenarioPlayback();
  }
}

function startScenarioPlayback() {
  scenarioPlaying = true;
  scenarioPlayBtn.textContent = '⏸ 一時停止';
  scenarioToggleBtn.classList.add('playing');

  if (scenarioCurrentStep >= SCENARIO_STEPS.length - 1) {
    scenarioCurrentStep = 0;
  }
  goToScenarioStep(scenarioCurrentStep);

  scheduleNextScenarioStep();
}

function pauseScenarioPlayback() {
  scenarioPlaying = false;
  scenarioPlayBtn.textContent = '▶ 再生';
  if (scenarioTimer) clearTimeout(scenarioTimer);
}

function stopScenarioPlayback() {
  pauseScenarioPlayback();
  scenarioCurrentStep = 0;
  goToScenarioStep(0);
}

function scheduleNextScenarioStep() {
  if (!scenarioPlaying) return;
  const delay = scenarioSpeed === 2 ? 2200 : 4800;
  scenarioTimer = setTimeout(() => {
    if (!scenarioPlaying) return;
    if (scenarioCurrentStep < SCENARIO_STEPS.length - 1) {
      goToScenarioStep(scenarioCurrentStep + 1);
      scheduleNextScenarioStep();
    } else {
      pauseScenarioPlayback();
    }
  }, delay);
}

function goToScenarioStep(idx) {
  if (idx < 0 || idx >= SCENARIO_STEPS.length) return;
  scenarioCurrentStep = idx;

  const step = SCENARIO_STEPS[idx];

  // Update UI Elements
  scenarioTimeBadge.textContent = step.badge;
  storyTimeDisplay.textContent = step.title;
  storyTextDisplay.textContent = step.text;

  // Box status class
  scenarioStoryBox.className = 'scenario-story-box ' + step.stateClass;

  // Step buttons & progress bar
  stepBtns.forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  const progressPercent = (idx / (SCENARIO_STEPS.length - 1)) * 100;
  timelineProgressBar.style.width = `${progressPercent}%`;

  // Update Rain Slider & Simulation
  rainSlider.value = step.rainMm;
  updateRainSimulation(step.rainMm);

  // Storm Banner control
  if (step.showBanner) {
    stormBanner.classList.remove('hidden');
    if (step.bannerData) {
      const badgeEl = stormBanner.querySelector('.storm-badge');
      const msgEl = stormBanner.querySelector('.storm-msg');
      const advEl = stormBanner.querySelector('.storm-advice');
      if (badgeEl) badgeEl.textContent = step.bannerData.badge;
      if (msgEl) msgEl.innerHTML = step.bannerData.msg;
      if (advEl) advEl.innerHTML = step.bannerData.advice;
    }
  } else {
    stormBanner.classList.add('hidden');
  }

  // Safe Route Layer
  const routeSource = map.getSource('scenario-safe-route-source');
  if (routeSource) {
    if (step.showSafeRoute) {
      routeSource.setData({
        type: 'FeatureCollection',
        features: [SCENARIO_SAFE_ROUTE]
      });
    } else {
      routeSource.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  // Camera animation
  map.flyTo({
    ...step.camera,
    duration: 1800,
    essential: true
  });
}

function clearScenarioRoute() {
  const routeSource = map.getSource('scenario-safe-route-source');
  if (routeSource) {
    routeSource.setData({
      type: 'FeatureCollection',
      features: []
    });
  }
}

// Launch
initMap();
