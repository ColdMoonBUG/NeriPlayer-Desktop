import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function plainModule(file) {
  const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}

async function functions(file, names, context) {
  const component = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const script = component.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const parsed = ts.createSourceFile('view.ts', script, ts.ScriptTarget.ES2022, true)
  const source = names.map(name => {
    const node = parsed.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name)
    assert.ok(node, `missing actual menu handler ${file}:${name}`)
    return node.getText(parsed)
  }).join('\n')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function(...Object.keys(context), `${compiled}; return { ${names.join(',')} }`)(...Object.values(context))
}

const { collectionWebUrl } = await plainModule('utils/collectionLinks.ts')
assert.equal(collectionWebUrl('qq', 'playlist', '123456789012345678'), 'https://y.qq.com/n/ryqq/playlist/123456789012345678')
assert.equal(collectionWebUrl('youtube', 'album', 'MPREb_demo'), '', 'an album browseId is not a web playlistId')
const bili = await plainModule('modules/library/biliPlaylistReference.ts')
const routed = [], menus = [], played = []
const event = { type: 'contextmenu' }
const router = { push: route => routed.push(route) }
const collectionMenuRef = { value: { open: (event, target) => menus.push(target) } }
const library = await functions('views/LibraryView.vue', ['favoriteRoute', 'openFavorite', 'openFavoriteMenu'], {
  router, collectionMenuRef, collectionWebUrl, ...bili,
  isArtistFavoriteSource: source => ['neteaseArtist', 'biliArtist', 'youtubeMusicArtist'].includes(source),
  favoriteArtistRoute: favorite => ({ name: 'fixture-artist', params: { id: favorite.browseId || favorite.id } }),
  toast: { show() { assert.fail('valid favorite routes must not produce an error') } }, t: key => key,
})
for (const favorite of [
  { source: 'netease', id: '123' }, { source: 'neteaseAlbum', id: '234' },
  { source: 'youtubeMusic', id: 'hash', browseId: 'VLPLdemo' },
  { source: 'bili', id: '345' },
  { source: 'bili', id: '456', browseId: 'bili-playlist/v1/COLLECTION/456/567' },
  { source: 'neteaseArtist', id: '678' },
  { source: 'youtubeMusicArtist', id: 'hash', browseId: 'UCdemo' },
  { source: 'unknown', id: '789' },
]) {
  library.openFavorite(favorite)
  library.openFavoriteMenu(event, favorite)
  assert.deepEqual(menus.at(-1).route, routed.at(-1), `right click preserves ${favorite.source} routing`)
}
assert.equal(menus[2].webUrl, 'https://music.youtube.com/playlist?list=PLdemo')
assert.equal(menus[4].webUrl, 'https://space.bilibili.com/567/lists/456?type=season')
assert.equal(menus[6].webUrl, 'https://music.youtube.com/channel/UCdemo')
assert.equal(menus[7].webUrl, undefined, 'local fallback collections do not invent external URLs')

const resolvedAlbum = { source: 'youtubeMusic', id: 'album-hash', browseId: 'MPREb_demo', playlistId: 'OLAK5uy_demo' }
library.openFavorite(resolvedAlbum)
library.openFavoriteMenu(event, resolvedAlbum)
assert.deepEqual(menus.at(-1).route, routed.at(-1), 'resolved albums keep the browse route')
assert.equal(menus.at(-1).webUrl, 'https://music.youtube.com/playlist?list=OLAK5uy_demo', 'resolved album links use the available playlist identity')

const artist = await functions('views/YouTubeArtistView.vue', ['collectionRoute', 'openItem', 'openCollectionMenu'], {
  router, collectionMenuRef, collectionWebUrl,
  playSection: (section, item) => played.push(item),
  openTrackMenu: (event, section, item) => played.push(item),
})
for (const kind of ['artist', 'playlist', 'album']) {
  const item = { kind, browseId: kind === 'artist' ? 'UCdemo' : kind === 'album' ? 'MPREb_demo' : 'VLPLdemo', title: 'Title', coverUrl: '', subtitle: '' }
  artist.openItem({}, item)
  artist.openCollectionMenu(event, {}, item)
  assert.deepEqual(menus.at(-1).route, routed.at(-1))
}
const video = { kind: 'video', videoId: 'song1' }
artist.openItem({}, video)
artist.openCollectionMenu(event, {}, video)
assert.deepEqual(played, [video, video], 'videos use track operations instead of collection routes')

