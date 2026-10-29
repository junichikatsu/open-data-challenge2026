// @ts-check
/**
 * 画面の配線。
 *
 *   乗車中   便を選ぶ → いまの位置（時刻＋遅れ＋任意で GPS）→ 追い抜きの数 → 車窓ガイド → スポットの通知
 *   お気に入り  通知や車窓ガイドから ♡ で保存したスポットを見返す（LINE ログインが要る）
 */
import { api, ApiError } from './api.js'
import { initAuth, isLoggedIn, login, relogin, token, userLabel } from './auth.js'
import { calendarOf, createClock, hhmm } from './clock.js'
import { byId, el, formatTime, replaceChildren } from './dom.js'
import { inTunnel, kmFromGps, nextStop, positionAt, projectSpot, timeAtKm } from './geo.js'
import { isRiverCrossing, recommendSeat } from './seat.js'

/**
 * @typedef {import('./geo.js').PathPoint} PathPoint
 * @typedef {import('./geo.js').Spot} Spot
 * @typedef {{ station: string, t: number, trainType: string, trainNumber: string, destination: string }} Overtake
 * @typedef {{ id: string, calendar: string, trainNumber: string, direction: string, origin: string, destination: string, departure: number, arrival: number, overtakeCount: number, passingCount: number }} TripSummary
 * @typedef {{ km: number, t: number, trainType: string, trainNumber: string, destination: string }} Passing
 * @typedef {TripSummary & { path: PathPoint[], overtakes: Overtake[], passings: Passing[], tunnels: [number, number][] }} Trip
 * @typedef {{ spot: Spot, km: number, offsetM: number, side: 'left' | 'right', under: boolean }} SpotOnRoute
 * @typedef {{ spotId: string, name: string, category: string, lat: number, lon: number, savedAt: number, tripLabel?: string, nearStation?: string }} Favorite
 */

/** 車窓ガイドに出す範囲: 線路から何 m 以内、何 km 先まで */
const GUIDE_OFFSET_M = 1200
const GUIDE_AHEAD_KM = 4
/** 通知する範囲: 線路から何 m 以内のスポットに、何 km 手前で知らせるか */
const NOTIFY_OFFSET_M = 800
const NOTIFY_BEFORE_KM = 0.5
const NOTIFY_GAP_KM = 0.8
const LIVE_POLL_MS = 30_000
const DEMO_SPEED = 20

const CALENDARS = /** @type {const} */ ([
  ['Weekday', '平日'],
  ['SaturdayHoliday', '土休日'],
  ['SaturdayHolidayOnRaceDay', '競馬開催日'],
])

/** @type {Record<string, [string, string]>} カテゴリ → [記号, 名前] */
const CATEGORY = {
  park: ['🌳', '公園'],
  shrine: ['⛩️', '神社'],
  temple: ['🛕', '寺院'],
  worship: ['🙏', '礼拝所'],
  museum: ['🏛️', '博物館・美術館'],
  river: ['🌊', '川'],
  leisure: ['🎡', 'レジャー'],
  sight: ['📍', '名所'],
  history: ['🏯', '史跡'],
  mountain: ['⛰️', '山'],
  stadium: ['🏟️', '競技場'],
  viewpoint: ['🔭', '展望地'],
  campus: ['🎓', '大学'],
}
const catIcon = (/** @type {string} */ c) => CATEGORY[c]?.[0] ?? '📍'
const catName = (/** @type {string} */ c) => CATEGORY[c]?.[1] ?? 'スポット'

const clock = createClock()

const state = {
  calendar: /** @type {string} */ (calendarOf(new Date())),
  /** @type {TripSummary[]} */
  trips: [],
  /** @type {Trip | null} */
  trip: null,
  /** @type {Spot[]} */
  spots: [],
  /** @type {SpotOnRoute[]} 選んだ便の経路に投影したスポット（km 順） */
  route: [],
  /** @type {Set<string>} 通知済みのスポット */
  notifiedSpots: new Set(),
  /** @type {Set<string>} 通知済みの追い抜き */
  notifiedOvertakes: new Set(),
  /** @type {Map<string, Favorite>} */
  favorites: new Map(),
  favoritesLoaded: false,
  /** @type {{ delaySec: number, text: string } | null} */
  live: null,
  /** @type {{ km: number, at: number } | null} 直近の GPS（経路に投影済み） */
  gps: null,
  /** @type {number | null} */
  gpsWatch: null,
  /** 直前の tick の時刻。大きく飛んだら通知済みを作り直す */
  lastT: /** @type {number | null} */ (null),
  /** 最後にスポットを通知した位置（km） */
  lastSpotToastKm: /** @type {number | null} */ (null),
}

