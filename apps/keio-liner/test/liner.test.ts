import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { setLinerData } from '../src/liner/data'
import { clearLiveCache, setLiveFetcher } from '../src/liner/live'
import { linerFixture } from './fixtures'

const app = createApp()

beforeEach(() => {
  setLinerData(linerFixture)
})

afterEach(() => {
  setLinerData(undefined)
  setLiveFetcher(undefined)
  clearLiveCache()
  delete process.env['MOCK_MODE']
  delete process.env['ODPT_CHALLENGE_TOKEN']
})

describe('便データ', () => {
  it('曜日区分で絞った一覧に、経路を含めず追い抜きの本数だけ返す', async () => {
    const res = await app.request('/keio-liner/v1/trips?calendar=Weekday')
    expect(res.status).toBe(200)
    const { trips } = (await res.json()) as { trips: Record<string, unknown>[] }
    expect(trips).toHaveLength(1)
    expect(trips[0]).toMatchObject({ id: 'Weekday-7003', overtakeCount: 1 })
    expect(trips[0]).not.toHaveProperty('path')
  })

  it('1 便の詳細と、無い便は 404', async () => {
    const ok = await app.request('/keio-liner/v1/trips/Weekday-7003')
    expect(((await ok.json()) as { trip: { overtakes: unknown[] } }).trip.overtakes).toHaveLength(1)
    expect((await app.request('/keio-liner/v1/trips/Weekday-9999')).status).toBe(404)
  })

  it('便データが無ければ 503 LINER_DATA_NOT_BUILT（白画面にしない）', async () => {
    setLinerData(undefined)
    const res = await app.request('/keio-liner/v1/trips')
    expect(res.status).toBe(503)
  })

  it('スポットには OSM の出典が付く', async () => {
    const res = await app.request('/keio-liner/v1/spots')
    const body = (await res.json()) as { spots: unknown[]; attribution: string }
    expect(body.spots.length).toBeGreaterThan(0)
    expect(body.attribution).toContain('OpenStreetMap')
  })

  it('MOCK_MODE では仮ログインで、LIFF ID を渡さない', async () => {
    const res = await app.request('/keio-liner/v1/config')
    expect(await res.json()).toMatchObject({ authMode: 'mock', liffId: null })
  })
})

describe('列車ロケーション', () => {
  it('MOCK_MODE では ODPT を呼ばない', async () => {
    let called = false
    setLiveFetcher(async () => {
      called = true
      return new Response('[]')
    })
    const res = await app.request('/keio-liner/v1/live/7003')
    expect(await res.json()).toEqual({ available: false, reason: 'mock' })
    expect(called).toBe(false)
  })

  it('遅れと駅間を駅名にして返し、トークンは画面に出さない', async () => {
    process.env['MOCK_MODE'] = 'false'
    process.env['ODPT_CHALLENGE_TOKEN'] = 'secret-token'
    let url = ''
    setLiveFetcher(async (input) => {
      url = decodeURIComponent(String(input))
      return Response.json([
        {
          'odpt:trainNumber': '7003',
          'odpt:delay': 120,
          'odpt:fromStation': 'odpt.Station:Keio.Keio.Meidaimae',
          'odpt:toStation': 'odpt.Station:Keio.Keio.Hachimanyama',
          'dc:date': '2026-10-28T18:07:00+09:00',
        },
      ])
    })
    const res = await app.request('/keio-liner/v1/live/7003')
    const text = await res.text()
    expect(url).toContain('acl:consumerKey=secret-token')
    expect(text).not.toContain('secret-token')
    expect(JSON.parse(text)).toMatchObject({ available: true, found: true, delaySec: 120, fromStation: '明大前', toStation: '八幡山' })
  })

  it('ODPT が落ちていても 200 で available: false', async () => {
    process.env['MOCK_MODE'] = 'false'
    process.env['ODPT_CHALLENGE_TOKEN'] = 'secret-token'
    setLiveFetcher(async () => new Response('err', { status: 500 }))
    const res = await app.request('/keio-liner/v1/live/7003')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: false, reason: 'upstream' })
  })
})
