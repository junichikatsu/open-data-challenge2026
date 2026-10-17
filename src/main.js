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
let facilitiesVisible = true;
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
// Area Viewports Configuration (東京都主要エリア・全域)
const AREA_VIEWPORTS = {
  minato: { center: [139.7555, 35.6555], zoom: 15.6, pitch: 52, bearing: -25 },
  shinjuku_shibuya: { center: [139.7000, 35.6780], zoom: 14.2, pitch: 48, bearing: -10 },
  shinagawa_ota: { center: [139.7250, 35.5950], zoom: 13.8, pitch: 45, bearing: 0 },
  setagaya_suginami: { center: [139.6400, 35.6600], zoom: 13.8, pitch: 42, bearing: -5 },
  johoku: { center: [139.6900, 35.7500], zoom: 13.5, pitch: 45, bearing: 10 },
  joto: { center: [139.8100, 35.7200], zoom: 13.2, pitch: 40, bearing: -15 },
  tama: { center: [139.4200, 35.6700], zoom: 12.5, pitch: 45, bearing: 0 },
  all_tokyo: { center: [139.6917, 35.6895], zoom: 10.5, pitch: 35, bearing: 0 }
};

// Area Selector & Admin Filter Elements
const areaSelect = document.getElementById('area-select');
const adminAreaFilter = document.getElementById('admin-area-filter');
const adminCatFilter = document.getElementById('admin-cat-filter');
const adminSearchInput = document.getElementById('admin-search-input');
const adminCountBadge = document.getElementById('admin-count-badge');

// ODPT Transit Status Elements & Presets
const btnToggleTransit = document.getElementById('btn-toggle-transit');
const headerTransitDot = document.getElementById('header-transit-dot');
const transitModal = document.getElementById('transit-modal');
const btnCloseTransit = document.getElementById('btn-close-transit');
const transitLiveBadge = document.getElementById('transit-live-badge');
const transitLastUpdated = document.getElementById('transit-last-updated');
const transitLinesGrid = document.getElementById('transit-lines-grid');
const btnToggleApiConfig = document.getElementById('btn-toggle-api-config');
const apiToggleArrow = document.getElementById('api-toggle-arrow');
const odptApiConfigBox = document.getElementById('odpt-api-config-box');
const odptApiKeyInput = document.getElementById('odpt-api-key-input');
const btnSaveApiKey = document.getElementById('btn-save-api-key');
const btnFetchLiveOdpt = document.getElementById('btn-fetch-live-odpt');
const odptApiStatusMsg = document.getElementById('odpt-api-status-msg');
const btnTransitNavigate = document.getElementById('btn-transit-navigate');

let currentTransitScenarioKey = 'normal';

const TOEI_LINES = [
  {
    id: 'asakusa',
    code: 'A',
    name: '都営浅草線',
    enName: 'Toei Asakusa Line',
    color: '#E85298',
    textColor: '#ffffff',
    odptRailway: 'odpt.Railway:Toei.Asakusa'
  },
  {
    id: 'mita',
    code: 'I',
    name: '都営三田線',
    enName: 'Toei Mita Line',
    color: '#0079C2',
    textColor: '#ffffff',
    odptRailway: 'odpt.Railway:Toei.Mita'
  },
  {
    id: 'shinjuku',
    code: 'S',
    name: '都営新宿線',
    enName: 'Toei Shinjuku Line',
    color: '#6CBB5A',
    textColor: '#ffffff',
    odptRailway: 'odpt.Railway:Toei.Shinjuku'
  },
  {
    id: 'oedo',
    code: 'E',
    name: '都営大江戸線',
    enName: 'Toei Oedo Line',
    color: '#B6007A',
    textColor: '#ffffff',
    odptRailway: 'odpt.Railway:Toei.Oedo'
  },
  {
    id: 'toei_bus',
    code: '🚌',
    name: '都営バス (安全代替幹線 & 警戒路線)',
    enName: 'Toei Bus Routes',
    color: '#15803d',
    textColor: '#ffffff',
    odptRailway: null
  },
  {
    id: 'jr_east',
    code: 'JR',
    name: 'JR線 (山手線・京浜東北線)',
    enName: 'JR Yamanote / Keihin-Tohoku',
    color: '#16a34a',
    textColor: '#ffffff',
    odptRailway: null
  }
];

