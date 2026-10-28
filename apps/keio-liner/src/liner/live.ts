import { odptToken, readConfig } from '../config'
import { log } from '../log'
import { stationNames } from './data'

/**
 * 列車ロケーション（ODPT odpt:Train）。トークンは画面に渡さず、ここからだけ使う。
 *
 * 京王全線で 1 回 40KB 程度。乗車中の画面が数十秒おきに叩くので、関数のインスタンス内で
 * CACHE_MS だけ使い回す（ODPT 側の更新間隔もおおむね 30 秒）。
 */

const API = 'https://api-challenge.odpt.org/api/v4/odpt:Train'
const CACHE_MS = 20_000

interface OdptTrain {
  'odpt:trainNumber': string
  'odpt:delay'?: number
  'odpt:fromStation'?: string | null
  'odpt:toStation'?: string | null
  'dc:date'?: string
}

export type LiveStatus =
  | { available: false; reason: 'mock' | 'no-token' | 'upstream' }
  | {
      available: true
      found: false
      updatedAt: string
    }
  | {
      available: true
      found: true
      delaySec: number
      fromStation: string | null
      toStation: string | null
      updatedAt: string
    }

let cache: { at: number; trains: OdptTrain[] } | undefined

/** テスト用 */
export function clearLiveCache(): void {
  cache = undefined
}

type Fetcher = typeof fetch
let fetcher: Fetcher = (...args) => fetch(...args)

/** テスト用: ODPT への通信を差し替える */
export function setLiveFetcher(fn: Fetcher | undefined): void {
  fetcher = fn ?? ((...args) => fetch(...args))
}

async function loadTrains(token: string): Promise<OdptTrain[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.trains
  const qs = new URLSearchParams({ 'odpt:operator': 'odpt.Operator:Keio', 'acl:consumerKey': token })
  const res = await fetcher(`${API}?${qs}`)
  // URL にトークンが入るので、ログに URL を出さない
  if (!res.ok) throw new Error(`ODPT odpt:Train HTTP ${res.status}`)
  const trains = (await res.json()) as OdptTrain[]
  cache = { at: Date.now(), trains }
  return trains
}

export async function liveStatus(trainNumber: string): Promise<LiveStatus> {
  // MOCK_MODE の分岐は入口のここ 1 箇所だけ
  if (readConfig().mockMode) return { available: false, reason: 'mock' }
  const token = odptToken()
  if (!token) return { available: false, reason: 'no-token' }

  let trains: OdptTrain[]
  try {
    trains = await loadTrains(token)
  } catch (err) {
    log.warn('live fetch failed', { message: err instanceof Error ? err.message : String(err) })
    return { available: false, reason: 'upstream' }
  }
  const updatedAt = new Date(cache?.at ?? Date.now()).toISOString()
  const t = trains.find((x) => x['odpt:trainNumber'] === trainNumber)
  if (!t) return { available: true, found: false, updatedAt }

  const names = stationNames()
  const name = (id: string | null | undefined) => (id ? (names.get(id) ?? id.split('.').pop() ?? id) : null)
  return {
    available: true,
    found: true,
    delaySec: t['odpt:delay'] ?? 0,
    fromStation: name(t['odpt:fromStation']),
    toStation: name(t['odpt:toStation']),
    updatedAt: t['dc:date'] ?? updatedAt,
  }
}
