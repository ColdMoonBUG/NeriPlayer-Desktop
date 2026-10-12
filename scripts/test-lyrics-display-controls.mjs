import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'

const source = await readFile(new URL('../src/components/LyricsView.vue', import.meta.url), 'utf8')
const script = compileScript(parse(source).descriptor, {
  id: 'lyrics-display-controls-test', genDefaultAs: 'component', inlineTemplate: true,
})
const compiled = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

class ListenerTarget {
  listeners = new Map()
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener) }
}

function element(type) {
  return Object.assign(new ListenerTarget(), {
    type, children: [], props: {}, clientWidth: 700, clientHeight: 600,
    appendChild(node) { node.parent = this; node.parentElement = this; this.children.push(node) },
  })
}

const renderer = vue.createRenderer({
  createElement: element, createText: text => ({ text }), createComment: text => ({ text }),
  setText(node, text) { node.text = text },
  setElementText(node, text) { node.text = text; node.children = [] },
  patchProp(node, key, _, value) { node.props[key] = value },
  parentNode: node => node.parent ?? null,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  insert(node, parent, anchor = null) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    node.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(node)
    else parent.children.splice(index, 0, node)
  },
  remove(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1) },
})

const richLyrics = [{
  startMs: 0, durationMs: 30000, text: '歌词', translation: 'Translated lyric', roman: 'ge ci',
  words: [
    { startMs: 0, durationMs: 15000, text: '歌', romanWord: 'ge' },
    { startMs: 15000, durationMs: 15000, text: '词', romanWord: 'ci' },
  ],
}]

async function mount({ lyrics = richLyrics, settingOverrides = {} } = {}) {
  let now = 1000, frameId = 0
  const frames = new Map()
  const document = Object.assign(new ListenerTarget(), { hidden: false, fonts: { status: 'loaded' } })
  const window = new ListenerTarget()
  const players = []
  class FakeDomLyricPlayer extends ListenerTarget {
    size = [0, 0]
    currentLyricGroups = []
    lyricGroupSize = new WeakMap()
    times = []
    element = element('amll-player')
    constructor() { super(); players.push(this) }
    setLyricLines(lines, time) { this.lines = lines; this.initialTime = time }
    getLyricLines() { return this.lines }
    getElement() { return this.element }
    setCurrentTime(time, seek = false) { this.times.push([time, seek]) }
    setOptimizeOptions() {}
    setEnableBlur() {}
    setBlurAmount() {}
    setWordFadeWidth() {}
    update() {}
    calcLayout() {}
    resetScroll() {}
    resume() {}
    pause() {}
    dispose() {}
  }
  const settings = vue.reactive({
    advancedLyrics: true, showTranslation: false, showRomanization: false,
    lyricBlur: true, lyricBlurAmount: 1, lyricFontScale: 1, lyricEmphasisThresholdMs: 1000,
    ...settingOverrides,
  })
  const dependencies = {
    vue,
    '@amll-core/lyric-player/dom/index.ts': { DomLyricPlayer: FakeDomLyricPlayer },
    '@/stores/settings': { useSettingsStore: () => settings },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@tauri-apps/plugin-clipboard-manager': { writeText: async () => {} },
    '@/components/ui/ContextMenu.vue': { default: { inheritAttrs: false, setup: () => () => null } },
    '@/utils/contextMenu': { createContextMenuItem: (label, options) => ({ label, ...options }) },
  }
  const component = new Function(
    'require', 'exports', 'document', 'window', 'performance', 'requestAnimationFrame',
    'cancelAnimationFrame', 'ResizeObserver', `${compiled}\nreturn component`,
  )(name => {
    assert.ok(name in dependencies, `unexpected dependency: ${name}`)
    return dependencies[name]
  }, {}, document, window, { now: () => now }, callback => {
    const id = ++frameId
    frames.set(id, callback)
    return id
  }, id => frames.delete(id), undefined)
  const clock = vue.ref(4200)
  const seekEvents = []
  const props = vue.reactive({ lyrics, currentTimeMs: () => clock.value, isPlaying: true, lyricOffsetMs: 700 })
  const root = { children: [] }
  const app = renderer.createApp({ setup: () => () => vue.h(component, { ...props, onSeek: time => seekEvents.push(time) }) })
  app.mount(root)
  const settle = async () => {
    await vue.nextTick()
    for (let index = 0; index < 6; index++) {
      now += 16
      for (const [id, callback] of [...frames]) {
        if (frames.delete(id)) callback(now)
      }
    }
    await vue.nextTick()
  }
  await settle()
  assert.equal(players.length, 1, 'the real template must mount the AMLL host')
  const player = players[0]
  player.times = []
  function find(predicate, node = root) {
    if (predicate(node)) return node
    for (const child of node.children ?? []) {
      const match = find(predicate, child)
      if (match) return match
    }
  }
  const findButton = setting => find(node => node.type === 'button' && node.props['aria-label'] === `settings.${setting}`) ?? null
  const findControls = () => find(node => node.props?.role === 'group' && node.props['aria-label'] === 'settings.lyrics') ?? null
  const button = setting => {
    const node = findButton(setting)
    assert.ok(node, `missing lyrics display button: settings.${setting}`)
    return node
  }
  return {
    settings, player, props, clock, seekEvents, settle, button, findButton, findControls,
    async click(setting) {
      const node = button(setting)
      assert.ok(!node.props.disabled, 'display preferences must remain available')
      let stopped = false
      const event = { type: 'click', stopPropagation() { stopped = true } }
      assert.equal(typeof node.props.onClick, 'function', 'the rendered button must have a click handler')
      node.props.onClick(event)
      assert.ok(stopped, 'display clicks must stop before reaching the lyric host')
      await settle()
    },
    assertPressed(translation, romanization) {
      assert.equal(String(button('show_translation').props['aria-pressed']), String(translation))
      assert.equal(String(button('show_romanization').props['aria-pressed']), String(romanization))
    },
    assertAvailable(translation, romanization) {
      assert.equal(Boolean(findButton('show_translation')), translation, 'translation button availability must follow the source lyrics')
      assert.equal(Boolean(findButton('show_romanization')), romanization, 'romanization button availability must follow the source lyrics')
      assert.equal(Boolean(findControls()), translation || romanization, 'the display group must exist only when it has an available button')
    },
    assertPlaybackUnchanged() {
      assert.deepEqual(seekEvents, [], 'display preferences must not emit a playback seek')
      assert.equal(clock.value, 4200, 'display preferences must preserve the playback clock')
      assert.equal(player.initialTime, 4900)
      assert.ok(player.times.every(([time]) => time === 4900), 'AMLL reflow must stay at the current time plus offset')
    },
    stop() { app.unmount(); assert.equal(frames.size, 0) },
  }
}