// ---- 共通 -------------------------------------------------------------------

/** @param {unknown} err */
function showError(err) {
  const box = byId('error')
  if (err instanceof ApiError && err.status === 401) {
    box.textContent = 'ログインの有効期限が切れました。もう一度ログインします…'
    box.hidden = false
    relogin()
    return
  }
  box.textContent = err instanceof ApiError ? `${err.message}（${err.code}）` : String(err instanceof Error ? err.message : err)
  box.hidden = false
}

function clearError() {
  byId('error').hidden = true
}

/** @param {{ title: string, body?: string, icon?: string, action?: { label: string, run: () => void } }} t */
function toast(t) {
  const box = byId('toasts')
  const node = el('div', { class: 'toast', attrs: { role: 'status' } }, [
    el('span', { class: 'toast-icon', text: t.icon ?? '🚃' }),
    el('div', { class: 'toast-text' }, [
      el('strong', { text: t.title }),
      ...(t.body ? [el('span', { text: t.body })] : []),
    ]),
  ])
  if (t.action) {
    const a = t.action
    node.appendChild(
      el('button', {
        class: 'toast-action',
        text: a.label,
        on: {
          click: () => {
            a.run()
            node.remove()
          },
        },
      }),
    )
  }
  box.prepend(node)
  // 3 件まで。古いものから消す
  while (box.children.length > 3) box.lastElementChild?.remove()
  setTimeout(() => node.classList.add('leaving'), 7000)
  setTimeout(() => node.remove(), 7600)
  if (navigator.vibrate) navigator.vibrate(40)
}

/** @param {TripSummary} t */
const tripLabel = (t) => `${hhmm(t.departure)} ${t.origin}→${t.destination}`

// ---- 便の選択 ----------------------------------------------------------------

function renderCalendarChips() {
  replaceChildren(
    byId('calendar-chips'),
    CALENDARS.map(([id, label]) =>
      el('button', {
        class: 'chip',
        text: label,
        attrs: { type: 'button', 'aria-pressed': String(state.calendar === id) },
        on: { click: () => void selectCalendar(id) },
      }),
    ),
  )
}

/** @param {string} calendar */
async function selectCalendar(calendar) {
  state.calendar = calendar
  renderCalendarChips()
  const res = await api(`/v1/trips?calendar=${encodeURIComponent(calendar)}`)
  state.trips = res.trips
  const select = /** @type {HTMLSelectElement} */ (byId('trip-select'))
  const groups = [
    ['Outbound', '下り（新宿から）'],
    ['Inbound', '上り（新宿へ）'],
  ].map(([dir, label]) =>
    el(
      'optgroup',
      { attrs: { label: /** @type {string} */ (label) } },
      state.trips
        .filter((t) => t.direction === dir)
        .map((t) => el('option', { text: `${tripLabel(t)}（追い抜き ${t.overtakeCount}・すれ違い ${t.passingCount}）`, attrs: { value: t.id } })),
    ),
  )
  replaceChildren(select, groups)
  const pick = pickTrip(state.trips, clock.now())
  if (pick) {
    select.value = pick.id
    await selectTrip(pick.id)
  }
}

/** いま走っている便 → 次に出る便 → 最初の便 @param {TripSummary[]} trips @param {number} now */
function pickTrip(trips, now) {
  return (
    trips.find((t) => t.departure <= now && now <= t.arrival) ??
    [...trips].sort((a, b) => a.departure - b.departure).find((t) => t.departure > now) ??
    trips[0]
  )
}

