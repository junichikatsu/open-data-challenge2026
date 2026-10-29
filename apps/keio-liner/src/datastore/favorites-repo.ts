import type { Favorite, UserId } from '../schemas'
import { getDataStoreClient } from './client'
import { queryAll } from './query'
import { runGet, runOp } from './run'
import { resolveTableId } from './tables'

/**
 * お気に入りスポット。メインキー userId + サブキー spotId。
 *
 *   - 生の string を受け取らない。UserId（ブランド型）だけを受け取る
 *   - 他人のお気に入りはメインキーが一致せず 0 件しか返らない
 *   - 同じスポットを 2 回保存すると上書き（1 スポット 1 件）
 *   - 一覧は query 1 回。並べ替え（保存した新しい順）は件数が小さいので取得後に行う
 */

const TABLE = 'favorites' as const

export async function putFavorite(fav: Favorite & { userId: UserId }): Promise<void> {
  const client = getDataStoreClient()
  await runOp('putItem', () => client.putItem({ tableId: resolveTableId(TABLE), item: fav }))
}

export async function getFavorite(userId: UserId, spotId: string): Promise<Favorite | undefined> {
  const client = getDataStoreClient()
  // "Not found" は正常系。runGet が undefined に落とす（pitfalls 6）
  const res = await runGet(() => client.getItem({ tableId: resolveTableId(TABLE), key: { userId, spotId } }))
  return res?.params?.Item as Favorite | undefined
}

/** 保存した新しい順 */
export async function listFavorites(userId: UserId, limit: number): Promise<Favorite[]> {
  const client = getDataStoreClient()
  const rows = await queryAll<Favorite>(client, {
    tableId: resolveTableId(TABLE),
    expression: '#userId = :userId',
    values: { userId },
    order: 'asc',
    pageSize: Math.min(limit, 100),
    maxPages: Math.ceil(limit / 100),
  })
  return rows.sort((a, b) => b.savedAt - a.savedAt).slice(0, limit)
}

export async function deleteFavorite(userId: UserId, spotId: string): Promise<void> {
  const client = getDataStoreClient()
  await runOp('deleteItem', () => client.deleteItem({ tableId: resolveTableId(TABLE), key: { userId, spotId } }))
}
