import { createHash } from 'node:crypto'
import { readConfig } from '../config'
import { unauthorized } from '../errors'
import { log } from '../log'
import { userIdSchema } from '../schemas'
import type { UserId } from '../schemas'

/**
 * LINE ミニアプリ（LIFF）のログイン。
 *
 * 画面は liff.getIDToken() の ID トークンを `authorization: Bearer <token>` で送る。
 * サーバは LINE の検証エンドポイントに問い合わせ、署名・有効期限・aud（チャネル ID）を確かめてもらい、
 * 返ってきた sub（LINE のユーザー ID）をユーザー ID として使う。
 * ID トークンを自前で信用しない（画面から来たユーザー ID をそのまま使わない）。
 *
 * MOCK_MODE では `mock:<名前>` を受け付ける。LINE のチャネルが無くても通しで動かすため。
 */

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

/** 検証結果のキャッシュ（関数のインスタンス内）。キーはトークンのハッシュ。トークン自体は持たない */
const verified = new Map<string, { userId: UserId; exp: number }>()
const MAX_CACHE = 500

type Fetcher = typeof fetch
let fetcher: Fetcher = (...args) => fetch(...args)

/** テスト用: LINE への通信を差し替える */
export function setLineFetcher(fn: Fetcher | undefined): void {
  fetcher = fn ?? ((...args) => fetch(...args))
  verified.clear()
}

export async function userFromToken(token: string): Promise<UserId> {
  const cfg = readConfig()

  // MOCK_MODE の分岐は入口のここ 1 箇所だけ
  if (cfg.mockMode && token.startsWith('mock:')) {
    const parsed = userIdSchema.safeParse(`mock-${token.slice('mock:'.length)}`)
    if (!parsed.success) throw unauthorized('仮ログインの名前が不正です')
    return parsed.data
  }
  if (!cfg.lineChannelId) throw unauthorized('LINE ログインが設定されていません')

  const key = createHash('sha256').update(token).digest('hex')
  const hit = verified.get(key)
  if (hit && hit.exp * 1000 > Date.now()) return hit.userId

  const res = await fetcher(VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: token, client_id: cfg.lineChannelId }),
  })
  if (!res.ok) {
    // 期限切れ・別チャネルのトークンなど。画面は 401 を見て LIFF で取り直す
    log.info('line id token rejected', { status: res.status })
    throw unauthorized('LINE の ID トークンを確認できませんでした')
  }
  const body = (await res.json()) as { sub?: string; exp?: number }
  const parsed = userIdSchema.safeParse(body.sub)
  if (!parsed.success || !body.exp) throw unauthorized('LINE の応答にユーザー ID がありません')

  if (verified.size >= MAX_CACHE) verified.clear()
  verified.set(key, { userId: parsed.data, exp: body.exp })
  return parsed.data
}