/** @param {string} id */
async function selectTrip(id) {
  clearError()
  const res = await api(`/v1/trips/${encodeURIComponent(id)}`)
  state.trip = res.trip
  const path = res.trip.path
  state.route = state.spots
    .map((spot) => {
      const p = projectSpot(path, spot)
      // 地下区間の脇にあるスポットは車窓から見えない（ガイドには出すが、通知と席のおすすめには使わない）
      return { spot, ...p, under: inTunnel(res.trip.tunnels, p.km) }
    })
    .filter((s) => s.offsetM <= GUIDE_OFFSET_M && s.km > 0.2 && s.km < path[path.length - 1].km - 0.1)
    .sort((a, b) => a.km - b.km)
  state.live = null
  state.lastT = null
  renderStops()
  renderSeat()
  tick()
  void pollLive()
}

// ---- いまの位置 --------------------------------------------------------------

/** 表示に使う時刻。デモ中はデモの時計。実時間では遅れを引き、GPS があればそれを優先する */
function effectiveTime() {
  const trip = state.trip
  const t = clock.now()
  if (!trip || clock.demo) return t
  if (state.gps && Date.now() - state.gps.at < 60_000) return timeAtKm(trip.path, state.gps.km)
  return t - (state.live?.delaySec ?? 0) / 60
}

function tick() {
  const trip = state.trip
  if (!trip) return
  const t = effectiveTime()
  const pos = positionAt(trip.path, t)

  // 時計が大きく飛んだ（便の切り替え・デモ開始）ら、すでに過ぎたものは通知しない
  const jumped = state.lastT === null || Math.abs(t - state.lastT) > 3
  if (jumped) {
    state.notifiedOvertakes = new Set(trip.overtakes.filter((o) => o.t <= t).map((o) => `${o.trainNumber}@${o.station}`))
    state.notifiedSpots = new Set(state.route.filter((s) => s.km <= pos.km + NOTIFY_BEFORE_KM).map((s) => s.spot.id))
    state.lastSpotToastKm = null
  }
  state.lastT = t

  renderStatus(trip, t, pos)
  renderOvertakes(trip, t)
  renderPassings(trip, t)
  renderGuide(pos)
  if (!jumped) notify(trip, t, pos)
}

/**
 * @param {Trip} trip @param {number} t
 * @param {import('./geo.js').Position} pos
 */
function renderStatus(trip, t, pos) {
  const path = trip.path
  const total = path[path.length - 1]?.km ?? 1
  const eyebrow = byId('status-eyebrow')
  const where = byId('status-where')
  const next = byId('status-next')

  if (t < trip.departure) {
    const min = Math.ceil(trip.departure - t)
    eyebrow.textContent = clock.demo ? 'デモ再生' : '発車前'
    where.textContent = `${trip.origin} ${hhmm(trip.departure)} 発`
    next.textContent = min <= 120 ? `発車まであと ${min} 分` : `${trip.destination}行き・${hhmm(trip.arrival)} 着`
  } else if (t >= trip.arrival) {
    eyebrow.textContent = '到着'
    where.textContent = `${trip.destination}に着きました`
    next.textContent = `追い抜いた列車 ${trip.overtakes.length} 本。おつかれさまでした`
  } else {
    const a = /** @type {PathPoint} */ (path[pos.index])
    const b = path[pos.index + 1]
    const state_ = pos.atStation && a.stop ? '停車中' : inTunnel(trip.tunnels, pos.km) ? '地下を走行中' : '走行中'
    eyebrow.textContent = clock.demo ? `デモ再生 ×${clock.speed}・${state_}` : state_
    where.textContent = pos.atStation ? `${a.name}${a.stop ? '' : ' を通過'}` : `${a.name} → ${b?.name ?? ''}`
    const ns = nextStop(path, pos)
    next.textContent = ns ? `次は ${ns.name}（${hhmm(/** @type {number} */ (ns.arr ?? ns.dep))} 着予定）` : ''
  }

  const pct = Math.max(0, Math.min(100, (pos.km / total) * 100))
  byId('progress-fill').style.width = `${pct}%`
  byId('progress-train').style.left = `${pct}%`
  byId('status-clock').textContent = hhmm(clock.now())
}

/** 進捗バーの駅の目印（停車駅だけ名前を出す） */
function renderStops() {
  const trip = state.trip
  if (!trip) return
  const total = trip.path[trip.path.length - 1]?.km ?? 1
  replaceChildren(
    byId('progress-stops'),
    trip.path
      .filter((p) => p.stop && !p.est)
      .map((p) =>
        el('span', { class: 'stop', attrs: { style: `left:${(p.km / total) * 100}%` } }, [el('span', { class: 'stop-name', text: p.name })]),
      ),
  )
}

