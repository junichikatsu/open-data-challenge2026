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
  'way[waterway=river][name][~"^(wikipedia|wikidata)$"~"."]',
  'nwr[amenity~"^(university)$"][name][~"^(wikipedia|wikidata)$"~"."]',
]
const body = `[out:json][timeout:120];(${selectors.flatMap((s) => poly.map((p) => `${s}${p};`)).join('')});out center tags;`

console.log('[spots] Overpass に問い合わせ')
const res = await fetch(OVERPASS, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'keio-liner-app/0.1 (open-data-challenge2026)' },
  body: new URLSearchParams({ data: body }),
})
if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`)
const json = await res.json()
// タイムアウト等は 200 で remark だけ返る。空のまま書き出さない
if (json.remark) throw new Error(`Overpass: ${json.remark}`)
console.log(`[spots] 取得 ${json.elements.length} 要素`)

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
for (const e of json.elements) {
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
  }
  // 川は区間ごとに別の way になっているので、名前でまとめて線路に一番近い区間を残す
  const key = `${spot.category}:${spot.name}`
  const d = distanceToLinesM(spot.lat, spot.lon)
  const prev = byName.get(key)
  if (!prev || d < prev.d) byName.set(key, { ...spot, d })
}
const spots = [...byName.values()]
  .filter((s) => s.d <= RADIUS)
  .map(({ d, ...s }) => s)
  .sort((a, b) => a.id.localeCompare(b.id))

/** 路線（駅を結んだ折れ線）までのおおよその距離（m） */
function distanceToLinesM(/** @type {number} */ lat, /** @type {number} */ lon) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180)
  const ky = 110540
  let best = Infinity
  for (const l of lines) {
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
