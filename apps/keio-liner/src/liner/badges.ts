import type { Stats } from '../schemas'
import type { Trip } from './data'

/**
 * バッジ。乗車を記録したときにサーバで判定し、取った時刻を Stats に残す（一度取ったら消えない）。
 * 判定に使うのは累計（stats）と、いま記録した便（trip）だけ。画面から来た数字は使わない。
 */

export interface BadgeDef {
  id: string
  label: string
  description: string
  icon: string
  test: (stats: Stats, trip: Trip) => boolean
}

/** 京王ライナーの方面（新宿の反対側の端） */
export const BRANCHES = ['京王八王子', '橋本', '高尾山口'] as const

export const BADGES: BadgeDef[] = [
  { id: 'first', label: 'はじめての乗車', description: '乗車を初めて記録した', icon: '🎫', test: (s) => s.rides >= 1 },
  { id: 'rides10', label: '常連さん', description: '10 回乗車した', icon: '🪑', test: (s) => s.rides >= 10 },
  { id: 'rides50', label: 'ライナー通勤', description: '50 回乗車した', icon: '🏅', test: (s) => s.rides >= 50 },
  { id: 'ot10', label: '抜き去り 10', description: '累計 10 本を追い抜いた', icon: '💨', test: (s) => s.overtakes >= 10 },
  { id: 'ot100', label: '抜き去り 100', description: '累計 100 本を追い抜いた', icon: '🚀', test: (s) => s.overtakes >= 100 },
  { id: 'ps100', label: 'すれ違い 100', description: '累計 100 本とすれ違った', icon: '🔁', test: (s) => s.passings >= 100 },
  { id: 'ps1000', label: 'すれ違い 1000', description: '累計 1000 本とすれ違った', icon: '🌀', test: (s) => s.passings >= 1000 },
  { id: 'spots50', label: '車窓ハンター', description: '見どころを 50 か所通り過ぎた', icon: '🔭', test: (s) => s.spotsSeen >= 50 },
  {
    id: 'allBranches',
    label: '全方面制覇',
    description: '京王八王子・橋本・高尾山口の 3 方面に乗った',
    icon: '🗺️',
    test: (s) => BRANCHES.every((b) => s.branches.includes(b)),
  },
  { id: 'morning', label: '朝ライナー', description: '新宿行きの京王ライナーに乗った', icon: '🌅', test: (_s, t) => t.direction === 'Inbound' },
  {
    id: 'mtTakao',
    label: 'Mt.TAKAO',
    description: '高尾山口発着の京王ライナーに乗った',
    icon: '⛰️',
    test: (_s, t) => t.origin === '高尾山口' || t.destination === '高尾山口',
  },
  { id: 'lateNight', label: '終電前ライナー', description: '23 時以降に発車する便に乗った', icon: '🌙', test: (_s, t) => t.departure >= 23 * 60 },
  {
    id: 'beatLimited',
    label: '特急を抜いた',
    description: '特急を追い抜く便に乗った',
    icon: '⚡',
    test: (_s, t) => t.overtakes.some((o) => o.trainType === '特急'),
  },
]

/** 画面に返す形（判定関数は返さない） */
export function badgeList(stats: Stats | undefined) {
  return BADGES.map(({ id, label, description, icon }) => {
    const earnedAt = stats?.badges[id]
    return { id, label, description, icon, earned: earnedAt !== undefined, ...(earnedAt !== undefined ? { earnedAt } : {}) }
  })
}
