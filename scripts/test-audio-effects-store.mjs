import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { ref, reactive, computed, watch, nextTick, effectScope } from 'vue'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const playerSource = await read('../src/stores/player.ts')
const settingsSource = await read('../src/stores/settings.ts')
const parse = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.ES2022, true)
const playerTree = parse('player.ts', playerSource)
const settingsTree = parse('settings.ts', settingsSource)
const names = new Set(['setSpeed', 'setPitch', 'effectivePlaybackSpeed', 'setListenTogetherSyncPlaybackRate',
  'resetAudioEffects', 'setLoudnessGain', 'setEqualizer', 'setEqualizerPreset', 'applyPersistedSettings'])
const fragments = []
function collect(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) fragments.push(node.getText(playerTree))
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(playerTree) === 'watch'
    && /settings\.(playbackSpeed|playbackPitch|loudnessGainMb|equalizerEnabled)/.test(node.expression.arguments[0]?.getText(playerTree))) {
    fragments.push(node.getText(playerTree))
  }
  ts.forEachChild(node, collect)
}
collect(playerTree)
const normalizers = settingsTree.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['normalizePlaybackSpeed', 'normalizePlaybackPitch', 'normalizePlaybackParameter'].includes(node.name?.text))
  .map(node => node.getText(settingsTree)).join('\n').replaceAll('export ', '')
const presets = playerTree.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration => declaration.name.getText(playerTree) === 'EQ_PRESETS'))
const compile = code => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const presetModule = {}
new Function('exports', compile(presets.getText(playerTree)))(presetModule)
const compiled = compile(`${normalizers}\n${fragments.join('\n')}`)

function runtime() {
  const settings = reactive({ volume: 0.7, playbackSpeed: 1, playbackPitch: 1, loudnessGainMb: 0,
    equalizerEnabled: false, equalizerBands: [0, 0, 0, 0, 0], equalizerPresetId: 'flat',
    normalizeVolume: true, volumeBalance: 0.35, multichannelDrc: false, audioOutputDevice: '' })
  const state = {
    settings, playbackSpeed: ref(1), playbackPitch: ref(1), loudnessGainMb: ref(0),
    equalizerEnabled: ref(false), equalizerBands: ref([0, 0, 0, 0, 0]), equalizerPresetId: ref('flat'), volume: ref(0.7),
  }
  const calls = [], timers = new Map()
  let timerSequence = 0
  const context = {
    ...state, ref, computed, watch, EQ_PRESETS: presetModule.EQ_PRESETS,
    invoke: async (command, args) => { calls.push([command, args]) },
    setTimeout: callback => { const id = ++timerSequence; timers.set(id, callback); return id },
    clearTimeout: id => timers.delete(id),
    currentRenderedPosition: () => 12_000,
    performance: { now: () => 100 }, interpolatedPositionMs: ref(12_000), lastSeekCommand: ref({ seq: 0 }),
    playbackRequestToken: 1, log: { warn() {} },
  }
  const scope = effectScope()
  const api = scope.run(() => new Function(...Object.keys(context), `
    let _speedInvokeTimer = null, _pitchInvokeTimer = null, listenTogetherSyncRateMultiplier = null;
    let _interpSpeed = 1, _interpIsPlaying = true, _interpAnchorMs = 12000, _interpAnchorTime = 100, _interpRenderedMs = 12000;
    ${compiled}
    return { setSpeed, setPitch, effectivePlaybackSpeed, setListenTogetherSyncPlaybackRate,
      resetAudioEffects, setEqualizerPreset, applyPersistedSettings, interpolationSpeed: () => _interpSpeed,
      seekSequence: () => lastSeekCommand.value.seq, anchor: () => [_interpAnchorMs, _interpAnchorTime, _interpRenderedMs] };
  `)(...Object.values(context)))
  return { ...state, ...api, calls, dispose: () => scope.stop(), async flush() {
    await nextTick()
    for (const [id, callback] of [...timers]) { timers.delete(id); callback() }
    await Promise.resolve()
  } }
}

let passed = 0
async function regression(name, run) {
  const r = runtime()
  try { await run(r); passed++; console.log(`ok - ${name}`) }
  finally { r.dispose() }
}

