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

/** 乗車の記録。画面から送るのは「どの便に、どの日に乗ったか」と見たスポットの数だけ */
export const recordRideSchema = z.object({
  tripId: z.string().min(1).max(60),
  /** 運行日（深夜 0〜4 時は前日）。YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date は YYYY-MM-DD'),
  /** 乗車中に通り過ぎた見どころの数（地下区間を除く）。上限で丸める */
  spotsSeen: z.number().int().min(0).max(300),
})
export type RecordRideInput = z.infer<typeof recordRideSchema>

export interface RideLog {
  tripId: string
  date: string
  label: string
  overtakes: number
  passings: number
  spotsSeen: number
  recordedAt: number
}

/**
 * ユーザーごとの累計。1 ユーザー = 1 アイテム（E4: アクセス数を増やさない）。
 * 集計は書き込み時に済ませておく（データストアに集計機能が無いため）
 */
export interface Stats {
  userId: string
  kind: 'summary'
  rides: number
  overtakes: number
  passings: number
  spotsSeen: number
  /** 追い抜いた列車の種別ごとの本数 */
  overtakenTypes: Record<string, number>
  /** 乗った方面（京王八王子・橋本・高尾山口） */
  branches: string[]
  /** バッジ ID → 取った時刻（ミリ秒） */
  badges: Record<string, number>
  /** 直近の乗車（新しい順、最大 RECENT_LIMIT 件） */
  recent: RideLog[]
  firstRideAt: number
  lastRideAt: number
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