function assertAuxiliaryLyrics(player, translation, romanization, romanWords) {
  assert.equal(player.lines[0].translatedLyric, translation)
  assert.equal(player.lines[0].romanLyric, romanization)
  assert.deepEqual(player.lines[0].words.map(word => word.romanWord ?? ''), romanWords)
}

let total = 0, failed = 0
async function test(name, run) {
  total++
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`) }
}

await test('display buttons independently toggle translation and line and word romanization', async () => {
  const r = await mount()
  try {
    assertAuxiliaryLyrics(r.player, '', '', ['', ''])
    r.assertPressed(false, false)
    await r.click('show_translation')
    assert.deepEqual([r.settings.showTranslation, r.settings.showRomanization], [true, false])
    assertAuxiliaryLyrics(r.player, 'Translated lyric', '', ['', ''])
    r.assertPressed(true, false)
    await r.click('show_romanization')
    assert.deepEqual([r.settings.showTranslation, r.settings.showRomanization], [true, true])
    assertAuxiliaryLyrics(r.player, 'Translated lyric', 'ge ci', ['ge', 'ci'])
    r.assertPressed(true, true)
    await r.click('show_translation')
    assert.deepEqual([r.settings.showTranslation, r.settings.showRomanization], [false, true])
    assertAuxiliaryLyrics(r.player, '', 'ge ci', ['ge', 'ci'])
    r.assertPressed(false, true)
    await r.click('show_romanization')
    assert.deepEqual([r.settings.showTranslation, r.settings.showRomanization], [false, false])
    assertAuxiliaryLyrics(r.player, '', '', ['', ''])
    r.assertPressed(false, false)
    r.assertPlaybackUnchanged()
  } finally { r.stop() }
})

await test('external display setting changes update pressed states and AMLL content', async () => {
  const r = await mount({ settingOverrides: { showTranslation: true } })
  try {
    r.assertPressed(true, false)
    assertAuxiliaryLyrics(r.player, 'Translated lyric', '', ['', ''])
    Object.assign(r.settings, { showTranslation: false, showRomanization: true })
    await r.settle()
    r.assertPressed(false, true)
    assertAuxiliaryLyrics(r.player, '', 'ge ci', ['ge', 'ci'])
    r.settings.showTranslation = true
    await r.settle()
    r.assertPressed(true, true)
    assertAuxiliaryLyrics(r.player, 'Translated lyric', 'ge ci', ['ge', 'ci'])
    r.assertPlaybackUnchanged()
  } finally { r.stop() }
})

const plainLine = { startMs: 0, durationMs: 30000, text: 'Plain lyric', words: [] }
const wordRomanLine = {
  startMs: 0, durationMs: 30000, text: '歌词',
  words: [
    { startMs: 0, durationMs: 15000, text: '歌' },
    { startMs: 15000, durationMs: 15000, text: '词', romanWord: 'ci' },
  ],
}

for (const [name, lyrics, translation, romanization] of [
  ['translation only', [{ ...plainLine, translation: ' Translation ' }], true, false],
  ['line romanization only', [{ ...plainLine, roman: ' Romanization ' }], false, true],
  ['word romanization only', [wordRomanLine], false, true],
  ['no auxiliary lyrics', [plainLine], false, false],
  ['whitespace auxiliary text', [{
    ...wordRomanLine, translation: ' \n\t ', roman: '\t ',
    words: [{ startMs: 0, durationMs: 30000, text: '歌词', romanWord: ' \n\t ' }],
  }], false, false],
  ['ruby annotations only', [{
    ...plainLine,
    words: [{
      startMs: 0, durationMs: 30000, text: '詞',
      ruby: [{ startMs: 0, durationMs: 30000, text: 'ことば' }],
    }],
  }], false, false],
  ['both auxiliary tracks with their display settings off', richLyrics, true, true],
]) {
  await test(`display control availability follows ${name}`, async () => {
    const r = await mount({ lyrics })
    try {
      r.assertAvailable(translation, romanization)
      assert.deepEqual([r.settings.showTranslation, r.settings.showRomanization], [false, false])
      assert.equal(r.player.lines[0].translatedLyric, '')
      assert.equal(r.player.lines[0].romanLyric, '')
      assert.ok(r.player.lines[0].words.every(word => !word.romanWord))
      r.assertPlaybackUnchanged()
    } finally { r.stop() }
  })
}

await test('display controls respond when auxiliary source lyrics arrive and disappear', async () => {
  const r = await mount({ lyrics: [plainLine] })
  try {
    r.assertAvailable(false, false)
    r.props.lyrics = richLyrics
    await r.settle()
    r.assertAvailable(true, true)
    r.assertPressed(false, false)
    assertAuxiliaryLyrics(r.player, '', '', ['', ''])
    await r.click('show_translation')
    await r.click('show_romanization')
    assertAuxiliaryLyrics(r.player, 'Translated lyric', 'ge ci', ['ge', 'ci'])
    r.props.lyrics = [{ ...plainLine, translation: 'Only translation' }]
    await r.settle()
    r.assertAvailable(true, false)
    assertAuxiliaryLyrics(r.player, 'Only translation', '', [''])
    r.props.lyrics = [plainLine]
    await r.settle()
    r.assertAvailable(false, false)
    assertAuxiliaryLyrics(r.player, '', '', [''])
    assert.equal(r.player.lines[0].words[0].word, 'Plain lyric')
    assert.deepEqual([r.settings.showTranslation, r.settings.showRomanization], [true, true])
    r.props.lyrics = [wordRomanLine]
    await r.settle()
    r.assertAvailable(false, true)
    assert.equal(String(r.button('show_romanization').props['aria-pressed']), 'true')
    assertAuxiliaryLyrics(r.player, '', '', ['', 'ci'])
    r.assertPlaybackUnchanged()
  } finally { r.stop() }
})

console.log(`Lyrics display controls regressions: ${total - failed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
