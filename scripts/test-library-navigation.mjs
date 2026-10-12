import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as Vue from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import ts from 'typescript'

const source = await readFile(new URL('../src/views/LibraryView.vue', import.meta.url), 'utf8')
const rootTemplate = parse(source).descriptor.template.ast.children.find(node => node.tag === 'div')
const header = rootTemplate.children.find(node => node.tag === 'header')
const template = compileTemplate({ source: header.loc.source, filename: 'LibraryView.vue', id: 'library-navigation-test' })
assert.deepEqual(template.errors, [])
const exports = {}
new Function('require', 'exports', ts.transpileModule(template.code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(name => { assert.equal(name, 'vue'); return Vue }, exports)

const main = ts.createSourceFile('main.ts', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
let routesSource
function inspect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(main) === 'createRouter') {
    routesSource = node.arguments[0].properties.find(property => property.name?.getText(main) === 'routes').initializer.getText(main)
  }
  ts.forEachChild(node, inspect)
}
inspect(main)
assert.ok(routesSource, 'the navigation test must use the application route definitions')
const routes = new Function(`return (${routesSource})`)()
const messages = {}
for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
  messages[locale] = JSON.parse(await readFile(new URL(`../src/i18n/${locale}.json`, import.meta.url), 'utf8'))
}
const renderer = Vue.createRenderer({
  createElement: type => ({ type, children: [], props: {} }),
  createText: text => ({ type: '#text', text, children: [] }),
  createComment: text => ({ type: '#comment', text, children: [] }),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => { node.text = text; node.children = [] },
  patchProp: (node, key, _previous, value) => { node.props[key] = value },
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    node.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node)
  },
  remove(node) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null },
})
function descendants(node) { return [node, ...node.children.flatMap(descendants)] }
function text(node) { return (node.type === '#comment' ? '' : node.text || '') + node.children.map(text).join('') }
async function mountHeader(locale = 'zh-CN', activeTab = 0) {
  const router = createRouter({
    history: createMemoryHistory(),
    // 此回归验证导航契约，路由页面自身由各页面测试覆盖
    routes: routes.map(route => ({ ...route, component: { render: () => null } })),
  })
  await router.push({ name: 'library' })
  const actions = []
  const state = Vue.reactive({
    router, activeTab, localCategory: 'playlists', isMultiSelectMode: false,
    t: key => key.split('.').reduce((value, part) => value?.[part], messages[locale]) || key,
    enterMultiSelect() { state.isMultiSelectMode = true },
    selectAll: () => actions.push('all'), invertSelection: () => actions.push('invert'),
    exitMultiSelect() { state.isMultiSelectMode = false },
  })
  const cache = []
  const app = renderer.createApp({ setup: () => () => exports.render(state, cache) })
  const root = { children: [] }
  app.mount(root)
  return {
    router, state, actions,
    buttons: () => descendants(root).filter(node => node.type === 'button'),
    stop: () => app.unmount(),
  }
}
let total = 0, failed = 0
async function test(name, run) {
  total++
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`) }
}

await test('every library tab exposes Recent plays after statistics and navigates within the library section', async () => {
  for (let tab = 0; tab < 6; tab++) {
    const page = await mountHeader('zh-CN', tab)
    try {
      const buttons = page.buttons()
      const stats = buttons.findIndex(button => text(button).trim() === 'bar_chart')
      const recent = buttons.findIndex(button => text(button).trim() === 'history')
      assert.equal(recent, stats + 1, 'Recent plays belongs beside statistics, matching the Android library actions')
      assert.ok(recent >= 0, 'the library must expose a Recent plays entry')
      await buttons[recent].props.onClick()
      assert.equal(page.router.currentRoute.value.name, 'recent')
      assert.equal(page.router.currentRoute.value.path, '/recent')
      assert.equal(page.router.currentRoute.value.meta.section, 'library')
      assert.equal(page.state.activeTab, tab, 'the entry must preserve the selected library tab')
    } finally { page.stop() }
  }
})

await test('Recent plays exposes the existing translated title and accessible name in every locale', async () => {
  for (const locale of ['zh-CN', 'zh-TW', 'en', 'ja']) {
    const page = await mountHeader(locale)
    try {
      const recent = page.buttons().find(button => text(button).trim() === 'history')
      assert.ok(recent, 'the entry must remain discoverable in every locale')
      assert.equal(recent.props.title, messages[locale].home.recent_play)
      assert.equal(recent.props['aria-label'], messages[locale].home.recent_play)
    } finally { page.stop() }
  }
})

await test('playlist selection keeps its controls and restores the Recent plays entry when selection ends', async () => {
  const page = await mountHeader()
  try {
    page.buttons().find(button => text(button).trim() === 'checklist').props.onClick()
    await Vue.nextTick()
    assert.equal(page.buttons().some(button => text(button).trim() === 'history'), false)
    page.buttons().find(button => text(button).trim() === 'select_all').props.onClick()
    page.buttons().find(button => text(button).trim() === 'flip').props.onClick()
    assert.deepEqual(page.actions, ['all', 'invert'])
    page.buttons().find(button => text(button).trim() === 'close').props.onClick()
    await Vue.nextTick()
    assert.ok(page.buttons().find(button => text(button).trim() === 'history'))
  } finally { page.stop() }
})

console.log(`Library navigation regressions: ${total - failed} passed, ${failed} failed`)
if (failed) process.exitCode = 1
