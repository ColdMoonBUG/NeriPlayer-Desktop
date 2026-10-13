import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const player = vue.reactive({
  playbackSpeed: 1, playbackPitch: 1, loudnessGainMb: 0,
  equalizerEnabled: true, equalizerBands: [0, 0, 0, 0, 0], equalizerPresetId: 'flat',
  setSpeed(value) { this.playbackSpeed = value },
  setPitch(value) { this.playbackPitch = value },
  setLoudnessGain(value) { this.loudnessGainMb = value },
  setEqualizer(enabled, bands) { this.equalizerEnabled = enabled; this.equalizerBands = [...bands] },
  setEqualizerPreset(value) { this.equalizerPresetId = value },
  resetAudioEffects() {
    this.playbackSpeed = 1; this.playbackPitch = 1; this.loudnessGainMb = 0
    this.equalizerEnabled = false; this.equalizerBands = [0, 0, 0, 0, 0]; this.equalizerPresetId = 'flat'
  },
})
const settings = vue.reactive({ equalizerPresetId: 'flat' })
const presets = { flat: [0, 0, 0, 0, 0], rock: [400, 300, -200, 300, 500], custom: [0, 0, 0, 0, 0] }
const editable = {
  props: ['modelValue', 'min', 'max', 'step', 'ariaLabel'], emits: ['update:modelValue'],
  setup: (props, { emit }) => () => vue.h('editable-value', {
    ...props, onUpdateValue: value => emit('update:modelValue', value),
  }),
}
const select = {
  props: ['modelValue', 'options', 'label', 'surface'], emits: ['update:modelValue'],
  setup: (props, { emit }) => () => vue.h('preset-select', {
    ...props, onChoose: value => emit('update:modelValue', value),
  }),
}
async function component(path, dependencyOverrides = {}) {
  const script = compileScript(parse(await read(path)).descriptor, {
    id: 'audio-effects-ui-test', genDefaultAs: 'component', inlineTemplate: true,
  })
  const dependencies = {
    vue, 'vue-i18n': { useI18n: () => ({ t: (key, args) => args?.frequency ? `${key}:${args.frequency}` : key }) },
    '@/stores/player': { usePlayerStore: () => player, EQ_PRESETS: presets },
    '@/stores/settings': { useSettingsStore: () => settings },
    './ui/CustomSelect.vue': { default: select }, './ui/EditableRangeValue.vue': { default: editable },
    '@/components/ui/CustomSelect.vue': { default: select }, '@/components/ui/EditableRangeValue.vue': { default: editable },
    ...dependencyOverrides,
  }
  return new Function('require', 'exports', `${ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText}\nreturn component`)(name => {
    assert.ok(name in dependencies, `unexpected dependency: ${name}`)
    return dependencies[name]
  }, {})
}
let focusedInput = null
class TestElement {
  constructor(type) { this.type = type; this.children = []; this.props = {}; this.listeners = new Map() }
  get parentElement() { return this.parent instanceof TestElement ? this.parent : null }
  matches(selector) {
    if (selector.startsWith('.')) return (this.props.class ?? '').split(/\s+/).includes(selector.slice(1))
    if (selector === 'input[type="range"]') return this.type === 'input' && this.props.type === 'range'
    return this.type === selector
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector.split(',').some(part => node.matches(part.trim()))) return node
    }
    return null
  }
  querySelectorAll(selector) { return findAll(this, node => node instanceof TestElement && node.matches(selector)) }
  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) ?? new Set()
    callbacks.add(callback)
    this.listeners.set(name, callbacks)
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback) }
  focus() { focusedInput = this }
  select() {}
}
class TestInputElement extends TestElement {}
globalThis.Element = TestElement
globalThis.HTMLInputElement = TestInputElement
const renderer = vue.createRenderer({
  createElement: type => type === 'input' ? new TestInputElement(type) : new TestElement(type),
  createText: text => ({ text }), createComment: text => ({ text }),
  setText(node, text) { node.text = text },
  setElementText(node, text) { node.text = text; node.children = [] },
  patchProp(node, key, _, value) { node.props[key] = value },
  parentNode: node => node.parent ?? null,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  insert(node, parent, anchor = null) {
    node.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(node)
    else parent.children.splice(index, 0, node)
  },
  remove(node) { node.parent.children.splice(node.parent.children.indexOf(node), 1) },
})
function findAll(tree, predicate) {
  return [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => findAll(child, predicate))]
}
const ranges = tree => findAll(tree, node => node.type === 'input' && node.props.type === 'range')
const rangeByLabel = (tree, label) => ranges(tree).find(node => node.props['aria-label'] === label)
const valueByLabel = (tree, label) => findAll(tree, node => node.type === 'editable-value' && node.props.ariaLabel === label)[0]

