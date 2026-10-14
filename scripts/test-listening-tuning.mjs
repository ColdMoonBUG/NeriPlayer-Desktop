import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { loadAudioEffectsModel } from './audio-effects-model-loader.mjs'

const model = await loadAudioEffectsModel()
const source = await readFile(new URL('../src/modules/audioEffects/listening.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const tuning = {}
new Function('exports', 'require', compiled)(tuning, () => model)
let passed = 0
function regression(name, run) { run(); passed++; console.log(`ok - ${name}`) }

regression('listening controls retain exact neutral and full professional ranges', () => {
  const neutral = model.normalizeAudioEffectsSound(undefined)
  assert.deepEqual(tuning.listeningTuningValues(neutral), { bass: 0, vocal: 0, brightness: 0, warmth: 0, space: 0 })
  for (const control of tuning.LISTENING_CONTROLS) {
    for (const value of [control.min, 0, 50, 100]) {
      const sound = tuning.applyListeningTuning(neutral, control.key, value)
      assert.ok(Math.abs(tuning.listeningTuningValues(sound)[control.key] - value) < 0.001)
    }
  }
})
regression('gentle first-half mapping is continuous, monotonic and reversible', () => {
  for (const control of tuning.LISTENING_CONTROLS) {
    let previous = -Infinity
    for (let value = control.min; value <= 100; value++) {
      const sound = tuning.applyListeningTuning(model.DEFAULT_AUDIO_EFFECTS_SOUND, control.key, value)
      const actual = sound[control.field]
      assert.ok(actual >= previous, control.key)
      previous = actual
      assert.ok(Math.abs(tuning.listeningTuningValues(sound)[control.key] - value) < 0.001)
    }
  }
  assert.ok(tuning.applyListeningTuning(model.DEFAULT_AUDIO_EFFECTS_SOUND, 'bass', 50).bassDb < 6)
})
regression('tuning preserves calibration, unrelated effects and nested input data', () => {
  const source = model.normalizeAudioEffectsSound({ equalizerBandsDb: [3, 2, 1], parametricEnabled: true,
    parametricBands: [{ frequencyHz: 1200, gainDb: -4, q: 1.4 }], preampDb: -20,
    reverb: 0.3, surround: 0.2, bassFrequencyHz: 120, compressorEnabled: true })
  const before = JSON.stringify(source)
  const next = tuning.applyListeningTuning(source, 'bass', 30)
  assert.equal(JSON.stringify(source), before)
  for (const key of ['equalizerBandsDb', 'parametricBands', 'preampDb', 'reverb', 'surround', 'bassFrequencyHz', 'compressorEnabled']) {
    assert.deepEqual(next[key], source[key], key)
  }
  next.parametricBands[0].gainDb = -8
  assert.equal(source.parametricBands[0].gainDb, -4)
})
regression('beginner edits enable their actual processing and peak protection', () => {
  const source = model.normalizeAudioEffectsSound({ toneEnabled: false, spaceEnabled: false,
    dynamicsEnabled: false, compressorEnabled: true, limiterEnabled: false, limiterCeilingDb: 0, mono: true, vocalRemoval: 1 })
  const vocal = tuning.applyListeningTuning(source, 'vocal', 40)
  assert.equal(vocal.toneEnabled, true)
  assert.equal(vocal.vocalRemoval, 0)
  assert.equal(vocal.dynamicsEnabled, true)
  assert.equal(vocal.compressorEnabled, false, 'enabling peak protection must not reactivate a bypassed compressor')
  assert.equal(vocal.limiterEnabled, true)
  assert.ok(vocal.limiterCeilingDb <= -0.5)
  const space = tuning.applyListeningTuning(source, 'space', 30)
  assert.equal(space.spaceEnabled, true)
  assert.equal(space.mono, false)
})
regression('invalid input is harmless and reset touches only the five listening values', () => {
  const source = model.normalizeAudioEffectsSound({ bassDb: 2, trebleDb: -3, vocal: 0.4, warmth: 0.6,
    stereoWidth: 1.4, reverb: 0.4, parametricEnabled: true, parametricBands: [{ gainDb: -5 }] })
  assert.deepEqual(tuning.applyListeningTuning(source, 'bass', NaN), source)
  assert.deepEqual(tuning.applyListeningTuning(source, '__proto__', 50), source)
  assert.equal(tuning.applyListeningTuning(source, 'bass', 300).bassDb, 12)
  const reset = tuning.resetListeningTuning(source)
  assert.deepEqual(tuning.listeningTuningValues(reset), { bass: 0, vocal: 0, brightness: 0, warmth: 0, space: 0 })
  assert.equal(reset.reverb, source.reverb)
  assert.deepEqual(reset.parametricBands, source.parametricBands)
})
regression('bypassed sections start neutral and cannot revive dormant effects during a beginner edit', () => {
  const source = model.normalizeAudioEffectsSound({ toneEnabled: false, spaceEnabled: false,
    dynamicsEnabled: false, trebleDb: 12, warmth: 1, vocal: 1, reverb: 1, surround: 1, outputGainDb: 12 })
  assert.deepEqual(tuning.listeningTuningValues(source), { bass: 0, vocal: 0, brightness: 0, warmth: 0, space: 0 })
  const bass = tuning.applyListeningTuning(source, 'bass', 10)
  assert.equal(bass.trebleDb, 0)
  assert.equal(bass.warmth, 0)
  assert.equal(bass.vocal, 0)
  assert.equal(bass.outputGainDb, 0)
  assert.equal(bass.spaceEnabled, false)
  assert.equal(bass.reverb, 1, 'other bypassed sections keep their stored settings')
  const space = tuning.applyListeningTuning(source, 'space', 20)
  assert.equal(space.reverb, 0)
  assert.equal(space.surround, 0)
  assert.equal(space.toneEnabled, false)
  assert.equal(space.warmth, 1)
})
console.log(`Listening tuning regressions: ${passed} passed`)