/** @param {Trip} trip @param {number} t */
function renderOvertakes(trip, t) {
  const done = trip.overtakes.filter((o) => o.t <= t)
  byId('ot-done').textContent = String(done.length)
  byId('ot-total').textContent = String(trip.overtakes.length)
  if (trip.overtakes.length === 0) {
    replaceChildren(byId('ot-list'), [el('li', { class: 'muted', text: 'この便は時刻表上、ほかの列車を追い抜きません' })])
    return
  }
  replaceChildren(
    byId('ot-list'),
    trip.overtakes.map((o) => {
      const passed = o.t <= t
      const min = Math.ceil(o.t - t)
      return el('li', { class: passed ? 'ot passed' : 'ot' }, [
        el('span', { class: 'ot-mark', text: passed ? '✓' : '' }),
        el('span', { class: 'ot-type', text: o.trainType }),
        el('span', { class: 'ot-text', text: `${o.station}で抜く${o.destination ? `（${o.destination}行）` : ''}` }),
        el('span', { class: 'ot-when', text: passed ? hhmm(o.t) : min <= 60 ? `あと${min}分` : hhmm(o.t) }),
      ])
    }),
  )
}

/** @param {import('./geo.js').Position} pos */
function renderGuide(pos) {
  const ahead = state.route.filter((s) => s.km >= pos.km - 0.3 && s.km <= pos.km + GUIDE_AHEAD_KM).slice(0, 8)
  if (ahead.length === 0) {
    replaceChildren(byId('guide-list'), [el('li', { class: 'muted', text: 'この先 4km に案内できるスポットはありません' })])
    return
  }
  replaceChildren(
    byId('guide-list'),
    ahead.map((s) => {
      const dKm = s.km - pos.km
      const when = dKm <= 0.15 ? 'いま' : `${dKm.toFixed(1)}km 先`
      return el('li', { class: s.under ? 'spot under' : 'spot' }, [
        el('span', { class: 'spot-icon', text: catIcon(s.spot.category) }),
        el('div', { class: 'spot-body' }, [
          el('strong', { text: s.spot.name }),
          el('span', {
            class: 'spot-meta',
            text: `${whereText(s)}・${catName(s.spot.category)}`,
          }),
        ]),
        el('span', { class: 'spot-when', text: when }),
        heartButton(s),
      ])
    }),
  )
}

/** スポットの見え方。川は左右ではなく「渡る」 @param {SpotOnRoute} s */
function whereText(s) {
  if (s.under) return `${s.side === 'left' ? '左手' : '右手'}・地下区間のため見えません`
  if (isRiverCrossing(s)) return '鉄橋で渡ります'
  return `${s.side === 'left' ? '左手' : '右手'}・線路から ${roundM(s.offsetM)}`
}

/** 席の左右おすすめ（便を選んだときに 1 回） */
function renderSeat() {
  const a = recommendSeat(state.route.filter((s) => !s.under))
  const head = byId('seat-side')
  const sub = byId('seat-detail')
  if (a.side === null) {
    head.textContent = 'この便の沿線には案内できるスポットが少なめです'
    sub.textContent = ''
  } else {
    head.textContent =
      a.side === 'either' ? '左右どちらの窓側にも見どころがあります' : `進行方向 ${a.side === 'right' ? '右側' : '左側'}の窓側がおすすめ`
    sub.textContent = `見どころの点数 左 ${a.left} / 右 ${a.right}${a.rivers.length ? `・${a.rivers.slice(0, 3).join('・')}を渡ります` : ''}`
  }
  /** @param {string} label @param {import('./geo.js').Spot[]} spots */
  const row = (label, spots) =>
    el('div', { class: 'seat-row' }, [
      el('span', { class: 'seat-row-label', text: label }),
      el(
        'ul',
        { class: 'seat-highlights' },
        spots.length
          ? spots.map((sp) => el('li', {}, [el('span', { text: catIcon(sp.category) }), el('span', { text: sp.name })]))
          : [el('li', { class: 'muted', text: '目立つものは少なめ' })],
      ),
    ])
  replaceChildren(byId('seat-highlights'), [row('左側', a.highlights.left), row('右側', a.highlights.right)])
}

