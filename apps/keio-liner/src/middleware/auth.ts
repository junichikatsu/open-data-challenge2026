import type { MiddlewareHandler } from 'hono'
import { userFromToken } from '../auth/line'
import { unauthorized } from '../errors'
import type { UserId } from '../schemas'

export interface AuthEnv {
  Variables: { userId: UserId }
}

/**
 * `authorization: Bearer <LINE の ID トークン>` を検証し、c.set('userId') する。
 * 各ルートに書かず、routes/index.ts でパス指定してまとめて掛ける。
 */
export function requireUser(): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const m = /^Bearer\s+(.+)$/i.exec(c.req.header('authorization') ?? '')
    if (!m) throw unauthorized('ログインが必要です')
    c.set('userId', await userFromToken(m[1]!.trim()))
    await next()
  }
}
