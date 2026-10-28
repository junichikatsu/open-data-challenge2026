import { Hono } from 'hono'
import { readConfig } from '../config'
import { badRequest, notFound } from '../errors'
import { getLinerData, summarize } from '../liner/data'
import { liveStatus } from '../liner/live'
import { allSpots } from '../liner/spots'

/**
 * 乗車中の画面が使う読み取り専用 API（ログイン不要）。
 *
 *   GET /v1/config              画面の初期設定（ログイン方式・LIFF ID・出典）
 *   GET /v1/trips?calendar=     その曜日区分の便の一覧
 *   GET /v1/trips/:id           1 便の詳細（駅ごとの時刻・追い抜き）
 *   GET /v1/spots               沿線スポット
 *   GET /v1/live/:trainNumber   列車ロケーション（遅れ・いまの駅間）
 */
export function linerRoutes(): Hono {
  const r = new Hono()

  r.get('/config', (c) => {
    const cfg = readConfig()
    const liner = getLinerData()
    return c.json({
      authMode: cfg.mockMode ? 'mock' : 'liff',
      liffId: cfg.mockMode ? null : (cfg.liffId ?? null),
      attribution: {
        odpt: liner.source,
        osm: allSpots().attribution,
      },
      dataGeneratedAt: liner.generatedAt,
    })
  })

  r.get('/trips', (c) => {
    const calendar = c.req.query('calendar')
    const trips = getLinerData().trips.filter((t) => !calendar || t.calendar === calendar)
    return c.json({ trips: trips.map(summarize) })
  })

  r.get('/trips/:id', (c) => {
    const trip = getLinerData().trips.find((t) => t.id === c.req.param('id'))
    if (!trip) throw notFound('trip')
    return c.json({ trip })
  })

  r.get('/spots', (c) => {
    const { spots, attribution } = allSpots()
    // スポットは変わらないので、前段キャッシュに任せてよい（JSON は拡張子が無いので上書きされない）
    c.header('cache-control', 'public, max-age=3600')
    return c.json({ spots, attribution })
  })

  r.get('/live/:trainNumber', async (c) => {
    const n = c.req.param('trainNumber')
    if (!/^\d{3,5}$/.test(n)) throw badRequest('trainNumber は数字')
    c.header('cache-control', 'no-store')
    return c.json(await liveStatus(n))
  })

  return r
}