const TRANSIT_SCENARIOS = {
  normal: {
    name: '☀️ 全線平常運行',
    updatedText: 'LIVE同期 (平常)',
    dotState: 'normal',
    badgeClass: '',
    pulseDotClass: 'green',
    lines: {
      asakusa: { status: 'normal', statusText: '平常運行', detail: '全線で平常通り運行しています。' },
      mita: { status: 'normal', statusText: '平常運行', detail: '全線で平常通り運行しています。' },
      shinjuku: { status: 'normal', statusText: '平常運行', detail: '全線で平常通り運行しています。' },
      oedo: { status: 'normal', statusText: '平常運行', detail: '全線で平常通り運行しています。' },
      toei_bus: { status: 'normal', statusText: '平常運行', detail: '都06（新橋〜渋谷）・浜95（品川〜東京タワー）など主要系統は定時運行中です。' },
      jr_east: { status: 'normal', statusText: '平常運行', detail: '山手線・京浜東北線は平常通り運行しています。' }
    }
  },
  delay: {
    name: '⚠️ 17:10 局地豪雨 (遅延・バス迂回)',
    updatedText: '17:10 局地豪雨警報',
    dotState: 'warning',
    badgeClass: 'danger',
    pulseDotClass: 'red',
    lines: {
      asakusa: { status: 'delayed', statusText: '遅延 (約15分)', detail: '大雨に伴う安全確認のため、一部列車に10〜15分の遅れが発生しています。' },
      mita: { status: 'normal', statusText: '平常運行', detail: '全線で平常通り運行しています。' },
      shinjuku: { status: 'normal', statusText: '平常運行', detail: '全線で平常通り運行しています。' },
      oedo: { status: 'delayed', statusText: '遅延 (約10分)', detail: '大雨による混雑および徐行運転のため、最大10分の遅れが出ています。' },
      toei_bus: { status: 'delayed', statusText: '浜95迂回運行中', detail: '浜95系統は浜松町ガード下冠水警戒のため迂回運行を実施しています。都06系統（高台幹線）は平常運行中。' },
      jr_east: { status: 'delayed', statusText: '遅延 (約20分)', detail: '雨量規制のため山手線・京浜東北線に一部遅れ。' }
    }
  },
  suspend: {
    name: '🚨 17:15 豪雨全線見合わせ (大江戸・浅草線)',
    updatedText: '17:15 🚨 運転見合わせ発令',
    dotState: 'danger',
    badgeClass: 'danger',
    pulseDotClass: 'red',
    lines: {
      asakusa: { status: 'suspended', statusText: '運転見合わせ', detail: '⚠️ 激甚豪雨・構内浸水のおそれのため、全線で運転を見合わせています。他社線への振替輸送を実施中。' },
      mita: { status: 'delayed', statusText: '遅延・徐行運転', detail: '大雨の影響により徐行運転中。一部区間で運休が発生しています。' },
      shinjuku: { status: 'delayed', statusText: '遅延 (約25分)', detail: '大雨の影響によりダイヤが乱れています。' },
      oedo: { status: 'suspended', statusText: '運転見合わせ', detail: '⚠️ 地下出入口冠水警戒および大雨のため全線運転見合わせ。改札入場規制を実施中。低所出口（A1等）は閉鎖。' },
      toei_bus: { status: 'delayed', statusText: '都06代替幹線運行', detail: '🚌 【安全代替輸送】都06系統（高台幹線・新橋〜渋谷）は通常運行中。浜95系統は運休。' },
      jr_east: { status: 'suspended', statusText: '運転見合わせ', detail: '⚠️ 雨量計規制値超過のため山手線・京浜東北線が全線運転見合わせ。' }
    }
  },
  heavy: {
    name: '🌊 首都直下激甚豪雨 (地下鉄全滅)',
    updatedText: '17:30 🌊 激甚災害避難指示',
    dotState: 'danger',
    badgeClass: 'danger',
    pulseDotClass: 'red',
    lines: {
      asakusa: { status: 'suspended', statusText: '運転見合わせ', detail: '⚠️ 浸水被害のおそれのため全線運転見合わせ。' },
      mita: { status: 'suspended', statusText: '運転見合わせ', detail: '⚠️ 地下道冠水のため全線運転見合わせ。' },
      shinjuku: { status: 'suspended', statusText: '運転見合わせ', detail: '⚠️ 線路浸水警戒のため全線運転見合わせ。' },
      oedo: { status: 'suspended', statusText: '運転見合わせ', detail: '⚠️ 全駅改札閉鎖。駅構内から地上・一時滞在施設へ退避指示。' },
      toei_bus: { status: 'delayed', statusText: '高台幹線のみ運行', detail: '都06系統のみ徐行運行中。平地路線は全線運休。' },
      jr_east: { status: 'suspended', statusText: '全線運転見合わせ', detail: '首都圏在来線全線で運転見合わせ。' }
    }
  }
};

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
      fetch('./data/tokyo_underpass_159.geojson'),
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

  // 3.1 Facility Pulse / Glow
  map.addLayer({
    id: 'facility-pulse',
    type: 'circle',
    source: 'station-facilities',
    paint: {
      'circle-radius': [
        'case',
        ['==', ['get', 'type'], 'shelter'], 22,
        ['==', ['get', 'flood_risk_level'], 'safe'], 18,
        ['==', ['get', 'flood_risk_level'], 'danger'], 16,
        13
      ],
      'circle-color': [
        'case',
        ['==', ['get', 'type'], 'shelter'], '#0284c7',
        ['==', ['get', 'flood_risk_level'], 'safe'], '#10b981',
        ['==', ['get', 'flood_risk_level'], 'danger'], '#ef4444',
        '#f59e0b'
      ],
      'circle-opacity': 0.28,
      'circle-blur': 0.7
    }
  });

  // 3.2 Facility Main Point
  map.addLayer({
    id: 'facility-points',
    type: 'circle',
    source: 'station-facilities',
    paint: {
      'circle-radius': [
        'case',
        ['==', ['get', 'type'], 'shelter'], 13,
        ['==', ['get', 'flood_risk_level'], 'safe'], 11,
        9
      ],
      'circle-color': [
        'case',
        ['==', ['get', 'type'], 'shelter'], '#0ea5e9',
        ['==', ['get', 'flood_risk_level'], 'safe'], '#10b981',
        ['==', ['get', 'flood_risk_level'], 'danger'], '#ef4444',
        '#f59e0b'
      ],
      'circle-stroke-width': 2.8,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.95
    }
  });

  // 3.3 Facility Text Labels (Zoom >= 14.2)
  map.addLayer({
    id: 'facility-labels',
    type: 'symbol',
    source: 'station-facilities',
    minzoom: 14.2,
    layout: {
      'text-field': [
        'case',
        ['==', ['get', 'type'], 'shelter'], ['concat', '🏛️ ', ['get', 'name']],
        ['concat', '🚪 ', ['get', 'exit_code']]
      ],
      'text-font': ['Noto Sans Regular', 'Open Sans Regular'],
      'text-size': [
        'case',
        ['==', ['get', 'type'], 'shelter'], 11.5,
        10
      ],
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
      'text-allow-overlap': false
    },
    paint: {
      'text-color': [
        'case',
        ['==', ['get', 'type'], 'shelter'], '#7dd3fc',
        ['==', ['get', 'flood_risk_level'], 'safe'], '#6ee7b7',
        ['==', ['get', 'flood_risk_level'], 'danger'], '#fca5a5',
        '#fed7aa'
      ],
      'text-halo-color': 'rgba(15, 23, 42, 0.95)',
      'text-halo-width': 2.2
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

// ==========================================================================
// ODPT Transit Status & Simulator Functions
// ==========================================================================

function renderTransitGrid(scenarioKey = 'normal', customData = null) {
  if (!transitLinesGrid) return;
  const scenario = TRANSIT_SCENARIOS[scenarioKey] || TRANSIT_SCENARIOS.normal;
  const lineStates = customData || scenario.lines;

  transitLinesGrid.innerHTML = TOEI_LINES.map(line => {
    const st = lineStates[line.id] || { status: 'normal', statusText: '平常運行', detail: '情報なし' };
    const statusClass = st.status === 'suspended' ? 'status-suspended' : (st.status === 'delayed' ? 'status-delayed' : 'status-normal');
    const pillClass = st.status;

    return `
      <div class="transit-line-card ${statusClass}">
        <div class="line-info-col">
          <div class="line-badge-symbol" style="background-color: ${line.color}; color: ${line.textColor};">
            ${line.code}
          </div>
          <div class="line-name-group">
            <span class="line-main-name">${line.name}</span>
            <span class="line-sub-name">${line.enName}</span>
          </div>
        </div>
        <div class="line-status-col">
          <span class="line-status-pill ${pillClass}">
            ${st.status === 'suspended' ? '🚨' : (st.status === 'delayed' ? '⚠️' : '✅')} ${st.statusText}
          </span>
          <span class="line-detail-text">${st.detail}</span>
        </div>
      </div>
    `;
  }).join('');
}

function applyTransitScenario(scenarioKey) {
  const scenario = TRANSIT_SCENARIOS[scenarioKey];
  if (!scenario) return;

  currentTransitScenarioKey = scenarioKey;

  // Header status dot update
  if (headerTransitDot) {
    headerTransitDot.className = `status-dot ${scenario.dotState === 'danger' ? 'red' : (scenario.dotState === 'warning' ? 'yellow' : 'green')}`;
  }

  // Live badge in modal
  if (transitLastUpdated) {
    transitLastUpdated.textContent = scenario.updatedText;
  }
  if (transitLiveBadge) {
    transitLiveBadge.className = `live-pulse-badge ${scenario.badgeClass}`;
    const pDot = transitLiveBadge.querySelector('.pulse-dot');
    if (pDot) pDot.className = `pulse-dot ${scenario.pulseDotClass}`;
  }

  // Active button
  const simBtnMap = {
    normal: document.getElementById('btn-sim-normal'),
    delay: document.getElementById('btn-sim-delay'),
    suspend: document.getElementById('btn-sim-suspend'),
    heavy: document.getElementById('btn-sim-heavy')
  };
  Object.entries(simBtnMap).forEach(([key, btn]) => {
    if (btn) btn.classList.toggle('active', key === scenarioKey);
  });

  // Render cards
  renderTransitGrid(scenarioKey);

  // Storm banner sync
  if (scenarioKey === 'suspend' || scenarioKey === 'heavy') {
    const msgEl = stormBanner ? stormBanner.querySelector('.storm-msg') : null;
    if (msgEl) {
      msgEl.innerHTML = `⚠️ 都営大江戸線・浅草線：<strong>豪雨冠水により全線運転見合わせ</strong>`;
    }
  }
}

function showApiStatus(msg, isSuccess = true) {
  if (!odptApiStatusMsg) return;
  odptApiStatusMsg.textContent = msg;
  odptApiStatusMsg.style.color = isSuccess ? '#34d399' : '#f87171';
}

async function fetchLiveODPT() {
  const savedKey = odptApiKeyInput ? odptApiKeyInput.value.trim() : (localStorage.getItem('odpt_consumer_key') || '');
  if (!savedKey) {
    showApiStatus('⚠️ ODPT APIキーが未入力です。キーを入力して「保存」してください（未入力時は内蔵シミュレータで動作します）。', false);
    return;
  }
  showApiStatus('🔄 ODPT APIから都営地下鉄運行情報を取得中...', true);
  try {
    const url = `https://api-public.odpt.org/api/v4/odpt:TrainInformation?odpt:operator=odpt.Operator:Toei&acl:consumerKey=${encodeURIComponent(savedKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('運行情報データが見つかりませんでした');
    }

    const parsedLines = { ...TRANSIT_SCENARIOS.normal.lines };
    let hasSuspension = false;
    let hasDelay = false;

    data.forEach(item => {
      const railway = item['odpt:railway'] || '';
      const statusTextJa = item['odpt:trainInformationStatus'] ? (item['odpt:trainInformationStatus'].ja || '') : '';
      const detailTextJa = item['odpt:trainInformationText'] ? (item['odpt:trainInformationText'].ja || '') : '';

      let lineId = null;
      if (railway.includes('Asakusa')) lineId = 'asakusa';
      else if (railway.includes('Mita')) lineId = 'mita';
      else if (railway.includes('Shinjuku')) lineId = 'shinjuku';
      else if (railway.includes('Oedo')) lineId = 'oedo';

      if (lineId) {
        let status = 'normal';
        if (statusTextJa.includes('見合わせ') || statusTextJa.includes('運休') || detailTextJa.includes('見合わせ') || detailTextJa.includes('運休')) {
          status = 'suspended';
          hasSuspension = true;
        } else if (statusTextJa.includes('遅延') || detailTextJa.includes('遅れ') || detailTextJa.includes('遅延')) {
          status = 'delayed';
          hasDelay = true;
        }
        parsedLines[lineId] = {
          status,
          statusText: statusTextJa || (status === 'normal' ? '平常運行' : (status === 'suspended' ? '運転見合わせ' : '遅延')),
          detail: detailTextJa || '全線で平常通り運行しています。'
        };
      }
    });

    const nowStr = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    renderTransitGrid('normal', parsedLines);

    if (transitLastUpdated) {
      transitLastUpdated.textContent = `LIVE API (${nowStr})`;
    }
    if (headerTransitDot) {
      headerTransitDot.className = `status-dot ${hasSuspension ? 'red' : (hasDelay ? 'yellow' : 'green')}`;
    }
    showApiStatus(`✅ ODPT 本番APIから最新データを取得しました (${nowStr} 更新)`, true);
  } catch (err) {
    console.warn('ODPT live fetch failed:', err);
    showApiStatus(`⚠️ ライブ取得に失敗（${err.message}）。CORS制約または無効なキーです。内蔵データを使用します。`, false);
  }
}

function setupTransitEvents() {
  if (btnToggleTransit && transitModal) {
    btnToggleTransit.addEventListener('click', () => {
      transitModal.classList.remove('hidden');
      renderTransitGrid(currentTransitScenarioKey);
    });
  }

  if (btnCloseTransit && transitModal) {
    btnCloseTransit.addEventListener('click', () => {
      transitModal.classList.add('hidden');
    });
  }

  if (transitModal) {
    transitModal.addEventListener('click', (e) => {
      if (e.target === transitModal) {
        transitModal.classList.add('hidden');
      }
    });
  }

  // Simulator buttons
  const simBtnMap = {
    normal: document.getElementById('btn-sim-normal'),
    delay: document.getElementById('btn-sim-delay'),
    suspend: document.getElementById('btn-sim-suspend'),
    heavy: document.getElementById('btn-sim-heavy')
  };
  Object.entries(simBtnMap).forEach(([key, btn]) => {
    if (btn) {
      btn.addEventListener('click', () => {
        applyTransitScenario(key);
      });
    }
  });

  // API Toggle
  if (btnToggleApiConfig && odptApiConfigBox) {
    btnToggleApiConfig.addEventListener('click', () => {
      const isHidden = odptApiConfigBox.classList.toggle('hidden');
      if (apiToggleArrow) apiToggleArrow.textContent = isHidden ? '▼' : '▲';
    });
  }

  // Load saved API Key
  if (odptApiKeyInput) {
    const saved = localStorage.getItem('odpt_consumer_key');
    if (saved) odptApiKeyInput.value = saved;
  }

  if (btnSaveApiKey && odptApiKeyInput) {
    btnSaveApiKey.addEventListener('click', () => {
      const val = odptApiKeyInput.value.trim();
      if (val) {
        localStorage.setItem('odpt_consumer_key', val);
        showApiStatus('✅ ODPT APIトークンを保存しました', true);
      } else {
        localStorage.removeItem('odpt_consumer_key');
        showApiStatus('ℹ️ APIトークンをクリアしました', false);
      }
    });
  }

  if (btnFetchLiveOdpt) {
    btnFetchLiveOdpt.addEventListener('click', () => {
      fetchLiveODPT();
    });
  }

  // Navigate to Storm Mode
  if (btnTransitNavigate) {
    btnTransitNavigate.addEventListener('click', () => {
      if (transitModal) transitModal.classList.add('hidden');
      switchMode('storm');
      map.flyTo({
        center: DAIMON_CENTER,
        zoom: 16.5,
        pitch: 60,
        bearing: -25,
        duration: 1500
      });
      applyTransitScenario('suspend');
    });
  }

  // Initial render
  renderTransitGrid('normal');
}

// UI & Map Events
function setupEvents() {
  setupTransitEvents();

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

  const btnFocusDaimon = document.getElementById('btn-focus-daimon');
  if (btnFocusDaimon) {
    btnFocusDaimon.addEventListener('click', () => {
      map.flyTo({
        center: DAIMON_CENTER,
        zoom: 16.2,
        pitch: 55,
        bearing: -20,
        duration: 1500
      });
    });
  }

  // Drawer Close
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => {
      detailDrawer.classList.remove('open');
      detailDrawer.style.display = 'none';
    });
  }

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

  // Station Facilities (Exits & Shelters) Toggle
  const toggleFacilitiesBtn = document.getElementById('btn-toggle-facilities');
  if (toggleFacilitiesBtn) {
    toggleFacilitiesBtn.addEventListener('click', () => {
      facilitiesVisible = !facilitiesVisible;
      toggleFacilitiesBtn.classList.toggle('active', facilitiesVisible);
      const visibility = facilitiesVisible ? 'visible' : 'none';
      ['facility-pulse', 'facility-points', 'facility-labels'].forEach(layer => {
        if (map.getLayer(layer)) {
          map.setLayoutProperty(layer, 'visibility', visibility);
        }
      });
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
  const handleUnderpassClick = (e) => {
    if (!e.features.length) return;
    const f = e.features[0];
    showUnderpassDetails(f.properties);
  };
  map.on('click', 'underpass-points', handleUnderpassClick);
  map.on('click', 'underpass-pulse', handleUnderpassClick);

  const handleFacilityClick = (e) => {
    if (!e.features.length) return;
    const f = e.features[0];
    showFacilityDetails(f.properties);
  };
  map.on('click', 'facility-points', handleFacilityClick);
  map.on('click', 'facility-pulse', handleFacilityClick);
  map.on('click', 'facility-labels', handleFacilityClick);

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
  ['underpass-points', 'underpass-pulse', 'facility-points', 'facility-pulse', 'facility-labels', '3d-landmarks-layer', 'toei-bus-routes-core', 'toei-bus-stops-circle'].forEach(layer => {
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

  // Area Select Jump
  if (areaSelect) {
    areaSelect.addEventListener('change', (e) => {
      const key = e.target.value;
      const vp = AREA_VIEWPORTS[key];
      if (vp) {
        map.flyTo({
          ...vp,
          duration: 1800,
          essential: true
        });
      }
    });
  }

  // Admin Panel Filters & Search
  if (adminAreaFilter) {
    adminAreaFilter.addEventListener('change', () => renderAdminTable());
  }
  if (adminCatFilter) {
    adminCatFilter.addEventListener('change', () => renderAdminTable());
  }
  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', () => renderAdminTable());
  }
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

  // Update Station Facilities (Exits & Shelters) dynamic flood highlight
  if (map.getLayer('facility-points') && map.getLayer('facility-pulse')) {
    if (rainMm >= 50) {
      map.setPaintProperty('facility-points', 'circle-radius', [
        'case',
        ['==', ['get', 'type'], 'shelter'], 15,
        ['==', ['get', 'flood_risk_level'], 'danger'], 13,
        ['==', ['get', 'flood_risk_level'], 'safe'], 13,
        8
      ]);
      map.setPaintProperty('facility-pulse', 'circle-radius', [
        'case',
        ['==', ['get', 'type'], 'shelter'], 28,
        ['==', ['get', 'flood_risk_level'], 'danger'], 26,
        ['==', ['get', 'flood_risk_level'], 'safe'], 24,
        14
      ]);
      map.setPaintProperty('facility-pulse', 'circle-opacity', [
        'case',
        ['==', ['get', 'flood_risk_level'], 'danger'], 0.5,
        ['==', ['get', 'flood_risk_level'], 'safe'], 0.45,
        0.2
      ]);
    } else {
      map.setPaintProperty('facility-points', 'circle-radius', [
        'case',
        ['==', ['get', 'type'], 'shelter'], 13,
        ['==', ['get', 'flood_risk_level'], 'safe'], 11,
        9
      ]);
      map.setPaintProperty('facility-pulse', 'circle-radius', [
        'case',
        ['==', ['get', 'type'], 'shelter'], 22,
        ['==', ['get', 'flood_risk_level'], 'safe'], 18,
        ['==', ['get', 'flood_risk_level'], 'danger'], 16,
        13
      ]);
      map.setPaintProperty('facility-pulse', 'circle-opacity', 0.28);
    }
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
    applyTransitScenario('normal');
  } else if (mode === 'storm') {
    stormBanner.classList.remove('hidden');
    adminPanel.classList.add('hidden');
    if (makerPanel) makerPanel.classList.add('hidden');
    rainSlider.value = 80;
    updateRainSimulation(80);
    map.setLayoutProperty('safe-route-glow', 'visibility', 'visible');
    map.setLayoutProperty('safe-route-core', 'visibility', 'visible');
    applyTransitScenario('suspend');

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
    poiBadge.textContent = `🏛️ ${props.category || '帰宅困難者一時滞在施設'}`;
    poiTitle.textContent = props.name;

    drawerContent.innerHTML = `
      <div class="poi-property-list">
        <div class="poi-item">
          <div class="poi-item-label">収容可能人数</div>
          <div class="poi-item-value"><strong>${props.capacity ? props.capacity.toLocaleString() : '1,000+'} 名</strong></div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">歩行者デッキ接続</div>
          <div class="poi-item-value">${props.deck_connected ? '✅ <strong>ペデストリアンデッキ直結</strong>（地上冠水路面を一切通らずに安全到達可能）' : '高台一般道路アクセス'}</div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">豪雨時ステータス</div>
          <div class="poi-item-value"><span class="badge-tag cat-3">${props.status || '警戒レベル4時 開設推奨施設'}</span></div>
        </div>
      </div>
      <div class="poi-route-guidance">
        <div class="guidance-title">🛡️ 一時滞在施設 避難ガイド</div>
        <div>${props.note}</div>
      </div>
      <div style="margin-top: 14px;">
        <button id="btn-focus-shelter-action" class="btn-primary" style="width: 100%;">
          📍 この避難施設をフォーカス表示
        </button>
      </div>
    `;

    const focusBtn = document.getElementById('btn-focus-shelter-action');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        const coords = props.geometry && props.geometry.coordinates ? props.geometry.coordinates : [139.7595, 35.6558];
        map.flyTo({
          center: coords,
          zoom: 16.8,
          pitch: 62,
          bearing: -20,
          duration: 1200
        });
      });
    }
  } else {
    // Station Exit (GTFS-Pathways)
    let badgeClass = 'badge';
    let badgeText = `🚪 GTFS-Pathways ${props.exit_code}`;
    if (props.flood_risk_level === 'safe') {
      badgeClass = 'badge success';
      badgeText = `✅ 【推奨出口】GTFS-Pathways ${props.exit_code}`;
    } else if (props.flood_risk_level === 'danger') {
      badgeClass = 'badge danger';
      badgeText = `🚨 【進入危険】GTFS-Pathways ${props.exit_code}`;
    } else {
      badgeClass = 'badge warning';
      badgeText = `⚠️ 【冠水注意】GTFS-Pathways ${props.exit_code}`;
    }

    poiBadge.className = badgeClass;
    poiBadge.textContent = badgeText;
    poiTitle.textContent = `${props.station_name} ${props.exit_code}`;

    drawerContent.innerHTML = `
      <div class="poi-property-list">
        <div class="poi-item">
          <div class="poi-item-label">出口属性（GTFS-Pathways）</div>
          <div class="poi-item-value"><strong>${props.recommendation_in_flood}</strong></div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">立体歩道・デッキ接続</div>
          <div class="poi-item-value">${props.deck_connected ? '✅ <strong>ペデストリアンデッキ直結</strong>（ガード下・すり鉢状窪地を潜らない）' : '⚠️ 地上道路直結（路面湛水・側溝逆流に注意）'}</div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">直面するアンダーパス</div>
          <div class="poi-item-value">${props.facing_underpass || 'なし（安全高架ルート）'}</div>
        </div>
        <div class="poi-item">
          <div class="poi-item-label">最寄り一時滞在施設</div>
          <div class="poi-item-value">${props.nearest_shelter || '東京都立産業貿易センター 浜松町館'}</div>
        </div>
      </div>
      <div class="poi-route-guidance">
        <div class="guidance-title">💡 出口アメミチ・ナビゲーション</div>
        <div>${props.note}</div>
      </div>
      <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 8px;">
        ${props.flood_risk_level === 'danger' ? `
          <button id="btn-switch-to-safe-b3" class="btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); width: 100%;">
            🛡️ 安全な「大門駅 B3出口（デッキ直結）」へ切り替える
          </button>
        ` : `
          <button id="btn-draw-from-exit" class="btn-primary" style="width: 100%;">
            ✏️ この出口からアメミチを描く（安全診断）
          </button>
        `}
      </div>
    `;

    const switchBtn = document.getElementById('btn-switch-to-safe-b3');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        // Focus Daimon B3
        map.flyTo({
          center: [139.7554, 35.6558],
          zoom: 17,
          pitch: 60,
          bearing: -25,
          duration: 1200
        });
        showFacilityDetails({
          station_name: '都営大江戸線・浅草線 大門駅',
          exit_code: 'B3出口 (デッキ直結)',
          type: 'exit',
          deck_connected: true,
          flood_risk_level: 'safe',
          facing_underpass: 'なし（高架歩道デッキ経由）',
          recommendation_in_flood: '【最推奨出口】地上冠水回避・ペデストリアンデッキ直結',
          nearest_shelter: '東京都立産業貿易センター 浜松町館 (徒歩2分)',
          note: '浜松町駅・竹芝方面への歩行者デッキに直結。浜松町ガード下・川口架道橋を潜らずに安全に一時滞在施設や都06バス停へ退避可能。'
        });
      });
    }

    const drawBtn = document.getElementById('btn-draw-from-exit');
    if (drawBtn) {
      drawBtn.addEventListener('click', () => {
        detailDrawer.classList.remove('open');
        detailDrawer.style.display = 'none';
        switchMode('peace');
        toggleDrawingMode(true);
      });
    }
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

// Filter underpasses for Admin Table
function getFilteredUnderpasses() {
  if (!underpassesData) return [];
  const selectedArea = adminAreaFilter ? adminAreaFilter.value : 'all';
  const selectedCat = adminCatFilter ? adminCatFilter.value : 'all';
  const query = adminSearchInput ? adminSearchInput.value.trim().toLowerCase() : '';

  return underpassesData.features.filter(f => {
    const p = f.properties;
    // Area filter
    if (selectedArea !== 'all') {
      if (p.area !== selectedArea && p.municipality !== selectedArea) return false;
    }
    // Category filter
    if (selectedCat !== 'all') {
      if (!p.category_tentative.includes(selectedCat)) return false;
    }
    // Query search
    if (query) {
      const targetStr = `${p.short_name || ''} ${p.route_and_name || ''} ${p.municipality || ''} ${p.rail_crossing_line || ''}`.toLowerCase();
      if (!targetStr.includes(query)) return false;
    }
    return true;
  });
}

// Render Admin Table
function renderAdminTable() {
  if (!underpassesData) return;
  const filtered = getFilteredUnderpasses();

  if (adminCountBadge) {
    adminCountBadge.textContent = `${filtered.length}箇所表示中 / 全${underpassesData.features.length}箇所`;
  }

  if (filtered.length === 0) {
    adminTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">
          🔍 条件に一致するアンダーパス注意箇所が見つかりませんでした。
        </td>
      </tr>
    `;
    return;
  }

  adminTbody.innerHTML = filtered.map(f => {
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
        <td>${p.rail_crossing ? `あり (${p.rail_crossing_line || '高架下'})` : 'なし'}</td>
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
  const filtered = getFilteredUnderpasses();
  const header = ['no,area,municipality,road_type,route_and_name,rail_crossing,rail_crossing_line,elevation_m,bus_routes,category_tentative,risk_note'];
  const rows = filtered.map(f => {
    const p = f.properties;
    return `"${p.no}","${p.area || ''}","${p.municipality}","${p.road_type}","${p.short_name || p.route_and_name}","${p.rail_crossing}","${p.rail_crossing_line || ''}","${p.elevation_m}","${p.bus_routes_count}","${p.category_tentative}","${p.risk_note}"`;
  });
  const csvContent = '\uFEFF' + [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `amemichi3d_tokyo_underpass_${filtered.length}items_export.csv`;
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
  if (areaSelect) areaSelect.value = 'minato';
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

  // Sync ODPT Transit Status with Scenario Progression
  if (idx === 0) {
    applyTransitScenario('normal');
  } else if (idx === 1) {
    applyTransitScenario('delay');
  } else if (idx >= 2) {
    applyTransitScenario('suspend');
  }

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
