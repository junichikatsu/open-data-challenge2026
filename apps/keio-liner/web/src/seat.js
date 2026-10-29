// @ts-check
/**
 * 席の左右おすすめ。京王ライナーは座席指定なので、席を選ぶ前に「進行方向のどちら側が見どころが多いか」を出す。
 *
 * 便の経路に投影したスポット（左右・線路からの距離つき）を、見えやすさで重み付けして左右で足し合わせる。
 *   - 種類の重み: 競技場や遊園地のような大きいもの・山は遠くからでも見える。寺社や資料館は線路から見えにくい
 *   - 距離の重み: 線路に近いほど見える
 *   - 川は左右ではなく「渡る」ものなので、左右の点数には入れず別に出す
 */

/**
 * @typedef {import('./geo.js').Spot} Spot
 * @typedef {{ spot: Spot, km: number, offsetM: number, side: 'left' | 'right', under?: boolean }} SpotOnRoute
 * @typedef {{ side: 'left' | 'right' | 'either' | null, left: number, right: number, highlights: { left: Spot[], right: Spot[] }, rivers: string[] }} SeatAdvice
 */

/** @type {Record<string, number>} */
const VISIBILITY = {
  stadium: 3,
  leisure: 2.5,
  mountain: 2,
  park: 1.5,
  viewpoint: 1,
  sight: 1,
  history: 0.8,
  shrine: 0.7,
  temple: 0.6,
  worship: 0.6,
  campus: 0.6,
  museum: 0.5,
}

/** 鉄橋で渡るとみなす距離（川の線と線路の距離） */
export const RIVER_CROSS_M = 300

/** 左右の差がこれ未満なら「どちらでも」 */
const EVEN_RATIO = 0.1

/** @param {number} offsetM */
function nearness(offsetM) {
  if (offsetM <= 300) return 1
  if (offsetM <= 700) return 0.6
  return 0.3
}

/** @param {SpotOnRoute} s */
export function isRiverCrossing(s) {
  return s.spot.category === 'river' && s.offsetM <= RIVER_CROSS_M
}

/**
 * @param {SpotOnRoute[]} route
 * @returns {SeatAdvice}
 */
export function recommendSeat(route) {
  const score = { left: 0, right: 0 }
  /** @type {{ spot: Spot, w: number, side: 'left' | 'right' }[]} */
  const weighted = []
  /** @type {Spot[]} */
  const crossed = []
  for (const s of route) {
    if (s.spot.category === 'river') {
      // 上水・用水・分水路は水路で、車窓の見どころとしては弱い
      if (isRiverCrossing(s) && !/上水|用水|分水路/.test(s.spot.name) && !crossed.some((c) => c.name === s.spot.name)) crossed.push(s.spot)
      continue
    }
    const w = (VISIBILITY[s.spot.category] ?? 0.5) * nearness(s.offsetM)
    score[s.side] += w
    weighted.push({ spot: s.spot, w, side: s.side })
  }
  const total = score.left + score.right
  /** @type {SeatAdvice['side']} */
  let side = null
  if (total > 0) {
    const diff = Math.abs(score.left - score.right) / total
    side = diff < EVEN_RATIO ? 'either' : score.right > score.left ? 'right' : 'left'
  }
  // 左右の点数が近い便が多い（沿線の両側に見どころがある）ので、勧める側に関わらず両側の上位を出す
  const top = (/** @type {'left' | 'right'} */ sd) =>
    weighted
      .filter((x) => x.side === sd)
      .sort((a, b) => b.w - a.w)
      .slice(0, 3)
      .map((x) => x.spot)
  const highlights = { left: top('left'), right: top('right') }
  // 大きい川（沿線での長さが長い川）から並べる
  const rivers = crossed.sort((a, b) => (b.lengthKm ?? 0) - (a.lengthKm ?? 0)).map((r) => r.name)
  return { side, left: round(score.left), right: round(score.right), highlights, rivers }
}

/** @param {number} n */
const round = (n) => Math.round(n * 10) / 10
