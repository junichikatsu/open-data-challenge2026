import { dataStoreKind, missingTableEnvs, TABLES } from './datastore'
import { log } from './log'

/**
 * 環境変数の読み取りと設定漏れ検出。
 * - 呼び出しのたびに読む（モジュール読み込み時に固めない）
 * - .env.example の雛形値は未設定と同じ扱い
 * - ここでは throw しない。設定不足で起動を止めると /v1/health すら返らなくなる（pitfalls 8）
 */

const PLACEHOLDERS = new Set(['', 'change-me', '00000000-0000-0000-0000-000000000000'])

function env(name: string): string | undefined {
  const v = process.env[name]?.trim()
  if (v === undefined || PLACEHOLDERS.has(v)) return undefined
  return v
}

function envInt(name: string, fallback: number): number {
  const v = Number(env(name))
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback
}

export interface AppConfig {
  mockMode: boolean
  /** デモ公開時の簡易ガード。両方そろったときだけ HTML に BASIC 認証を掛ける */
  basicAuthUser: string | undefined
  basicAuthPassword: string | undefined
  /** LINE ログインのチャネル ID。ID トークンの検証（aud の照合）に使う */
  lineChannelId: string | undefined
  /** LIFF アプリの ID。画面が liff.init に使う（公開してよい値） */
  liffId: string | undefined
  favoriteListLimit: number
}

export function readConfig(): AppConfig {
  return {
    mockMode: env('MOCK_MODE') !== 'false', // 未設定はモック（デモ既定）。本番は明示的に false にする
    basicAuthUser: env('BASIC_AUTH_USER'),
    basicAuthPassword: env('BASIC_AUTH_PASSWORD'),
    lineChannelId: env('LINE_CHANNEL_ID'),
    liffId: env('LIFF_ID'),
    favoriteListLimit: envInt('FAVORITE_LIST_LIMIT', 200),
  }
}

/** ODPT チャレンジ用トークン。readConfig に入れない（設定値の一覧に秘密を混ぜない） */
export function odptToken(): string | undefined {
  return env('ODPT_CHALLENGE_TOKEN')
}

export function basicAuthEnabled(): boolean {
  const cfg = readConfig()
  return Boolean(cfg.basicAuthUser && cfg.basicAuthPassword)
}

/**
 * 動作モードに応じた必須キーのうち、未設定のもの。/v1/health には件数だけ出す。
 * ★ 外部サービスを足したら、ここに「モードに応じた必須」を足す。手作業のチェックリストにしない。
 */
export function missingConfigKeys(): string[] {
  const missing: string[] = []
  const cfg = readConfig()
  if (dataStoreKind() === 'cloud') for (const t of missingTableEnvs()) missing.push(TABLES[t].env)
  // 片方だけ設定されている BASIC 認証は事故なので不足として扱う
  if (Boolean(cfg.basicAuthUser) !== Boolean(cfg.basicAuthPassword)) missing.push('BASIC_AUTH_USER/PASSWORD')
  // MOCK_MODE では LINE ログインを模擬し、列車ロケーションも取りに行かない
  if (!cfg.mockMode) {
    if (!cfg.lineChannelId) missing.push('LINE_CHANNEL_ID')
    if (!cfg.liffId) missing.push('LIFF_ID')
    if (!odptToken()) missing.push('ODPT_CHALLENGE_TOKEN')
  }
  return missing
}

/** コールドスタート時に 1 回だけ。キー名はここにしか出さない。値はどこにも出さない */
export function logConfigIssues(): void {
  const missing = missingConfigKeys()
  if (missing.length > 0) log.warn('config missing', { keys: missing })
  if (readConfig().mockMode) log.info('MOCK_MODE is on')
}

/** 実際に効いている上限値。/v1/health に出す */
export function effectiveLimits(): Record<string, number> {
  return { favoriteListLimit: readConfig().favoriteListLimit }
}
