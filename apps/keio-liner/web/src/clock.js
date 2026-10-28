// @ts-check
/**
 * 「いま」の時刻（0 時からの分）。乗車中は本物の時計、デモ再生では早送りの時計を使う。
 *
 * 京王ライナーは夕方以降と朝しか走らないので、昼間に動きを見せるにはデモ再生が要る。
 */

/** 始発前（4 時前）は前日の続きとして 24 時以降で表す（便データと同じ） @param {Date} d */
export function minutesOf(d) {
  const h = d.getHours()
  return (h < 4 ? h + 24 : h) * 60 + d.getMinutes() + d.getSeconds() / 60
}

/** @param {number} m @returns {string} */
export function hhmm(m) {
  const total = Math.round(m)
  const h = Math.floor(total / 60) % 24
  return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function createClock() {
  /** @type {{ startReal: number, startMin: number, speed: number } | null} */
  let demo = null
  return {
    /** @returns {number} */
    now() {
      if (!demo) return minutesOf(new Date())
      return demo.startMin + ((Date.now() - demo.startReal) / 60000) * demo.speed
    },
    /** @param {number} startMin @param {number} speed */
    startDemo(startMin, speed) {
      demo = { startReal: Date.now(), startMin, speed }
    },
    stopDemo() {
      demo = null
    },
    get demo() {
      return demo !== null
    },
    get speed() {
      return demo?.speed ?? 1
    },
  }
}

// ---- 曜日区分 ----------------------------------------------------------------
// 時刻表は「平日」「土休日」で分かれている。祝日は内閣府の公表分を持つ（年に 1 回足す）
const HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29', '2026-05-03', '2026-05-04',
  '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12',
  '2026-11-03', '2026-11-23',
  // 2027
  '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22', '2027-04-29', '2027-05-03',
  '2027-05-04', '2027-05-05', '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23', '2027-10-11', '2027-11-03',
  '2027-11-23',
])

/** @param {Date} d @returns {'Weekday' | 'SaturdayHoliday'} */
export function calendarOf(d) {
  // 深夜 0〜4 時は前日のダイヤ
  const base = new Date(d)
  if (base.getHours() < 4) base.setDate(base.getDate() - 1)
  const key = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
  const dow = base.getDay()
  return dow === 0 || dow === 6 || HOLIDAYS.has(key) ? 'SaturdayHoliday' : 'Weekday'
}