let details = 0
const panelTree = { children: [] }
const panelApp = renderer.createApp(await component('../src/components/AudioEffectsPanel.vue'), { onDetails: () => details++ })
panelApp.mount(panelTree)
try {
  assert.equal(ranges(panelTree).length, 2, 'playback panel contains only speed and pitch sliders')
  assert.equal(rangeByLabel(panelTree, 'player.playback_speed').props.min, '0.1')
  assert.equal(rangeByLabel(panelTree, 'player.playback_speed').props.max, '4')
  assert.equal(rangeByLabel(panelTree, 'player.pitch').props.min, '0.25')
  assert.equal(rangeByLabel(panelTree, 'player.pitch').props.max, '2')
  rangeByLabel(panelTree, 'player.playback_speed').props.onInput({ target: { value: '1.5' } })
  assert.equal(player.playbackSpeed, 1.5)
  assert.equal(player.playbackPitch, 1, 'speed adjustment preserves pitch')
  rangeByLabel(panelTree, 'player.pitch').props.onInput({ target: { value: '0.85' } })
  assert.equal(player.playbackPitch, 0.85)
  assert.equal(player.playbackSpeed, 1.5, 'pitch adjustment preserves speed')
  const detailsButton = findAll(panelTree, node => node.type === 'button' && node.text === 'player.audio_effects_details')[0]
  assert.ok(detailsButton, 'playback panel exposes detailed settings')
  detailsButton.props.onClick()
  assert.equal(details, 1)
  findAll(panelTree, node => node.type === 'button' && node.text === 'player.reset_effects')[0].props.onClick()
  assert.equal(player.playbackSpeed, 1)
  assert.equal(player.playbackPitch, 1)
  console.log('PASS basic playback controls, independent speed/pitch, details event and reset')
} finally { panelApp.unmount() }

player.equalizerEnabled = true
const detailTree = { children: [] }
const detailApp = renderer.createApp(await component('../src/components/settings/AudioEffectsSettings.vue'))
detailApp.mount(detailTree)
try {
  assert.equal(ranges(detailTree).length, 8, 'detailed settings expose speed, pitch, gain and all five EQ bands')
  for (const range of ranges(detailTree)) assert.ok(range.props['aria-label'], 'every slider has a label')
  valueByLabel(detailTree, 'player.pitch').props.onUpdateValue(1.25)
  assert.equal(player.playbackPitch, 1.25)
  assert.equal(player.playbackSpeed, 1)
  valueByLabel(detailTree, 'player.playback_speed').props.onUpdateValue(4)
  assert.equal(player.playbackSpeed, 4)
  assert.equal(player.playbackPitch, 1.25)
  valueByLabel(detailTree, 'player.loudness_gain').props.onUpdateValue(650)
  assert.equal(player.loudnessGainMb, 650)
  const band = ranges(detailTree).find(node => node.props['aria-label'].includes(':910'))
  band.props.onInput({ target: { value: '-350' } })
  assert.deepEqual([...player.equalizerBands], [0, 0, -350, 0, 0])
  assert.equal(player.equalizerPresetId, 'custom')
  assert.equal(settings.equalizerPresetId, 'custom')
  await vue.nextTick()
  const presetSelect = findAll(detailTree, node => node.type === 'preset-select')[0]
  presetSelect.props.onChoose('rock')
  assert.equal(player.equalizerPresetId, 'rock')
  findAll(detailTree, node => node.type === 'button' && node.text === 'player.reset_effects')[0].props.onClick()
  assert.equal(player.playbackSpeed, 1)
  assert.equal(player.playbackPitch, 1)
  assert.equal(player.loudnessGainMb, 0)
  assert.deepEqual([...player.equalizerBands], [0, 0, 0, 0, 0])
  console.log('PASS detailed numeric input wiring, EQ customization, presets and reset')
} finally { detailApp.unmount() }

