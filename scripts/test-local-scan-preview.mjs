import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/modules/library/localScanPreview.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const { localReferenceKey, scanMetadataFingerprint, duplicateScanTrackIds, existingScanTrackIds, filterScanTracks } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const song = (id, extra = {}) => ({
  id, title: 'Song', artist: 'Artist', album: 'Album', durationMs: 180000,
  audioUrl: `C:\\Music\\${id}.mp3`, source: 'local', ...extra,
})

assert.equal(localReferenceKey('\\\\?\\C:\\Music\\Song.mp3'), 'c:/music/song.mp3')
assert.equal(localReferenceKey('file:///C:/Music/Song%20Name.mp3'), 'c:/music/song name.mp3')
assert.equal(localReferenceKey('/Music/Song.mp3'), '/Music/Song.mp3')
assert.equal(localReferenceKey('https://example.com/audio.mp3'), null)
assert.equal(localReferenceKey(''), null)

const first = song('a')
const copy = song('b', { title: ' SONG ', artist: 'Artist\t', album: '  ALBUM ' })
assert.equal(scanMetadataFingerprint(first), scanMetadataFingerprint(copy))
assert.equal(scanMetadataFingerprint(song('missing', { album: '' })), null)
assert.equal(scanMetadataFingerprint(song('placeholder', { album: '__local_files__' })), null)
assert.deepEqual([...existingScanTrackIds([first, copy], [song('renamed', { audioUrl: 'c:/music/A.mp3' })])], ['a', 'b'])
assert.deepEqual([...existingScanTrackIds([first], [song('elsewhere', { audioUrl: 'C:/Other/a.mp3' })])], ['a'])
assert.deepEqual([...existingScanTrackIds([first], [song('remote', { source: 'netease', audioUrl: 'https://example.com/audio.mp3' })])], ['a'])
assert.deepEqual([...existingScanTrackIds([first], [song('downloaded', { source: 'netease', audioUrl: 'C:/Music/a.mp3' })])], ['a'])
assert.deepEqual([...duplicateScanTrackIds([first, copy, song('longer', { durationMs: 180001 })])], ['b', 'longer'])

const angelFile = song('angel-file', {
  title: 'ANGEL', artist: '尹美莱/Tiger JK/Bizzy', album: 'Angel', durationMs: 255143,
  audioUrl: 'C:/Music/ANGEL.flac',
})
const angelInPlaylist = song('netease:angel', {
  title: ' ＡＮＧＥＬ ', artist: 'Bizzy / 尹美莱 / Tiger  JK', album: ' ANGEL ', durationMs: 255000,
  source: 'netease', audioUrl: '',
})
const existingAngelIds = existingScanTrackIds([angelFile], [angelInPlaylist])
assert.deepEqual([...existingAngelIds], ['angel-file'], 'downloaded metadata matches an online playlist entry without a local path')
assert.deepEqual([...existingScanTrackIds([angelFile], [{
  ...angelInPlaylist, id: 'qq:angel', source: 'qq', artist: '尹美莱、Tiger JK；Bizzy',
}])], ['angel-file'], 'multi-artist separators do not change song identity')
assert.deepEqual([...duplicateScanTrackIds([angelFile, {
  ...angelInPlaylist, id: 'angel-copy', source: 'local', audioUrl: 'D:/Music/ANGEL.mp3', durationMs: 0,
}])], ['angel-copy'], 'format and duration do not change a complete metadata identity')

for (const extra of [
  { title: 'ANGEL (Live)' },
  { artist: 'Another Artist' },
  { album: 'Another Album' },
]) {
  const different = { ...angelInPlaylist, ...extra }
  assert.deepEqual([...existingScanTrackIds([angelFile], [different])], [], 'different metadata stays visible')
  assert.deepEqual([...duplicateScanTrackIds([angelFile, different])], [], 'different versions are not metadata duplicates')
}
for (const extra of [
  { artist: 'Unknown Artist' }, { artist: '未知歌手' },
  { album: 'Unknown Album' }, { album: '未知专辑' }, { album: '' }, { album: '__local_files__' },
  { artist: '<unknown>' }, { album: '<unknown>' },
]) {
  const incomplete = song('incomplete', extra)
  assert.equal(scanMetadataFingerprint(incomplete), null, 'placeholder metadata must not identify a song')
  assert.deepEqual([...existingScanTrackIds([incomplete], [song('other-incomplete', extra)])], [])
  assert.deepEqual([...duplicateScanTrackIds([incomplete, song('other-incomplete', extra)])], [])
}
assert.deepEqual([...existingScanTrackIds([song('same-file', { album: '' })], [song('online', {
  title: 'Updated title', artist: 'Updated artist', album: 'Updated album', source: 'netease',
  audioUrl: 'file:///C:/Music/same-file.mp3',
})])], ['same-file'], 'an exact file reference still matches when metadata is missing or edited')

const tracks = [first, copy, song('missing', { artist: 'Unknown Artist', album: '' })]
const options = { query: '', metadataOnly: false, hideExisting: false, hideDuplicates: false, existingIds: new Set(['a']), duplicateIds: new Set(['b']) }
assert.deepEqual(filterScanTracks(tracks, { ...options, hideExisting: true }).map(t => t.id), ['b', 'missing'])
assert.deepEqual(filterScanTracks(tracks, { ...options, hideDuplicates: true }).map(t => t.id), ['a', 'missing'])
assert.deepEqual(filterScanTracks(tracks, { ...options, metadataOnly: true }).map(t => t.id), ['a', 'b'])
assert.deepEqual(filterScanTracks(tracks, { ...options, query: 'c:/music/a' }).map(t => t.id), ['a'])
assert.deepEqual(filterScanTracks(tracks, { ...options, query: 'song album' }).map(t => t.id), ['a', 'b'])
assert.deepEqual(filterScanTracks([angelFile], { ...options, hideExisting: true, existingIds: existingAngelIds }), [], 'the playlist metadata match is hidden by the actual filter')
console.log('local scan preview policy tests passed')
