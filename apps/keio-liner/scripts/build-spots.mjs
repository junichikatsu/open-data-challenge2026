// @ts-check
/**
 * OpenStreetMap（Overpass API）から沿線のスポットを抽出する。
 *
 *   node scripts/build-spots.mjs
 *
 * 入力: data/generated/liner.json の lines（先に build-liner-data.mjs を実行しておく）
 * 出力: data/spots.json（リポジトリに入れる。OSM は ODbL なので画面に出典を表示すること）
 *
 * 多すぎると通知がうるさくなるので、名前があり、かつ「わざわざ見る価値がありそうな」ものに絞る:
 *   - 観光地・博物館・展望地・動物園・遊園地・美術館
 *   - 史跡（名前と wikipedia/wikidata があるもの）
 *   - 公園・寺社（wikipedia/wikidata があるもの = ある程度知られているもの）
 *   - 川・山（線路から見える目印になる）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const liner = JSON.parse(readFileSync(join(root, 'data/generated/liner.json'), 'utf8'))
const OVERPASS = 'https://overpass-api.de/api/interpreter'
/** 線路からの距離（m）。車窓から見える・近くにあると言える範囲 */
const RADIUS = 1200

/** @type {[number, number][][]} */
const lines = Object.values(liner.lines)
// around: に折れ線を渡すと Overpass がタイムアウトする。沿線全体を囲む矩形で取り、距離は手元で絞る
const pad = 0.015
const lats = lines.flat().map(([lat]) => lat)
const lons = lines.flat().map(([, lon]) => lon)
const bbox = `(${Math.min(...lats) - pad},${Math.min(...lons) - pad},${Math.max(...lats) + pad},${Math.max(...lons) + pad})`
const poly = [bbox]

const selectors = [
  // 画廊や駅スタンプのような細かい attraction が多いので、attraction は wikipedia/wikidata 付きに限る
  'nwr[tourism~"^(museum|viewpoint|zoo|theme_park|aquarium)$"][name]',
  'nwr[tourism=attraction][name][~"^(wikipedia|wikidata)$"~"."]',
  'nwr[historic][name][~"^(wikipedia|wikidata)$"~"."]',
  'nwr[leisure~"^(park|garden|nature_reserve|stadium)$"][name][~"^(wikipedia|wikidata)$"~"."]',
  'nwr[amenity=place_of_worship][name][~"^(wikipedia|wikidata)$"~"."]',
  'nwr[natural=peak][name]',
  'nwr[amenity~"^(university)$"][name][~"^(wikipedia|wikidata)$"~"."]',
]
const body = `[out:json][timeout:120];(${selectors.flatMap((s) => poly.map((p) => `${s}${p};`)).join('')});out center tags;`
// 川は 1 本が何十もの way に分かれていて、wikipedia は川全体（relation）にだけ付いていることが多い（多摩川など）。
// way の形（geom）を取り、線路に一番近い点 = 鉄橋で渡るあたりを位置にする
const riverBody = `[out:json][timeout:120];way[waterway=river][name]${bbox};out tags geom;`

/** 公開の Overpass は混雑で 429 / 502 / 504 を返すことがあるので、間を空けて数回やり直す @param {string} q */
async function overpass(q) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await overpassOnce(q)
    } catch (err) {
      if (attempt >= 4) throw err
      console.warn(`[spots] ${err instanceof Error ? err.message : err} → ${attempt * 15} 秒後にやり直します`)
      await new Promise((r) => setTimeout(r, attempt * 15_000))
    }
  }
}

