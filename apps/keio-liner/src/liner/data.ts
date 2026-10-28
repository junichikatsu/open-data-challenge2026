import { AppError } from '../errors'

/**
 * 京王ライナーの便データ。scripts/build-liner-data.mjs が ODPT から作る（data/generated/liner.json）。
 * - ZIP では build.mjs が __LINER_DATA__ として埋め込む
 * - ローカル・テストは setLinerData で差し込む（node:fs はここに持ち込まない）
 *
 * チャレンジ提供データ由来なので、リポジトリにもレスポンスのキャッシュにも生データを残さない。
 */

/** 時刻は 0 時からの分（始発前の深夜は 24 時以降として表す）。est は停車駅の時刻から推定した通過時刻 */
export interface PathPoint {
  station: string
  name: string
  lat: number
  lon: number
  arr?: number
  dep?: number
  stop: boolean
  est: boolean
  km: number
}

export interface Overtake {
  station: string
  t: number
  trainType: string
  trainNumber: string
  destination: string
}

export interface Trip {
  id: string
  calendar: string
  trainNumber: string
  direction: 'Inbound' | 'Outbound'
  origin: string
  destination: string
  departure: number
  arrival: number
  path: PathPoint[]
  overtakes: Overtake[]
}

export interface LinerData {
  generatedAt: string
  source: string
  trips: Trip[]
  lines: Record<string, [number, number][]>
}

let override: LinerData | undefined

export function setLinerData(data: LinerData | undefined): void {
  override = data
}

export function getLinerData(): LinerData {
  if (override) return override
  if (typeof __LINER_DATA__ !== 'undefined') return __LINER_DATA__ as LinerData
  // 白画面にせず理由を返す。ビルド前に scripts/build-liner-data.mjs を実行していない
  throw new AppError('INTERNAL', 503, 'LINER_DATA_NOT_BUILT')
}

export type TripSummary = Omit<Trip, 'path' | 'overtakes'> & { overtakeCount: number }

export function summarize(t: Trip): TripSummary {
  const { path: _path, overtakes, ...rest } = t
  return { ...rest, overtakeCount: overtakes.length }
}

/** ODPT の駅 ID → 駅名（列車ロケーションの fromStation / toStation を名前にする） */
export function stationNames(): Map<string, string> {
  const m = new Map<string, string>()
  for (const t of getLinerData().trips) for (const p of t.path) m.set(p.station, p.name)
  return m
}
