/**
 * esbuild の define で埋め込まれるグローバル。ローカル・テストでは未定義（typeof で分岐する）。
 */
declare const __BUILD_INFO__: { version: string; commit: string; builtAt: string } | undefined

declare const __STATIC_ASSETS__:
  | Record<string, { contentType: string; encoding: 'utf8' | 'base64'; body: string }>
  | undefined

/** 京王ライナーの便データ（data/generated/liner.json）。build.mjs が埋め込む */
declare const __LINER_DATA__: unknown