/** すれ違い。数が多いので通知はせず、数と直前にすれ違った列車だけ出す @param {Trip} trip @param {number} t */
function renderPassings(trip, t) {
  const done = trip.passings.filter((p) => p.t <= t)
  byId('ps-done').textContent = String(done.length)
  byId('ps-total').textContent = String(trip.passings.length)
  const last = done[done.length - 1]
  const next = trip.passings.find((p) => p.t > t)
  byId('ps-last').textContent =
    t < trip.departure
      ? `この便は反対方向の列車と ${trip.passings.length} 本すれ違う予定です`
      : last
        ? `直前: ${last.trainType}（${last.destination}行）${next && t < trip.arrival ? `・次は約 ${Math.max(1, Math.round(next.t - t))} 分後` : ''}`
        : 'まだすれ違っていません'
}

/** @param {number} m */
const roundM = (m) => (m < 1000 ? `${Math.round(m / 50) * 50}m` : `${(m / 1000).toFixed(1)}km`)

/**
 * @param {Trip} trip @param {number} t
 * @param {import('./geo.js').Position} pos
 */
function notify(trip, t, pos) {
  if (t < trip.departure || t > trip.arrival) return
  for (const o of trip.overtakes) {
    const key = `${o.trainNumber}@${o.station}`
    if (o.t <= t && !state.notifiedOvertakes.has(key)) {
      state.notifiedOvertakes.add(key)
      const n = trip.overtakes.filter((x) => x.t <= t).length
      toast({ icon: '💨', title: `${o.station}で${o.trainType}を追い抜き！`, body: `これで ${n} 本目（全 ${trip.overtakes.length} 本）` })
    }
  }
  // 寺社や公園が密集する区間で通知が続かないよう、走った距離 NOTIFY_GAP_KM ごとに 1 件まで。
  // 候補のうち線路に一番近いものを出し、残りは通知済みにする（車窓ガイドには出ている）
  if (state.lastSpotToastKm !== null && pos.km - state.lastSpotToastKm < NOTIFY_GAP_KM) return
  const due = state.route.filter(
    (s) => !state.notifiedSpots.has(s.spot.id) && s.offsetM <= NOTIFY_OFFSET_M && pos.km >= s.km - NOTIFY_BEFORE_KM,
  )
  for (const s of due) state.notifiedSpots.add(s.spot.id)
  const visible = due.filter((s) => !s.under)
  if (visible.length === 0) return
  const s = /** @type {SpotOnRoute} */ (visible.reduce((a, b) => (b.offsetM < a.offsetM ? b : a)))
  state.lastSpotToastKm = pos.km
  toast({
    icon: catIcon(s.spot.category),
    title: s.spot.name,
    body: `${whereText(s)}・${catName(s.spot.category)}`,
    action: state.favorites.has(s.spot.id) ? undefined : { label: '♡ 保存', run: () => void saveFavorite(s) },
  })
}

// ---- リアルタイム（遅れ）-------------------------------------------------------

async function pollLive() {
  const trip = state.trip
  const box = byId('status-live')
  if (!trip) return
  const now = clock.now()
  if (clock.demo) {
    box.textContent = 'デモ再生中は時刻表どおりに動きます'
    return
  }
  if (now < trip.departure - 10 || now > trip.arrival + 5) {
    box.textContent = '走行中になると、遅れと走っている区間を表示します'
    return
  }
  try {
    const live = await api(`/v1/live/${trip.trainNumber}`)
    if (!live.available) {
      state.live = null
      box.textContent = live.reason === 'mock' ? 'リアルタイム情報: 模擬モードのため時刻表どおり' : 'リアルタイム情報を取得できませんでした'
    } else if (!live.found) {
      state.live = null
      box.textContent = 'この列車はまだ走行情報に出ていません'
    } else {
      const min = Math.round(live.delaySec / 60)
      const at = live.fromStation && live.toStation ? `${live.fromStation}→${live.toStation}` : (live.fromStation ?? '')
      state.live = { delaySec: live.delaySec, text: at }
      box.textContent = `${min > 0 ? `約 ${min} 分遅れ` : '定刻'}・${at}（${new Date(live.updatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 更新）`
    }
  } catch {
    box.textContent = 'リアルタイム情報を取得できませんでした'
  }
}

