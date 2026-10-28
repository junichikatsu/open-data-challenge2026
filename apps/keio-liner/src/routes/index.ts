import { Hono } from 'hono'
import { requireUser } from '../middleware/auth'
import { favoriteRoutes } from './favorites'
import { healthHandler } from './health'
import { linerRoutes } from './liner'
import { staticRoutes } from './static-routes'

/**
 * ルート定義の 1 セット。app.ts が `/`・`/:base`・`/:base/` の 3 通りにマウントする。
 *
 * 認証は各ルートファイルに書かず、ここでパス指定してまとめて適用する。
 * 各ルートに書く方式はルート追加時に書き忘れる。忘れられる防御は防御ではない。
 * ログインが要るのは /v1/me/* だけ（乗車中の画面はログインなしでも使える）。
 */
export function createRoutes(): Hono {
  const routes = new Hono()

  // 認証不要の唯一の運用エンドポイント
  routes.get('/v1/health', healthHandler)

  routes.route('/', staticRoutes())
  routes.route('/v1', linerRoutes())

  routes.use('/v1/me/*', requireUser())
  routes.route('/v1/me/favorites', favoriteRoutes())

  return routes
}