/** @param {string} q */
async function overpassOnce(q) {
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'keio-liner-app/0.1 (open-data-challenge2026)' },
    body: new URLSearchParams({ data: q }),
  })
  if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`)
  const json = await res.json()
  // タイムアウト等は 200 で remark だけ返る。空のまま書き出さない
  if (json.remark) throw new Error(`Overpass: ${json.remark}`)
  return json.elements
}

console.log('[spots] Overpass に問い合わせ')
const elements = await overpass(body)
const rivers = await overpass(riverBody)
console.log(`[spots] 取得 ${elements.length} 要素 + 川 ${rivers.length} 区間`)
// 川の大きさの目安: 沿線の範囲に入っている長さ（km）。名前ごとに足す（多摩川が一番長くなる）
/** @type {Map<string, number>} */
const riverLength = new Map()
for (const r of rivers) {
  const g = r.geometry ?? []
  let len = 0
  for (let i = 1; i < g.length; i++) len += distanceM(g[i - 1].lat, g[i - 1].lon, g[i].lat, g[i].lon)
  riverLength.set(r.tags.name, (riverLength.get(r.tags.name) ?? 0) + len / 1000)
}
// 同じ川を複数の路線が渡る（多摩川は京王線と相模原線の両方）ので、路線ごとに渡る地点を持つ
for (const [lineName, line] of Object.entries(liner.lines)) {
  for (const r of rivers) {
    let best = { d: Infinity, lat: 0, lon: 0 }
    for (const g of r.geometry ?? []) {
      const d = distanceToLinesM(g.lat, g.lon, [line])
      if (d < best.d) best = { d, lat: g.lat, lon: g.lon }
    }
    if (best.d < Infinity) elements.push({ ...r, lat: best.lat, lon: best.lon, line: lineName, lineD: best.d })
  }
}

/** @param {Record<string,string>} t */
function categoryOf(t) {
  if (t.waterway === 'river') return 'river'
  if (t.natural === 'peak') return 'mountain'
  if (t.amenity === 'place_of_worship') return t.religion === 'shinto' ? 'shrine' : t.religion === 'buddhist' ? 'temple' : 'worship'
  if (t.leisure === 'stadium') return 'stadium'
  if (t.leisure) return 'park'
  if (t.historic) return 'history'
  if (t.amenity === 'university') return 'campus'
  if (t.tourism === 'museum' || t.tourism === 'gallery') return 'museum'
  if (t.tourism === 'viewpoint') return 'viewpoint'
  if (t.tourism === 'zoo' || t.tourism === 'theme_park' || t.tourism === 'aquarium') return 'leisure'
  return 'sight'
}

/** @type {Map<string, any>} */
const byName = new Map()
for (const e of elements) {
  const t = e.tags ?? {}
  const lat = e.lat ?? e.center?.lat
  const lon = e.lon ?? e.center?.lon
  if (lat === undefined || !t.name) continue
  // 暗渠（地下に埋められた川）は車窓から見えない
  if (/暗渠/.test(t.name) || t.tunnel === 'culvert') continue
  const spot = {
    id: `osm-${e.type[0]}${e.id}`,
    name: t.name,
    nameEn: t['name:en'] ?? '',
    category: categoryOf(t),
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    wikipedia: t.wikipedia ?? '',
    ...(t.waterway === 'river' ? { lengthKm: Math.round((riverLength.get(t.name) ?? 0) * 10) / 10 } : {}),
  }
  // 川は区間ごとに別の way になっているので、名前でまとめて線路に一番近い区間を残す
  const key = e.line ? `${spot.category}:${spot.name}:${e.line}` : `${spot.category}:${spot.name}`
  const d = e.line ? e.lineD : distanceToLinesM(spot.lat, spot.lon)
  const prev = byName.get(key)
  if (!prev || d < prev.d) byName.set(key, { ...spot, d })
}
// 複数の路線で同じ way が選ばれたときは、線路に近い方を残す（遠い方で上書きして消さない）
/** @type {Map<string, any>} */
const byId = new Map()
for (const s of byName.values()) {
  const prev = byId.get(s.id)
  if (!prev || s.d < prev.d) byId.set(s.id, s)
}
const spots = [...byId.values()]
  .filter((s) => s.d <= RADIUS)
  .map(({ d, ...s }) => s)
  .sort((a, b) => a.id.localeCompare(b.id))

/** 2 点間の距離（m） */
function distanceM(/** @type {number} */ lat1, /** @type {number} */ lon1, /** @type {number} */ lat2, /** @type {number} */ lon2) {
  const kx = 111320 * Math.cos((lat1 * Math.PI) / 180)
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * 110540)
}

/** 路線（駅を結んだ折れ線）までのおおよその距離（m） */
function distanceToLinesM(/** @type {number} */ lat, /** @type {number} */ lon, /** @type {[number, number][][]} */ target = lines) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180)
  const ky = 110540
  let best = Infinity
  for (const l of target) {
    for (let i = 1; i < l.length; i++) {
      const ax = (l[i - 1][1] - lon) * kx
      const ay = (l[i - 1][0] - lat) * ky
      const bx = (l[i][1] - lon) * kx
      const by = (l[i][0] - lat) * ky
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return best
}

writeFileSync(
  join(root, 'data/spots.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      attribution: '© OpenStreetMap contributors (ODbL)',
      radiusMeters: RADIUS,
      spots,
    },
    null,
    0,
  ),
)
const counts = spots.reduce((/** @type {Record<string,number>} */ m, s) => ((m[s.category] = (m[s.category] ?? 0) + 1), m), {})
console.log(`[spots] ${spots.length} 件: ${JSON.stringify(counts)}`)