// ---- GPS（任意）--------------------------------------------------------------

/** @param {boolean} on */
function setGps(on) {
  if (state.gpsWatch !== null) navigator.geolocation.clearWatch(state.gpsWatch)
  state.gpsWatch = null
  state.gps = null
  if (!on) return
  if (!('geolocation' in navigator)) {
    toast({ icon: '📡', title: 'この端末では位置情報を使えません' })
    return
  }
  state.gpsWatch = navigator.geolocation.watchPosition(
    (p) => {
      const trip = state.trip
      // 地下や車内で精度が悪いときは使わない（時刻からの推定のまま）
      if (!trip || p.coords.accuracy > 300) return
      const proj = kmFromGps(trip.path, p.coords.latitude, p.coords.longitude)
      if (proj.offsetM > 500) return
      state.gps = { km: proj.km, at: Date.now() }
    },
    () => toast({ icon: '📡', title: '位置情報を取得できませんでした', body: '時刻表から位置を推定します' }),
    { enableHighAccuracy: true, maximumAge: 10_000 },
  )
}

// ---- デモ再生 ----------------------------------------------------------------

function toggleDemo() {
  const trip = state.trip
  const btn = byId('demo-btn')
  if (clock.demo) {
    clock.stopDemo()
    btn.textContent = `▶ デモ再生 ×${DEMO_SPEED}`
    btn.setAttribute('aria-pressed', 'false')
  } else if (trip) {
    clock.startDemo(trip.departure - 0.5, DEMO_SPEED)
    btn.textContent = '■ リアルタイムに戻す'
    btn.setAttribute('aria-pressed', 'true')
  }
  state.lastT = null
  tick()
  void pollLive()
}

// ---- お気に入り ----------------------------------------------------------------

function authHeaders() {
  const t = token()
  return t ? { token: t } : {}
}

async function loadFavorites() {
  if (!isLoggedIn()) return
  const res = await api('/v1/me/favorites', authHeaders())
  state.favorites = new Map(res.favorites.map((/** @type {Favorite} */ f) => [f.spotId, f]))
  state.favoritesLoaded = true
  renderFavorites()
}

/** @param {SpotOnRoute} s */
async function saveFavorite(s) {
  if (!isLoggedIn()) {
    login()
    return
  }
  const trip = state.trip
  // スポットに一番近い駅を「どのあたりで見つけたか」として残す
  const near = trip?.path.reduce((best, p) => (Math.abs(p.km - s.km) < Math.abs(best.km - s.km) ? p : best), trip.path[0])
  try {
    const res = await api(`/v1/me/favorites/${s.spot.id}`, {
      method: 'PUT',
      body: { tripId: trip?.id, tripLabel: trip ? tripLabel(trip) : undefined, nearStation: near?.name },
      ...authHeaders(),
    })
    state.favorites.set(s.spot.id, res.favorite)
    renderFavorites()
    if (state.trip) renderGuide(positionAt(state.trip.path, effectiveTime()))
    toast({ icon: '♥', title: `${s.spot.name} を保存しました`, body: '「お気に入り」タブで見返せます' })
  } catch (err) {
    showError(err)
  }
}

/** @param {string} spotId */
async function removeFavorite(spotId) {
  try {
    await api(`/v1/me/favorites/${spotId}`, { method: 'DELETE', ...authHeaders() })
    state.favorites.delete(spotId)
    renderFavorites()
    if (state.trip) renderGuide(positionAt(state.trip.path, effectiveTime()))
  } catch (err) {
    showError(err)
  }
}

/** @param {SpotOnRoute} s */
function heartButton(s) {
  const saved = state.favorites.has(s.spot.id)
  return el('button', {
    class: saved ? 'heart saved' : 'heart',
    text: saved ? '♥' : '♡',
    attrs: { type: 'button', 'aria-label': saved ? `${s.spot.name} をお気に入りから外す` : `${s.spot.name} をお気に入りに保存`, 'aria-pressed': String(saved) },
    on: { click: () => void (saved ? removeFavorite(s.spot.id) : saveFavorite(s)) },
  })
}

