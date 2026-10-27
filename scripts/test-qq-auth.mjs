import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as pinia from 'pinia'
import * as vue from 'vue'

// All windows sharing WebView2's data directory must use the main window's
// browser arguments, otherwise native window creation fails on Windows.
const nativeAuth = await readFile(new URL('../src-tauri/src/commands/auth_cmd.rs', import.meta.url), 'utf8')
assert.match(nativeAuth, /WebviewWindowBuilder::new\(&app, "qq-oauth", WebviewUrl::External\(authorize\)\)\s*\.main_browser_args\(&app\)/)

// musicKey 只有几天寿命，必须在到期前自动续期，否则挂机一段时间就只能重新登录
const mainRs = await readFile(new URL('../src-tauri/src/main.rs', import.meta.url), 'utf8')
assert.match(nativeAuth, /api\s*\.\s*login\s*\.\s*refresh_credential\(Some\(&previous\)\)/)
assert.match(mainRs, /auth_cmd::maybe_refresh_qq_credential\(&handle_qq, state\.inner\(\)\)\.await/)

const source = await readFile(new URL('../src/stores/auth.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const calls = []
const events = []
const invalidations = []
const connected = { logged_in: true, nickname: 'QQ fixture', avatar_url: null }
let failLogin = false
const exports = {}
globalThis.window = { dispatchEvent: event => events.push(event) }
new Function('require', 'exports', compiled)(name => {
  if (name === 'pinia') return pinia
  if (name === 'vue') return vue
  if (name === '@tauri-apps/api/core') return { invoke: async (command, args) => {
    calls.push({ command, args })
    if (command === 'check_auth_status') return { qq: connected, netease: {}, bilibili: {}, youtube: {} }
    if (command === 'login_qq') {
      if (failLogin) throw new Error('login cancelled')
      return connected
    }
    if (command === 'logout') return
    throw new Error(`Unexpected command: ${command}`)
  } }
  if (name === './toast') return { useToastStore: () => ({ success() {}, error() {}, show() {} }) }
  if (name === './recommend') return { useRecommendStore: () => ({ invalidatePlatform: platform => invalidations.push(platform) }) }
  if (name === '@/i18n') return { default: { global: { t: key => key } } }
  if (name === '@/utils/logger') return { createLogger: () => ({ error() {}, warn() {} }) }
  if (name === '@/modules/playback/playbackSource') return { playbackUrlResolver: { clear() {} } }
  if (name === '@/modules/playback/playbackPrefetch') return { playbackPrefetchManager: { clear() {} } }
  throw new Error(`Unexpected dependency: ${name}`)
}, exports)
pinia.setActivePinia(pinia.createPinia())
const store = exports.useAuthStore()
await store.checkStatus()
assert.equal(store.qq.loggedIn, true)
assert.equal(store.youtube.loggedIn, false)
assert.equal(store.isAnyLoggedIn, true)
await store.loginQq()
assert.deepEqual(calls.at(-1), { command: 'login_qq', args: { provider: 'qq' } })
await store.loginQqWechat()
assert.deepEqual(calls.at(-1), { command: 'login_qq', args: { provider: 'wechat' } })
assert.equal(events.at(-1).detail.platform, 'qq')
assert.deepEqual(invalidations, ['qq', 'qq'])
await store.logout('qq')
assert.deepEqual(calls.at(-1), { command: 'logout', args: { platform: 'qq' } })
assert.equal(store.qq.loggedIn, false)
assert.equal(store.isAnyLoggedIn, false)
failLogin = true
await store.loginQq()
assert.equal(store.qq.loggedIn, false)
assert.equal(store.loggingIn, null)
assert.equal(events.length, 3, 'cancelled login must not publish an account change')
console.log('QQ OAuth frontend state tests passed')
