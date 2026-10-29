// @ts-check
/**
 * 位置の計算。すべて純関数（DOM に触らない）。
 *
 * 便の経路（path）は駅の並びと各駅の時刻（0 時からの分）。駅と駅の間は直線で結び、
 * 時刻で按分して「いまどこにいるか」を出す。地下区間では GPS が使えないので、これが基本になる。
 */

/**
 * @typedef {{ station: string, name: string, lat: number, lon: number, arr?: number, dep?: number, stop: boolean, est: boolean, km: number }} PathPoint
 * @typedef {{ id: string, name: string, nameEn: string, category: string, lat: number, lon: number, wikipedia: string, lengthKm?: number }} Spot
 * @typedef {{ lat: number, lon: number, km: number, index: number, atStation: boolean, heading: [number, number] }} Position
 */

/** @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2 */
export function distanceM(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(a))
}

/** 駅を出る時刻（無ければ着く時刻） @param {PathPoint} p */
const leaveAt = (p) => /** @type {number} */ (p.dep ?? p.arr)
/** 駅に着く時刻（無ければ出る時刻） @param {PathPoint} p */
const arriveAt = (p) => /** @type {number} */ (p.arr ?? p.dep)

/**
 * 時刻 t（分）の位置。始発前は始発駅、終着後は終着駅に置く。
 * @param {PathPoint[]} path @param {number} t @returns {Position}
 */
export function positionAt(path, t) {
  const first = path[0]
  const last = path[path.length - 1]
  if (!first || !last) throw new Error('経路がありません')
  if (t <= leaveAt(first)) return { lat: first.lat, lon: first.lon, km: 0, index: 0, atStation: true, heading: headingOf(path, 0) }
  if (t >= arriveAt(last)) return { lat: last.lat, lon: last.lon, km: last.km, index: path.length - 1, atStation: true, heading: headingOf(path, path.length - 2) }
  for (let i = 0; i < path.length - 1; i++) {
    const a = /** @type {PathPoint} */ (path[i])
    const b = /** @type {PathPoint} */ (path[i + 1])
    // 駅に停まっている間
    if (t >= arriveAt(a) && t < leaveAt(a)) return { lat: a.lat, lon: a.lon, km: a.km, index: i, atStation: true, heading: headingOf(path, i) }
    const t0 = leaveAt(a)
    const t1 = arriveAt(b)
    if (t >= t0 && t < t1) {
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
        km: a.km + (b.km - a.km) * f,
        index: i,
        atStation: false,
        heading: headingOf(path, i),
      }
    }
  }
  return { lat: last.lat, lon: last.lon, km: last.km, index: path.length - 1, atStation: true, heading: headingOf(path, path.length - 2) }
}

/** 区間 i の進行方向（経度・緯度の差。左右の判定にだけ使う） @param {PathPoint[]} path @param {number} i @returns {[number, number]} */
function headingOf(path, i) {
  const a = path[Math.max(0, Math.min(i, path.length - 2))]
  const b = path[Math.max(1, Math.min(i + 1, path.length - 1))]
  if (!a || !b) return [0, 0]
  return [(b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat]
}

/**
 * スポットを経路に投影する: 経路上で一番近い点の km（始発からの距離）と、線路からの距離（m）、左右。
 * @param {PathPoint[]} path @param {Spot} spot
 * @returns {{ km: number, offsetM: number, side: 'left' | 'right' }}
 */
export function projectSpot(path, spot) {
  const kx = 111320 * Math.cos((spot.lat * Math.PI) / 180)
  const ky = 110540
  let best = { km: 0, offsetM: Infinity, side: /** @type {'left'|'right'} */ ('left') }
  for (let i = 1; i < path.length; i++) {
    const a = /** @type {PathPoint} */ (path[i - 1])
    const b = /** @type {PathPoint} */ (path[i])
    const ax = (a.lon - spot.lon) * kx
    const ay = (a.lat - spot.lat) * ky
    const dx = (b.lon - a.lon) * kx
    const dy = (b.lat - a.lat) * ky
    const len2 = dx * dx + dy * dy || 1
    const f = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const px = ax + f * dx
    const py = ay + f * dy
    const d = Math.hypot(px, py)
    if (d < best.offsetM) {
      // 進行方向 (dx, dy) に対してスポット (-px, -py) が左なら外積が正
      const cross = dx * -py - dy * -px
      best = { km: a.km + (b.km - a.km) * f, offsetM: d, side: cross > 0 ? 'left' : 'right' }
    }
  }
  return best
}

/**
 * GPS の位置を経路に投影して km を出す（地上区間で推定位置を補正する）。
 * @param {PathPoint[]} path @param {number} lat @param {number} lon
 */
export function kmFromGps(path, lat, lon) {
  return projectSpot(path, { id: '', name: '', nameEn: '', category: '', lat, lon, wikipedia: '' })
}

/**
 * km から時刻（分）を逆算する。GPS で補正した位置を時刻のずれ（遅れ）に直すのに使う。
 * @param {PathPoint[]} path @param {number} km
 */
export function timeAtKm(path, km) {
  for (let i = 1; i < path.length; i++) {
    const a = /** @type {PathPoint} */ (path[i - 1])
    const b = /** @type {PathPoint} */ (path[i])
    if (km <= b.km) {
      const f = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0
      return leaveAt(a) + (arriveAt(b) - leaveAt(a)) * Math.max(0, f)
    }
  }
  return arriveAt(/** @type {PathPoint} */ (path[path.length - 1]))
}

/** 次に停車する駅（いまの位置より先） @param {PathPoint[]} path @param {Position} pos */
export function nextStop(path, pos) {
  for (let i = pos.index + (pos.atStation ? 1 : 1); i < path.length; i++) {
    const p = /** @type {PathPoint} */ (path[i])
    if (p.stop && !p.est) return p
  }
  return undefined
}

/** km が地下区間に入っているか @param {[number, number][] | undefined} tunnels @param {number} km */
export function inTunnel(tunnels, km) {
  return (tunnels ?? []).some(([a, b]) => km >= a && km <= b)
}

export { arriveAt, leaveAt }
