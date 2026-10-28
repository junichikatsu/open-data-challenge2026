// @ts-check
/**
 * ログイン。サーバの /v1/config が決める 2 通り:
 *   - liff: LINE ミニアプリ。LIFF SDK の ID トークンを送り、サーバが LINE に確認する
 *   - mock: MOCK_MODE の仮ログイン。端末ごとに名前を作って `mock:<名前>` を送る
 *
 * 乗車中の画面はログインなしで使える。ログインが要るのはお気に入りだけ。
 */

const LIFF_SDK = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
const MOCK_KEY = 'keio-liner:mockUser'

/** @type {any} */
let liff = null
/** @type {'liff' | 'mock'} */
let mode = 'mock'
/** @type {string | null} */
let displayName = null

/** @param {{ authMode: 'liff' | 'mock', liffId: string | null }} config */
export async function initAuth(config) {
  mode = config.authMode
  if (mode === 'mock') {
    displayName = `仮ユーザー ${mockName().slice(0, 6)}`
    return
  }
  if (!config.liffId) throw new Error('LIFF ID が設定されていません')
  await loadScript(LIFF_SDK)
  liff = /** @type {any} */ (window).liff
  await liff.init({ liffId: config.liffId })
  if (liff.isLoggedIn()) {
    const profile = await liff.getProfile().catch(() => null)
    displayName = profile?.displayName ?? 'LINE ユーザー'
  }
}

export function isLoggedIn() {
  return mode === 'mock' || Boolean(liff?.isLoggedIn())
}

export function userLabel() {
  return displayName
}

/** ログインしていなければログインへ（LINE アプリ内では自動。外部ブラウザでは LINE のログイン画面に移る） */
export function login() {
  if (mode === 'liff' && liff && !liff.isLoggedIn()) liff.login({ redirectUri: location.href })
}

/** @returns {string | null} */
export function token() {
  if (mode === 'mock') return `mock:${mockName()}`
  return liff?.getIDToken() ?? null
}

/** サーバが 401 を返したとき（ID トークンの期限切れ）。LIFF のログインをやり直す */
export function relogin() {
  if (mode !== 'liff' || !liff) return
  liff.logout()
  liff.login({ redirectUri: location.href })
}

function mockName() {
  let v = null
  try {
    v = localStorage.getItem(MOCK_KEY)
  } catch {
    // プライベートブラウズ等。毎回別ユーザーになるだけ
  }
  if (!v) {
    v = Math.random().toString(36).slice(2, 10)
    try {
      localStorage.setItem(MOCK_KEY, v)
    } catch {
      /* 同上 */
    }
  }
  return v
}

/** @param {string} src */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve(undefined)
    s.onerror = () => reject(new Error(`読み込めませんでした: ${src}`))
    document.head.appendChild(s)
  })
}
