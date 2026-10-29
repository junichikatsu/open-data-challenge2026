import { Hono } from 'hono'
import { readConfig } from '../config'
import { deleteFavorite, getFavorite, listFavorites, putFavorite } from '../datastore'
import { notFound } from '../errors'
import { findSpot } from '../liner/spots'
import type { AuthEnv } from '../middleware/auth'
import { saveFavoriteSchema, spotIdSchema } from '../schemas'
import type { Favorite, UserId } from '../schemas'

/**
 * 自分のお気に入りスポット（ログイン必須。認証は routes/index.ts で /v1/me/* に掛けている）。
 *
 *   GET    /v1/me/favorites           一覧（保存した新しい順）
 *   PUT    /v1/me/favorites/:spotId   保存（同じスポットは上書き）
 *   DELETE /v1/me/favorites/:spotId   削除
 *
 * スポットの名前・位置は画面から受け取らず、サーバが持っている一覧から引く（改ざんされない）。
 */
export function favoriteRoutes(): Hono<AuthEnv> {
  const r = new Hono<AuthEnv>()

  r.get('/', async (c) => {
    const favorites = await listFavorites(c.get('userId'), readConfig().favoriteListLimit)
    return c.json({ favorites })
  })

  r.put('/:spotId', async (c) => {
    const spotId = spotIdSchema.parse(c.req.param('spotId'))
    const spot = findSpot(spotId)
    if (!spot) throw notFound('spot')
    const input = saveFavoriteSchema.parse(await c.req.json().catch(() => ({})))
    const fav: Favorite & { userId: UserId } = {
      userId: c.get('userId'),
      spotId,
      name: spot.name,
      category: spot.category,
      lat: spot.lat,
      lon: spot.lon,
      savedAt: Date.now(),
    }
    // exactOptionalPropertyTypes のため、値があるものだけ載せる
    if (input.tripId) fav.tripId = input.tripId
    if (input.tripLabel) fav.tripLabel = input.tripLabel
    if (input.nearStation) fav.nearStation = input.nearStation
    if (input.note) fav.note = input.note
    await putFavorite(fav)
    return c.json({ favorite: fav })
  })

  r.delete('/:spotId', async (c) => {
    const spotId = spotIdSchema.parse(c.req.param('spotId'))
    const userId = c.get('userId')
    if (!(await getFavorite(userId, spotId))) throw notFound('favorite')
    await deleteFavorite(userId, spotId)
    return c.body(null, 204)
  })

  return r
}
