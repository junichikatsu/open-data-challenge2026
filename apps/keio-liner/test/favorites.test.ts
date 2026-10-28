import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { setLineFetcher } from '../src/auth/line'
import { MemoryDataStoreClient, runGet, setDataStoreClient, setTableIdResolver } from '../src/datastore'
import { allSpots } from '../src/liner/spots'

/**
 * お気に入りの通し確認。データストアだけを fake に差し替え、それ以外は本物を通す。
 */

const app = createApp()
let store: MemoryDataStoreClient
const spot = allSpots().spots[0]!
const spot2 = allSpots().spots[1]!

beforeEach(() => {
  store = new MemoryDataStoreClient()
  setDataStoreClient(store, 'memory')
  setTableIdResolver((name) => name)
})

afterEach(() => {
  setDataStoreClient(undefined)
  setTableIdResolver(undefined)
  setLineFetcher(undefined)
  delete process.env['MOCK_MODE']
  delete process.env['LINE_CHANNEL_ID']
})

const alice = { authorization: 'Bearer mock:alice' }
const bob = { authorization: 'Bearer mock:bob01' }
const json = { 'content-type': 'application/json' }

describe('お気に入り', () => {
  it('保存 → 一覧（新しい順）→ 削除。名前と位置はサーバのスポット一覧から入る', async () => {
    const saved = await app.request(`/keio-liner/v1/me/favorites/${spot.id}`, {
      method: 'PUT',
      headers: { ...alice, ...json },
      body: JSON.stringify({ tripId: 'Weekday-7003', nearStation: '明大前', name: '改ざん' }),
    })
    expect(saved.status).toBe(200)
    await app.request(`/keio-liner/v1/me/favorites/${spot2.id}`, { method: 'PUT', headers: alice })

    const listed = await app.request('/keio-liner/v1/me/favorites', { headers: alice })
    const { favorites } = (await listed.json()) as { favorites: { spotId: string; name: string; nearStation?: string }[] }
    expect(favorites.map((f) => f.spotId)).toEqual(expect.arrayContaining([spot.id, spot2.id]))
    const first = favorites.find((f) => f.spotId === spot.id)!
    expect(first.name).toBe(spot.name)
    expect(first.nearStation).toBe('明大前')

    const deleted = await app.request(`/keio-liner/v1/me/favorites/${spot.id}`, { method: 'DELETE', headers: alice })
    expect(deleted.status).toBe(204)
    expect(store.dump('favorites')).toHaveLength(1)
  })

  it('同じスポットを 2 回保存しても 1 件', async () => {
    for (let i = 0; i < 2; i++) await app.request(`/keio-liner/v1/me/favorites/${spot.id}`, { method: 'PUT', headers: alice })
    expect(store.dump('favorites')).toHaveLength(1)
  })

  it('他人のお気に入りは見えない（メインキーが一致しないため 0 件）', async () => {
    await app.request(`/keio-liner/v1/me/favorites/${spot.id}`, { method: 'PUT', headers: alice })
    const listed = await app.request('/keio-liner/v1/me/favorites', { headers: bob })
    expect(((await listed.json()) as { favorites: unknown[] }).favorites).toHaveLength(0)
  })

  it('ログインなしは 401、知らないスポットは 404、形式違いは 400', async () => {
    expect((await app.request('/keio-liner/v1/me/favorites')).status).toBe(401)
    expect((await app.request('/keio-liner/v1/me/favorites/osm-n1', { method: 'PUT', headers: alice })).status).toBe(404)
    expect((await app.request('/keio-liner/v1/me/favorites/zzz', { method: 'PUT', headers: alice })).status).toBe(400)
  })
})

describe('LINE ログイン（MOCK_MODE=false）', () => {
  const lineUser = `U${'a'.repeat(32)}`

  beforeEach(() => {
    process.env['MOCK_MODE'] = 'false'
    process.env['LINE_CHANNEL_ID'] = '1234567890'
  })

  it('LINE が確認した sub をユーザー ID にする。チャネル ID を client_id として送る', async () => {
    let sent = ''
    setLineFetcher(async (_url, init) => {
      sent = String(init?.body)
      return Response.json({ sub: lineUser, exp: Math.floor(Date.now() / 1000) + 3600 })
    })
    const res = await app.request(`/keio-liner/v1/me/favorites/${spot.id}`, {
      method: 'PUT',
      headers: { authorization: 'Bearer real-id-token' },
    })
    expect(res.status).toBe(200)
    expect(sent).toContain('client_id=1234567890')
    expect(store.dump('favorites')[0]).toMatchObject({ userId: lineUser })
  })

  it('LINE が拒否したトークンは 401。仮ログインも通らない', async () => {
    setLineFetcher(async () => new Response('{"error":"invalid_request"}', { status: 400 }))
    expect((await app.request('/keio-liner/v1/me/favorites', { headers: { authorization: 'Bearer bad' } })).status).toBe(401)
    expect((await app.request('/keio-liner/v1/me/favorites', { headers: alice })).status).toBe(401)
  })
})

describe('getItem の "Not found"（pitfalls 6）', () => {
  it('正常系として undefined に落ちる（503 にしない）', async () => {
    const res = await runGet(() => store.getItem({ tableId: 'favorites', key: { userId: 'nobody', spotId: 'x' } }))
    expect(res).toBeUndefined()
  })
})