function renderFavorites() {
  byId('fav-count').textContent = state.favorites.size ? String(state.favorites.size) : ''
  const list = byId('fav-list')
  const gate = byId('favs-login')
  if (!isLoggedIn()) {
    replaceChildren(gate, [
      el('p', { text: 'お気に入りを保存・見返すには LINE でログインしてください。' }),
      el('button', { class: 'primary', text: 'LINE でログイン', attrs: { type: 'button' }, on: { click: () => login() } }),
    ])
    gate.hidden = false
    replaceChildren(list, [])
    return
  }
  gate.hidden = true
  const favs = [...state.favorites.values()].sort((a, b) => b.savedAt - a.savedAt)
  if (favs.length === 0) {
    replaceChildren(list, [
      el('li', { class: 'empty' }, [
        el('strong', { text: 'まだありません' }),
        el('span', { text: '乗車中の通知や車窓ガイドの ♡ で保存できます' }),
      ]),
    ])
    return
  }
  replaceChildren(
    list,
    favs.map((f) =>
      el('li', { class: 'fav' }, [
        el('span', { class: 'spot-icon', text: catIcon(f.category) }),
        el('div', { class: 'spot-body' }, [
          el('strong', { text: f.name }),
          el('span', { class: 'spot-meta', text: `${catName(f.category)}${f.nearStation ? `・${f.nearStation}付近` : ''}` }),
          el('span', { class: 'spot-meta', text: `${formatTime(f.savedAt)} 保存${f.tripLabel ? `（${f.tripLabel}）` : ''}` }),
          el('div', { class: 'fav-actions' }, [
            el('a', {
              class: 'link',
              text: '地図で見る',
              attrs: { href: `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lon}`, target: '_blank', rel: 'noopener' },
            }),
            el('button', { class: 'link danger', text: '削除', attrs: { type: 'button' }, on: { click: () => void removeFavorite(f.spotId) } }),
          ]),
        ]),
      ]),
    ),
  )
}

// ---- タブ ----------------------------------------------------------------------

/** @param {'ride' | 'favs'} tab */
function showTab(tab) {
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === tab))
  byId('view-ride').hidden = tab !== 'ride'
  byId('view-favs').hidden = tab !== 'favs'
  if (tab === 'favs' && !state.favoritesLoaded) void loadFavorites().catch(showError)
}

// ---- 起動 ----------------------------------------------------------------------

async function main() {
  for (const b of document.querySelectorAll('[data-tab]')) {
    b.addEventListener('click', () => showTab(/** @type {'ride'|'favs'} */ (b.getAttribute('data-tab'))))
  }
  byId('trip-select').addEventListener('change', (e) => void selectTrip(/** @type {HTMLSelectElement} */ (e.target).value).catch(showError))
  byId('demo-btn').addEventListener('click', toggleDemo)
  byId('demo-btn').textContent = `▶ デモ再生 ×${DEMO_SPEED}`
  byId('gps-toggle').addEventListener('change', (e) => setGps(/** @type {HTMLInputElement} */ (e.target).checked))

  const config = await api('/v1/config')
  byId('attr-odpt').textContent = config.attribution.odpt
  byId('attr-osm').textContent = config.attribution.osm
  await initAuth(config)
  byId('user').textContent = userLabel() ?? ''

  const spots = await api('/v1/spots')
  state.spots = spots.spots
  // ?trip=Weekday-7003&demo=12 で、その便の発車 12 分後からデモ再生する（紹介用のリンク）
  const params = new URLSearchParams(location.search)
  const linkTrip = params.get('trip')
  if (linkTrip) state.calendar = linkTrip.split('-')[0] ?? state.calendar
  renderCalendarChips()
  await selectCalendar(state.calendar)
  if (linkTrip && state.trips.some((t) => t.id === linkTrip)) {
    ;/** @type {HTMLSelectElement} */ (byId('trip-select')).value = linkTrip
    await selectTrip(linkTrip)
  }
  if (params.has('demo') && state.trip) {
    toggleDemo()
    clock.startDemo(state.trip.departure + (Number(params.get('demo')) || 0) - 0.5, DEMO_SPEED)
    state.lastT = null
    tick()
  }
  renderFavorites()
  if (isLoggedIn()) void loadFavorites().catch(() => {})

  setInterval(tick, 1000)
  setInterval(() => void pollLive(), LIVE_POLL_MS)
}

main().catch(showError)
