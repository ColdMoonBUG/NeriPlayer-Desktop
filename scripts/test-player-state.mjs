import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const sourceUrl = new URL('../src/modules/playback/playerState.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: pathToFileURL(sourceUrl.pathname).href,
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
const {
  buildPersistedPlaybackQueue,
  restorePersistedPlaybackQueue,
} = await import(moduleUrl)

const first = { id: 'netease:1', playlistKey: 'playlist:first', audioUrl: '' }
const current = { id: 'netease:1', playlistKey: 'playlist:current', audioUrl: '' }
const last = { id: 'netease:2', playlistKey: 'playlist:last', audioUrl: '' }

const full = buildPersistedPlaybackQueue([first, current, last], 1, current, false)
assert.deepEqual(full, {
  queue: [first, current, last],
  queueIndex: 1,
  hasPlaybackSession: true,
  currentTrackId: 'netease:1',
  currentTrackPlaylistKey: 'playlist:current',
})

const compact = buildPersistedPlaybackQueue([first, current, last], 1, current, true)
assert.deepEqual(compact, {
  queue: [current],
  queueIndex: 0,
  hasPlaybackSession: true,
  currentTrackId: 'netease:1',
  currentTrackPlaylistKey: 'playlist:current',
})

const normalize = raw => {
  if (!raw || typeof raw !== 'object') throw new Error('invalid track')
  return raw
}
const canRestore = track => !!track.id && (!!track.audioUrl || !track.id.startsWith('local:'))

const restored = restorePersistedPlaybackQueue(
  [null, { id: 'local:missing', audioUrl: '' }, first, current, last],
  3,
  true,
  'netease:1',
  'playlist:current',
  normalize,
  canRestore,
)
assert.deepEqual(restored.queue, [first, current, last])
assert.equal(restored.queueIndex, 1)
assert.equal(restored.currentTrack, current)
assert.equal(restored.hasPlaybackSession, true)

const legacyRestored = restorePersistedPlaybackQueue(
  [first, last],
  99.8,
  undefined,
  undefined,
  undefined,
  normalize,
  canRestore,
)
assert.equal(legacyRestored.queueIndex, 1)
assert.equal(legacyRestored.currentTrack, last)
assert.equal(legacyRestored.hasPlaybackSession, true)

const empty = restorePersistedPlaybackQueue(
  [{ id: 'local:missing', audioUrl: '' }],
  0,
  true,
  'local:missing',
  undefined,
  normalize,
  canRestore,
)
assert.deepEqual(empty.queue, [])
assert.equal(empty.queueIndex, -1)
assert.equal(empty.currentTrack, null)
assert.equal(empty.hasPlaybackSession, false)

const queuedWithoutSession = buildPersistedPlaybackQueue([first, last], -1, null, false)
assert.equal(queuedWithoutSession.queueIndex, -1)
assert.equal(queuedWithoutSession.hasPlaybackSession, false)
const restoredWithoutSession = restorePersistedPlaybackQueue(
  queuedWithoutSession.queue,
  queuedWithoutSession.queueIndex,
  queuedWithoutSession.hasPlaybackSession,
  queuedWithoutSession.currentTrackId,
  queuedWithoutSession.currentTrackPlaylistKey,
  normalize,
  canRestore,
)
assert.deepEqual(restoredWithoutSession.queue, [first, last])
assert.equal(restoredWithoutSession.queueIndex, -1)
assert.equal(restoredWithoutSession.currentTrack, null)
assert.equal(restoredWithoutSession.hasPlaybackSession, false)

let passed = 0, failed = 0
function test(name, run) {
  try { run(); passed++; console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`) }
}

const duplicateFirst = { id: 'netease:duplicate', title: 'first', audioUrl: '' }
const duplicateCurrent = { id: 'netease:duplicate', title: 'current', audioUrl: '' }

test('preserves the saved occurrence of duplicate ids without playlist keys', () => {
  const state = restorePersistedPlaybackQueue(
    [duplicateFirst, duplicateCurrent, last], 1, true, 'netease:duplicate', undefined,
    normalize, canRestore,
  )
  assert.equal(state.queueIndex, 1)
  assert.equal(state.currentTrack, duplicateCurrent)
})

test('preserves a saved slot when the exact same object occurs twice', () => {
  const state = restorePersistedPlaybackQueue(
    [duplicateCurrent, duplicateCurrent, last], 1, true, 'netease:duplicate', undefined,
    normalize, canRestore,
  )
  assert.equal(state.queueIndex, 1)
  assert.equal(state.currentTrack, duplicateCurrent)
})

test('maps a saved duplicate slot after filtering invalid preceding entries', () => {
  const state = restorePersistedPlaybackQueue(
    [null, { id: 'local:missing', audioUrl: '' }, duplicateFirst, duplicateCurrent, last],
    3, true, 'netease:duplicate', undefined, normalize, canRestore,
  )
  assert.deepEqual(state.queue, [duplicateFirst, duplicateCurrent, last])
  assert.equal(state.queueIndex, 1)
  assert.equal(state.currentTrack, duplicateCurrent)
})

test('uses the identified track when the saved slot contains a different song', () => {
  const state = restorePersistedPlaybackQueue(
    [duplicateFirst, last, duplicateCurrent], 1, true, 'netease:duplicate', undefined,
    normalize, canRestore,
  )
  assert.equal(state.queueIndex, 0)
  assert.equal(state.currentTrack, duplicateFirst)
})

test('keeps playlist key selection when the saved index points to another duplicate', () => {
  const state = restorePersistedPlaybackQueue(
    [first, current, last], 0, true, 'netease:1', 'playlist:current', normalize, canRestore,
  )
  assert.equal(state.queueIndex, 1)
  assert.equal(state.currentTrack, current)
})

test('finds the identified track when the original saved slot is filtered out', () => {
  const state = restorePersistedPlaybackQueue(
    [first, { id: 'local:missing', audioUrl: '' }, current, last],
    1, true, 'netease:1', 'playlist:current', normalize, canRestore,
  )
  assert.deepEqual(state.queue, [first, current, last])
  assert.equal(state.queueIndex, 1)
  assert.equal(state.currentTrack, current)
})

for (const [index, expectedIndex] of [[NaN, 0], [Infinity, 0], [-5, 0], [99.8, 1]]) {
  test(`keeps legacy index fallback for ${String(index)}`, () => {
    const state = restorePersistedPlaybackQueue(
      [first, last], index, true, undefined, undefined, normalize, canRestore,
    )
    assert.equal(state.queueIndex, expectedIndex)
    assert.equal(state.currentTrack, [first, last][expectedIndex])
  })
}

const acknowledgedCurrent = { id: 'netease:duplicate', playlistKey: 'room:occurrence:0', audioUrl: '' }
const acknowledgedOther = { id: 'netease:duplicate', playlistKey: 'room:occurrence:1', audioUrl: '' }
const loadedCurrent = { id: 'netease:duplicate', playlistKey: 'room:occurrence:1', audioUrl: '' }

test('persists the acknowledged queue slot key while keeping the loaded track unchanged', () => {
  const state = buildPersistedPlaybackQueue([acknowledgedCurrent, acknowledgedOther], 0, loadedCurrent, false)
  assert.equal(state.queueIndex, 0)
  assert.equal(state.currentTrackId, 'netease:duplicate')
  assert.equal(state.currentTrackPlaylistKey, 'room:occurrence:0')
  assert.equal(loadedCurrent.playlistKey, 'room:occurrence:1')
  const restored = restorePersistedPlaybackQueue(
    state.queue, state.queueIndex, state.hasPlaybackSession, state.currentTrackId,
    state.currentTrackPlaylistKey, normalize, canRestore,
  )
  assert.equal(restored.queueIndex, 0)
  assert.equal(restored.currentTrack, acknowledgedCurrent)
})

test('drops an obsolete loaded playlist key when the selected queue slot has no key', () => {
  const state = buildPersistedPlaybackQueue([duplicateFirst, duplicateCurrent], 1, loadedCurrent, false)
  assert.equal(state.currentTrackPlaylistKey, undefined)
  const restored = restorePersistedPlaybackQueue(
    state.queue, state.queueIndex, state.hasPlaybackSession, state.currentTrackId,
    state.currentTrackPlaylistKey, normalize, canRestore,
  )
  assert.equal(restored.queueIndex, 1)
  assert.equal(restored.currentTrack, duplicateCurrent)
})

test('keeps the loaded identity when the indexed queue slot is a different song', () => {
  const state = buildPersistedPlaybackQueue([last, loadedCurrent], 0, loadedCurrent, false)
  assert.equal(state.currentTrackId, 'netease:duplicate')
  assert.equal(state.currentTrackPlaylistKey, 'room:occurrence:1')
})

test('keeps compact persistence focused on the loaded track', () => {
  const state = buildPersistedPlaybackQueue([acknowledgedCurrent, acknowledgedOther], 0, loadedCurrent, true)
  assert.deepEqual(state.queue, [loadedCurrent])
  assert.equal(state.queueIndex, 0)
  assert.equal(state.currentTrackPlaylistKey, 'room:occurrence:1')
})

console.log(`player state regression tests: ${passed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
else console.log('player state tests passed')