const shelf = await functions('views/ExploreView.vue', ['youtubeShelfTrack', 'youtubeShelfTarget', 'openYoutubeShelfMenu', 'goToYoutubeShelfItem'], {
  router, collectionMenuRef, collectionWebUrl,
  trackMenuRef: { value: { open: (event, track) => played.push(track) } },
  player: { play: track => played.push(track) },
})
const song = { videoId: 'loaded', title: 'Song', subtitle: 'Artist', durationMs: 9000, coverUrl: '' }
shelf.goToYoutubeShelfItem(song)
shelf.openYoutubeShelfMenu(event, song)
assert.deepEqual(played.at(-1), played.at(-2), 'shelf clicks and menus share complete track metadata')
assert.equal(played.at(-1).durationMs, 9000)
const shelfArtist = { browseId: 'UCdemo', pageType: 'MUSIC_PAGE_TYPE_ARTIST', title: 'Artist', subtitle: '', coverUrl: '' }
shelf.goToYoutubeShelfItem(shelfArtist)
shelf.openYoutubeShelfMenu(event, shelfArtist)
assert.equal(routed.at(-1).name, 'youtube-artist', 'artist shelf cards open the artist page')
assert.deepEqual(menus.at(-1).route, routed.at(-1), 'artist shelf clicks and menus share their destination')
assert.equal(menus.at(-1).webUrl, 'https://music.youtube.com/channel/UCdemo')
const explore = await functions('views/ExploreView.vue', ['collectionRoute', 'openCollection'], { router })
explore.openCollection({ kind: 'playlist', platform: 'qq', id: '123456789012345678' })
assert.deepEqual(routed.at(-1), { name: 'qq-playlist', params: { id: '123456789012345678' } })

const detailFields = Object.fromEntries(['isLoading', 'error', 'playlistName', 'coverUrl', 'tracks', 'trackCount', 'playCount', 'description', 'creator'].map(key => [key, { value: null }]))
const detailRequests = []
const detail = await functions('views/NeteasePlaylistView.vue', ['loadDetail'], {
  ...detailFields, props: { isQq: true }, qqDetailRequest: 0,
  route: { params: { id: '123456789012345678' } }, t: key => key,
  invoke: (command, args) => new Promise((resolve, reject) => detailRequests.push({ command, args, resolve, reject })),
})
const previousDetail = detail.loadDetail()
const currentDetail = detail.loadDetail()
assert.equal(detailRequests[1].command, 'get_qq_playlist')
assert.deepEqual(detailRequests[1].args, { id: '123456789012345678' }, 'shared detail UI preserves QQ string IDs and API')
const qqTrack = { id: 'qq:mid', title: '歌曲', source: 'qq' }
detailRequests[1].resolve({ name: '当前账号', tracks: [qqTrack] })
await currentDetail
detailRequests[0].resolve({ name: '旧账号', tracks: [] })
await previousDetail
assert.equal(detailFields.playlistName.value, '当前账号', 'old account response cannot overwrite the new request')
assert.deepEqual(detailFields.tracks.value, [qqTrack])
assert.equal(detailFields.trackCount.value, 1)
assert.equal(detailFields.isLoading.value, false)
const brokenDetail = detail.loadDetail()
detailRequests.at(-1).reject(new Error('playlist unavailable'))
await brokenDetail
assert.match(detailFields.error.value, /playlist unavailable/)
assert.equal(detailFields.isLoading.value, false)

console.log('favorite, creator and discovery collection menu routing tests passed')
