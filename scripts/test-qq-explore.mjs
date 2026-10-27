import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// 探索页 QQ 分栏的默认推荐：后端命令 + 前端接线 + 四语言文案，一处缺就红。
const read = path => readFile(new URL(path, import.meta.url), 'utf8')

const exploreCmd = await read('../src-tauri/src/commands/explore_cmd.rs')
const mainRs = await read('../src-tauri/src/main.rs')
const exploreView = await read('../src/views/ExploreView.vue')

// 两个命令都要注册，前端才拿得到
assert.match(mainRs, /explore_cmd::get_qq_explore,/)
assert.match(mainRs, /explore_cmd::get_qq_explore_charts,/)

// 歌单条目必须带 platform: "qq"，ExploreView 的 collectionRoute 靠它路由到 qq-playlist
assert.match(exploreCmd, /"playlists" =>[\s\S]*?platform: "qq"\.into\(\)/)
assert.match(exploreCmd, /"newsongs" =>/)
// 未知 kind 必须显式报错，不能静默返回空页
assert.match(exploreCmd, /Unsupported QQ Music explore kind/)
// 单个榜单失败要跳过而不是整页失败
assert.match(exploreCmd, /Err\(_\) => continue,/)
// 榜单 id 来自分类接口，不写死榜号
assert.match(exploreCmd, /get_category\(\)[\s\S]*?get_web_detail\(top_id, 0, QQ_EXPLORE_CHART_SONG_LIMIT, &chart\.period\)/)
// 封面必须在移动 singer/album 之前取，否则是部分移动后借用
assert.match(exploreCmd, /let cover_url = https\(&song\.cover_url\(300\)\);/)

// 前端三路并发、各自吞错，且按 kind 过滤
for (const kind of ['playlists', 'newsongs']) {
  assert.ok(
    exploreView.includes(`invoke<{ items: ExploreItem[] }>('get_qq_explore', { kind: '${kind}' }`),
    `ExploreView must call get_qq_explore(kind='${kind}')`,
  )
}
assert.match(exploreView, /Promise\.all\(\[\s*\n\s*invoke<\{ items: ExploreItem\[\] \}>\('get_qq_explore'/)
assert.match(exploreView, /\.catch\(\(\) => \[\] as QqChartShelf\[\]\)/)
assert.match(exploreView, /item\.kind === 'playlist'\)/)
assert.match(exploreView, /item\.kind === 'song'\)/)
// 切到 QQ tab 和直接挂载在 QQ tab 都要加载
assert.match(exploreView, /if \(tab === 'qq'\) void loadQqExplore\(\)/)
assert.match(exploreView, /if \(activeTab\.value === 'qq'\) void loadQqExplore\(\)/)
// 歌单卡片点击走已有的 collectionRoute，不能新造一套路由
assert.match(exploreView, /@click="openCollection\(pl\)"/)
assert.match(exploreView, /collectionWebUrl\('qq', 'playlist', pl\.id\)/)

// 四语言都要有新 shelf 文案，否则切语言会露出 key 原文
const keys = ['qq_shelf_newsongs_title', 'qq_shelf_newsongs_subtitle']
for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
  const messages = JSON.parse(await read(`../src/i18n/${locale}.json`))
  for (const key of keys) {
    const value = messages.explore?.[key]
    assert.ok(typeof value === 'string' && value.trim().length > 0, `${locale} missing explore.${key}`)
  }
}

console.log('QQ Music explore recommendation wiring tests passed')
