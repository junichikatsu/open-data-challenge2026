import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { MemoryDataStoreClient, setDataStoreClient, setTableIdResolver } from '../src/datastore'
import { setLinerData } from '../src/liner/data'
import { serviceDate } from '../src/liner/rides'
import { linerFixture } from './fixtures'

/**
 * 乗車記録の通し確認。データストアだけを fake に差し替える。
 */

const app = createApp()
let store: MemoryDataStoreClient

beforeEach(() => {
  store = new MemoryDataStoreClient()
  setDataStoreClient(store, 'memory')
  setTableIdResolver((name) => name)
  setLinerData(linerFixture)
})

afterEach(() => {
  setDataStoreClient(undefined)
  setTableIdResolver(undefined)
  setLinerData(undefined)
})

const alice = { authorization: 'Bearer mock:alice', 'content-type': 'application/json' }
const bob = { authorization: 'Bearer mock:bob01' }
const today = serviceDate(new Date())

type Body = {
  duplicate: boolean
  stats: { rides: number; overtakes: number; passings: number; spotsSeen: number; branches: string[]; recent: unknown[] }
  newBadges: { id: string }[]
  badges: { id: string; earned: boolean }[]
}

const ride = (body: Record<string, unknown>, headers: Record<string, string> = alice) =>
  app.request('/keio-liner/v1/me/rides', { method: 'POST', headers, body: JSON.stringify(body) })

describe('乗車記録', () => {
  it('本数は便データから数え、初回はバッジ「はじめての乗車」が付く。get + put の 2 アクセス', async () => {
    // 画面が大きな数を送っても、追い抜き・すれ違いは便データ（追い抜き 1・すれ違い 2）から数える
    const res = await ride({ tripId: 'Weekday-7003', date: today, spotsSeen: 7, overtakes: 999 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Body
    expect(body.stats).toMatchObject({ rides: 1, overtakes: 1, passings: 2, spotsSeen: 7, branches: ['京王八王子'] })
    expect(body.newBadges.map((b) => b.id)).toContain('first')
    expect(store.calls.getItem + store.calls.putItem).toBe(2)
  })

  it('同じ日の同じ便は二重に数えない', async () => {
    await ride({ tripId: 'Weekday-7003', date: today, spotsSeen: 3 })
    const again = (await (await ride({ tripId: 'Weekday-7003', date: today, spotsSeen: 3 })).json()) as Body
    expect(again.duplicate).toBe(true)
    expect(again.stats.rides).toBe(1)
    expect(store.dump('stats')).toHaveLength(1)
  })

  it('統計は本人のものだけ。未記録なら stats: null とバッジ一覧（未取得）', async () => {
    await ride({ tripId: 'Weekday-7003', date: today, spotsSeen: 0 })
    const res = await app.request('/keio-liner/v1/me/stats', { headers: bob })
    const body = (await res.json()) as { stats: unknown; badges: { earned: boolean }[] }
    expect(body.stats).toBeNull()
    expect(body.badges.length).toBeGreaterThan(5)
    expect(body.badges.every((b) => !b.earned)).toBe(true)
  })

  it('過去の日付・知らない便・不正な値は弾く', async () => {
    expect((await ride({ tripId: 'Weekday-7003', date: '2020-01-01', spotsSeen: 0 })).status).toBe(400)
    expect((await ride({ tripId: 'Weekday-9999', date: today, spotsSeen: 0 })).status).toBe(404)
    expect((await ride({ tripId: 'Weekday-7003', date: today, spotsSeen: 10000 })).status).toBe(400)
    expect((await app.request('/keio-liner/v1/me/rides', { method: 'POST', body: '{}' })).status).toBe(401)
  })
})

describe('運行日', () => {
  it('深夜 0〜4 時は前日として扱う（日本時間）', () => {
    expect(serviceDate(new Date('2026-10-29T15:30:00Z'))).toBe('2026-10-29') // JST 10/30 0:30
    expect(serviceDate(new Date('2026-10-29T19:30:00Z'))).toBe('2026-10-30') // JST 10/30 4:30
  })
})
