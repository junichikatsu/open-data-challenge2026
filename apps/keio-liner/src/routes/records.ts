import { Hono } from 'hono'
import { getStats, putStats } from '../datastore'
import { badRequest, notFound } from '../errors'
import { badgeList, BADGES } from '../liner/badges'
import { getLinerData } from '../liner/data'
import { applyRide, serviceDate } from '../liner/rides'
import type { AuthEnv } from '../middleware/auth'
import { recordRideSchema } from '../schemas'
import type { Stats, UserId } from '../schemas'

/**
 * 乗車記録とバッジ（ログイン必須。認証は routes/index.ts で /v1/me/* に掛けている）。
 *
 *   GET  /v1/me/stats   累計・バッジ・直近の乗車
 *   POST /v1/me/rides   乗車を 1 回記録する（同じ日の同じ便は二重に数えない）
 */
export function recordRoutes(): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>()

  r.get('/stats', async (c) => {
    const stats = await getStats(c.get('userId'))
    return c.json({ stats: stats ?? null, badges: badgeList(stats) })
  })

  r.post('/rides', async (c) => {
    const input = recordRideSchema.parse(await c.req.json())
    const trip = getLinerData().trips.find((t) => t.id === input.tripId)
    if (!trip) throw notFound('trip')
    // 記録できるのは今日か昨日の運行日だけ（過去の便をまとめて足して数を稼げないように）
    const now = new Date()
    const today = serviceDate(now)
    const yesterday = serviceDate(new Date(now.getTime() - 24 * 3600_000))
    if (input.date !== today && input.date !== yesterday) throw badRequest('記録できるのは今日か昨日の乗車だけです')

    const userId = c.get('userId')
    const prev = (await getStats(userId)) as (Stats & { userId: UserId }) | undefined
    const result = applyRide(prev, userId, trip, input.date, input.spotsSeen, now.getTime())
    if (!result.duplicate) await putStats(result.stats)

    const labels = new Map(BADGES.map((b) => [b.id, b]))
    return c.json({
      duplicate: result.duplicate,
      stats: result.stats,
      newBadges: result.newBadges.map((id) => {
        const b = labels.get(id)!
        return { id, label: b.label, description: b.description, icon: b.icon }
      }),
      badges: badgeList(result.stats),
    })
  })

  return r
}
