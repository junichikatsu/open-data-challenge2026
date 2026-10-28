import { z } from 'zod'

/**
 * API 契約。サーバの入力検証に使い、フロントの JSDoc からも参照できるよう 1 箇所にまとめる。
 */

/**
 * ユーザー ID。LINE の ID トークンの sub（U + 32 桁の 16 進）か、MOCK_MODE の仮ユーザー（mock-xxxx）。
 * メインキーの先頭に入る（constraints.md キー設計の原則）。parse でしか作れないブランド型
 */
export const userIdSchema = z
  .string()
  .regex(/^(U[0-9a-f]{32}|mock-[A-Za-z0-9_-]{4,40})$/, 'userId の形式が不正です')
  .brand<'UserId'>()
export type UserId = z.infer<typeof userIdSchema>

/** スポット ID（OSM 由来: osm-n123 / osm-w123 / osm-r123） */
export const spotIdSchema = z.string().regex(/^osm-[nwr]\d{1,15}$/, 'spotId の形式が不正です')

/** お気に入りに保存するときに画面から送る「そのときの状況」。スポットの中身はサーバが持っている */
export const saveFavoriteSchema = z.object({
  tripId: z.string().max(60).optional(),
  tripLabel: z.string().max(80).optional(),
  nearStation: z.string().max(40).optional(),
  note: z.string().trim().max(200).optional(),
})
export type SaveFavoriteInput = z.infer<typeof saveFavoriteSchema>

export interface Favorite {
  userId: string
  spotId: string
  name: string
  category: string
  lat: number
  lon: number
  /** 保存した時刻（ミリ秒） */
  savedAt: number
  tripId?: string
  tripLabel?: string
  nearStation?: string
  note?: string
}

export interface Health {
  status: 'ok'
  version: string
  commit: string
  builtAt: string
  mockMode: boolean
  basicAuth: boolean
  datastore: 'cloud' | 'memory'
  configOk: boolean
  configMissing: number
  limits: Record<string, number>
}