await regression('changing pitch leaves speed, lyric clock and seek anchor unchanged', async r => {
  await r.setSpeed(1.5)
  await r.flush()
  r.calls.length = 0
  const anchor = r.anchor(), seekSequence = r.seekSequence()
  await r.setPitch(0.754)
  await r.flush()
  assert.equal(r.playbackPitch.value, 0.75)
  assert.equal(r.settings.playbackPitch, 0.75)
  assert.equal(r.playbackSpeed.value, 1.5)
  assert.equal(r.interpolationSpeed(), 1.5)
  assert.deepEqual(r.anchor(), anchor)
  assert.equal(r.seekSequence(), seekSequence)
  assert.deepEqual(r.calls, [['set_pitch', { pitch: 0.75 }]])
})

await regression('speed spans Android range independently from pitch', async r => {
  await r.setPitch(2)
  await r.setSpeed(0.1)
  await r.flush()
  assert.equal(r.playbackSpeed.value, 0.1)
  assert.equal(r.playbackPitch.value, 2)
  assert.equal(r.interpolationSpeed(), 0.1)
  await r.setSpeed(4)
  await r.flush()
  assert.equal(r.calls.at(-1)[1].speed, 4)
})

await regression('imported sound settings update the live DSP state', async r => {
  Object.assign(r.settings, { playbackSpeed: 1.7, playbackPitch: 0.65, loudnessGainMb: 450,
    equalizerEnabled: true, equalizerBands: [300, 200, 100, 200, 300], equalizerPresetId: 'acoustic' })
  await r.flush()
  assert.equal(r.playbackSpeed.value, 1.7)
  assert.equal(r.playbackPitch.value, 0.65)
  assert.equal(r.loudnessGainMb.value, 450)
  assert.equal(r.equalizerPresetId.value, 'acoustic')
  assert.deepEqual(r.equalizerBands.value, [300, 200, 100, 200, 300])
  assert.ok(r.calls.some(([command, args]) => command === 'set_pitch' && args.pitch === 0.65))
})

await regression('reset clears queued edits while retaining temporary sync rate and output preferences', async r => {
  r.setListenTogetherSyncPlaybackRate(0.96)
  await r.setSpeed(1.8)
  await r.setPitch(0.7)
  await r.resetAudioEffects()
  await r.flush()
  assert.equal(r.playbackSpeed.value, 1)
  assert.equal(r.playbackPitch.value, 1)
  assert.equal(r.effectivePlaybackSpeed(), 0.96)
  assert.equal(r.interpolationSpeed(), 0.96)
  assert.equal(r.settings.normalizeVolume, true)
  assert.equal(r.settings.volumeBalance, 0.35)
  assert.ok(!r.calls.some(([command]) => command === 'set_pitch'), 'old pitch edit cannot reapply after reset')
  assert.equal(r.calls.at(-1)[1].speed, 0.96)
})

await regression('startup reapplies saved pitch and speed through separate IPC commands', async r => {
  r.settings.playbackPitch = 0.8
  r.settings.playbackSpeed = 1.25
  await r.applyPersistedSettings()
  await r.flush()
  assert.ok(r.calls.some(([command, args]) => command === 'set_pitch' && args.pitch === 0.8))
  assert.ok(r.calls.some(([command, args]) => command === 'set_speed' && args.speed === 1.25))
})

await regression('Android EQ presets use the referenced frequency gains', async r => {
  await r.setEqualizerPreset('acoustic')
  assert.deepEqual(r.equalizerBands.value, [300, 200, 100, 200, 300])
  await r.setEqualizerPreset('club')
  assert.deepEqual(r.equalizerBands.value, [500, 300, 0, 300, 400])
  await r.setEqualizerPreset('folk')
  assert.deepEqual(r.equalizerBands.value, [100, 300, 0, 400, 500])
})

await regression('selecting custom retains manual bands and unknown presets are harmless', async r => {
  r.equalizerBands.value = [100, -200, 300, -400, 500]
  await r.setEqualizerPreset('custom')
  assert.deepEqual(r.equalizerBands.value, [100, -200, 300, -400, 500])
  await r.setEqualizerPreset('__proto__')
  assert.equal(r.equalizerPresetId.value, 'flat')
  assert.deepEqual(r.equalizerBands.value, [0, 0, 0, 0, 0])
})

console.log(`Audio effects store regressions: ${passed} passed`)