const rangeUtilities = {}
new Function('exports', ts.transpileModule(await read('../src/utils/editableRange.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(rangeUtilities)
const realEditable = await component('../src/components/ui/EditableRangeValue.vue', {
  '@/utils/editableRange': rangeUtilities,
})
const actualTree = { children: [] }
const actualApp = renderer.createApp(await component('../src/components/settings/AudioEffectsSettings.vue', {
  '@/components/ui/EditableRangeValue.vue': { default: realEditable },
}))
actualApp.mount(actualTree)
try {
  const eqBands = findAll(actualTree, node => node instanceof TestElement && node.matches('.effects-band'))
  assert.equal(eqBands.length, 5)
  const click = target => {
    const event = { target, preventDefault() {}, stopPropagation() {} }
    for (let node = target; node; node = node.parentElement) {
      for (const listener of node.listeners.get('click') ?? []) listener(event)
    }
  }
  for (const [index, band] of eqBands.entries()) {
    const frequencyLabel = findAll(band, node => node.type === 'span' && node.text?.includes('Hz'))[0]
    click(frequencyLabel)
    await vue.nextTick()
    const editors = findAll(actualTree, node => node instanceof TestElement && node.matches('.editable-range-input'))
    assert.equal(editors.length, 1, 'clicking an EQ frequency label opens exactly one real number editor')
    assert.ok(band === editors[0].closest('.effects-band'), `band ${index} owns its editor`)
    assert.equal(vue.toRaw(focusedInput), editors[0], 'the selected band keeps input focus')
    editors[0].props.onKeydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
    await vue.nextTick()
    assert.equal(findAll(actualTree, node => node instanceof TestElement && node.matches('.editable-range-input')).length, 0)
    click(band)
    await vue.nextTick()
    assert.equal(findAll(actualTree, node => node instanceof TestElement && node.matches('.editable-range-input')).length, 1,
      'clicking band whitespace opens only that band editor')
    focusedInput.props.onKeydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
    await vue.nextTick()
  }
  const presetTitle = findAll(actualTree, node => node.text === 'player.eq_preset')[0]
  click(presetTitle)
  await vue.nextTick()
  assert.equal(findAll(actualTree, node => node instanceof TestElement && node.matches('.editable-range-input')).length, 0,
    'clicking the EQ preset card does not open frequency editors')
  console.log('PASS real EQ number editors have independent card click and focus scopes')
} finally { actualApp.unmount() }

const nowPlaying = await read('../src/components/NowPlaying.vue')
assert.equal([...nowPlaying.matchAll(/<AudioEffectsPanel[^>]+@details="openAudioEffectsSettings"/g)].length, 2,
  'toolbar and more panel share the detailed settings action')
const functionSource = nowPlaying.match(/function openAudioEffectsSettings\(\)[^{]*\{([\s\S]*?)\n\}/)?.[1]
assert.ok(functionSource, 'detailed settings navigation is defined')
const pushed = []
const emitted = []
const popover = { value: true }
const sheet = { value: true }
await new Function('showAudioFxPanel', 'showMoreSheet', 'router', 'emit', functionSource)(
  popover, sheet, { push: path => { pushed.push(path); return Promise.resolve() } }, event => emitted.push(event),
)
await Promise.resolve()
assert.equal(popover.value, false)
assert.equal(sheet.value, false)
assert.deepEqual(pushed, ['/settings?section=audio_effects'])
assert.deepEqual(emitted, ['collapse'])
const view = await read('../src/views/SettingsView.vue')
assert.match(view, /\| 'audio_effects'/)
assert.match(view, /id: 'audio_effects'/)
assert.match(view, /audio_effects: \[\]/)
assert.match(view, /data-section="audio_effects"[\s\S]*?<AudioEffectsSettings/)
const index = await read('../src/modules/settings/searchIndex.ts')
for (const key of ['player.playback_speed', 'player.pitch', 'player.loudness_gain', 'player.equalizer', 'player.eq_preset', 'player.reset_effects']) {
  assert.ok(index.includes(`section: 'audio_effects', title: '${key}'`), `${key} is searchable in the audio effects section`)
}
for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
  const messages = JSON.parse(await read(`../src/i18n/${locale}.json`))
  for (const key of ['audio_effects_details', 'eq_club', 'eq_folk']) assert.ok(messages.player[key], `${locale} player.${key}`)
  for (const key of ['audio_effects_section', 'audio_effects_desc', 'audio_effects_speed_desc', 'audio_effects_pitch_desc', 'audio_effects_gain_desc', 'audio_effects_eq_desc', 'audio_effects_band']) {
    assert.ok(messages.settings[key], `${locale} settings.${key}`)
  }
}
console.log('PASS detailed settings navigation, searchable controls and four-language coverage')
