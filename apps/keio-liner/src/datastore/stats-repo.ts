import type { Stats, UserId } from '../schemas'
import { getDataStoreClient } from './client'
import { runGet, runOp } from './run'
import { resolveTableId } from './tables'

/**
 * 乗車記録の累計。メインキー userId + サブキー kind（'summary' 固定）で 1 ユーザー 1 アイテム。
 * 記録は get + put の 2 アクセス、表示は get の 1 アクセス。
 */

const TABLE = 'stats' as const
const KIND = 'summary' as const

export async function getStats(userId: UserId): Promise<Stats | undefined> {
  const client = getDataStoreClient()
  // 初回は必ず無い。"Not found" は正常系（pitfalls 6）
  const res = await runGet(() => client.getItem({ tableId: resolveTableId(TABLE), key: { userId, kind: KIND } }))
  return res?.params?.Item as Stats | undefined
}

export async function putStats(stats: Stats & { userId: UserId }): Promise<void> {
  const client = getDataStoreClient()
  await runOp('putItem', () => client.putItem({ tableId: resolveTableId(TABLE), item: { ...stats, kind: KIND } }))
}
