import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const coreRoot = resolve('vendor/applemusic-like-lyrics/packages/core/src')
const modules = new Map()
function loadCore(relativePath) {
  const file = resolve(coreRoot, relativePath)
  if (modules.has(file)) return modules.get(file)
  const exports = {}
  modules.set(file, exports)
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  new Function('require', 'exports', compiled)(name => {
    if (name.startsWith('#utils/')) return loadCore(`utils/${name.slice(7)}`)
    if (name.startsWith('#lyric/')) return loadCore(`lyric-player/${name.slice(7)}`)
    if (name.startsWith('#styles/')) return { emphasize: 'emphasize', emphasizeWrapper: 'emphasizeWrapper' }
    if (name.startsWith('.')) return loadCore(resolve(dirname(file), name))
    return require(name)
  }, exports)
  return exports
}

const { Spring } = loadCore('utils/spring.ts')
const { LyricLineGroupBase } = loadCore('lyric-player/base/group.ts')
const { LyricLineBase } = loadCore('lyric-player/base/line.ts')
const { LyricLineEl } = loadCore('lyric-player/dom/lyric-line.ts')
class TestLyricGroup extends LyricLineGroupBase {
  lyricPlayer = {
    getEnableSpring: () => true,
    getEnableScale: () => true,
    getIsPlaying: () => true,
    getAlwaysPostpositionBackground: () => false,
  }
  renderStyles() { this.renderedTop = this.posY.getCurrentPosition() }
  get isInSight() { return true }
}

let cases = 0
let failures = 0
function regression(name, run) {
  try {
    run()
    cases++
    console.log(`ok - ${name}`)
  } catch (error) {
    failures++
    console.error(`not ok - ${name}\n${error.stack}`)
  }
}

regression('forced lyric layout cancels an older queued scroll out of the viewport', () => {
  const group = new TestLyricGroup({ setTransform() {}, update() {} })
  group.setTransform(-900, false, 0.2, true, 1, 0)
  group.setTransform(180, true, 0, true, 1, 0)
  for (let frame = 0; frame < 120; frame++) {
    group.update(1 / 60)
    assert.equal(group.renderedTop, 180, `frame ${frame}: forced current line must stay at its new anchor`)
  }
})

regression('forcing a position clears a delayed spring parameter change', () => {
  const spring = new Spring(0)
  spring.updateParams({ stiffness: 220, damping: 30 }, 0.2)
  spring.setPosition(180)
  assert.equal(spring.arrived(), true)
  spring.update(1)
  assert.equal(spring.getCurrentPosition(), 180)
})

regression('ordinary delayed lyric scrolling still moves to its target', () => {
  const spring = new Spring(180)
  spring.setTargetPosition(240, 0.2)
  spring.update(0.1)
  assert.equal(spring.getCurrentPosition(), 180)
  spring.update(0.2)
  spring.update(3)
  assert.ok(Math.abs(spring.getCurrentPosition() - 240) < 0.01)
})

regression('lowering the long note threshold includes shorter Chinese and English notes', () => {
  for (const word of ['长', 'call']) {
    const note = { word, startTime: 0, endTime: 750 }
    assert.equal(LyricLineBase.shouldEmphasize(note), false)
    assert.equal(LyricLineBase.shouldEmphasize(note, 700), true)
    assert.equal(LyricLineBase.shouldEmphasize(note, 1000), false)
  }
  assert.equal(LyricLineBase.shouldEmphasize({ word: 'call', startTime: 0, endTime: 700 }, 700), true)
  assert.equal(LyricLineBase.shouldEmphasize({ word: 'call', startTime: 0, endTime: 699 }, 700), false)
})

regression('the rendered word uses the configured threshold without altering its timing', () => {
  class Element {
    children = []
    classes = new Set()
    classList = { add: value => this.classes.add(value) }
    appendChild(child) { this.children.push(child) }
    animate() { return { pause() {} } }
  }
  globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) }
  let threshold = '700'
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => threshold })
  const note = { word: 'call', startTime: 0, endTime: 750 }
  const line = Object.assign(Object.create(LyricLineEl.prototype), {
    lyricLine: { words: [note], startTime: 0, endTime: 750, isBG: false },
    lyricPlayer: { getElement: () => new Element(), processObsceneWord: word => word.word },
    splittedWords: [],
  })
  line.buildWord(note, new Element(), false, false)
  assert.equal(line.splittedWords[0].shouldEmphasize, true)
  assert.equal(line.splittedWords[0].endTime, 750)
  threshold = '1000'
  line.splittedWords = []
  line.buildWord(note, new Element(), false, false)
  assert.equal(line.splittedWords[0].shouldEmphasize, false)
  threshold = 'invalid'
  line.splittedWords = []
  line.buildWord(note, new Element(), false, false)
  assert.equal(line.splittedWords[0].shouldEmphasize, false)
})

console.log(`${cases} lyric animation regressions passed, ${failures} failed`)
if (failures) process.exitCode = 1
