import type { RideLog, Stats, UserId } from '../schemas'
import { BADGES, BRANCHES } from './badges'
import type { Trip } from './data'

/**
 * 乗車を累計に足す（純関数。データストアに触らない）。
 * 追い抜き・すれ違いの本数は便データから数える。画面から来た数字は見どころの数だけで、上限で丸める。
 */

export const RECENT_LIMIT = 20

export function emptyStats(userId: UserId, now: number): Stats & { userId: UserId } {
  return {
    userId,
    kind: 'summary',
    rides: 0,
    overtakes: 0,
    passings: 0,
    spotsSeen: 0,
    overtakenTypes: {},
    branches: [],
    badges: {},
    recent: [],
    firstRideAt: now,
    lastRideAt: now,
  }
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`

export function tripLabel(t: Trip): string {
  return `${hhmm(t.departure)} ${t.origin}→${t.destination}`
}

export interface ApplyResult {
  stats: Stats & { userId: UserId }
  /** 同じ日の同じ便がすでに記録済み（何も変えていない） */
  duplicate: boolean
  newBadges: string[]
}

export function applyRide(
  prev: (Stats & { userId: UserId }) | undefined,
  userId: UserId,
  trip: Trip,
  date: string,
  spotsSeen: number,
  now: number,
): ApplyResult {
  const base = prev ?? emptyStats(userId, now)
  if (base.recent.some((r) => r.tripId === trip.id && r.date === date)) {
    return { stats: base, duplicate: true, newBadges: [] }
  }

  const overtakenTypes = { ...base.overtakenTypes }
  for (const o of trip.overtakes) overtakenTypes[o.trainType] = (overtakenTypes[o.trainType] ?? 0) + 1
  const branches = [...new Set([...base.branches, ...BRANCHES.filter((b) => b === trip.origin || b === trip.destination)])]
  const log: RideLog = {
    tripId: trip.id,
    date,
    label: tripLabel(trip),
    overtakes: trip.overtakes.length,
    passings: trip.passings.length,
    spotsSeen,
    recordedAt: now,
  }

  const stats: Stats & { userId: UserId } = {
    ...base,
    userId,
    rides: base.rides + 1,
    overtakes: base.overtakes + trip.overtakes.length,
    passings: base.passings + trip.passings.length,
    spotsSeen: base.spotsSeen + spotsSeen,
    overtakenTypes,
    branches,
    badges: { ...base.badges },
    recent: [log, ...base.recent].slice(0, RECENT_LIMIT),
    lastRideAt: now,
  }

  const newBadges: string[] = []
  for (const b of BADGES) {
    if (stats.badges[b.id] === undefined && b.test(stats, trip)) {
      stats.badges[b.id] = now
      newBadges.push(b.id)
    }
  }
  return { stats, duplicate: false, newBadges }
}

/** 日本時間の運行日（深夜 0〜4 時は前日）。YYYY-MM-DD */
export function serviceDate(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 3600_000)
  if (jst.getUTCHours() < 4) jst.setUTCDate(jst.getUTCDate() - 1)
  return jst.toISOString().slice(0, 10)
}
