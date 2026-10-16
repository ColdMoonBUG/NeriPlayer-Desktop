import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import * as vue from 'vue'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const fontsPath = new URL('../src/modules/settings/fonts.ts', import.meta.url)
assert.ok(existsSync(fontsPath), 'appearance font controls must provide independent font stacks')

function load(source, dependencies = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)(name => {
    assert.ok(name in dependencies, `unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

const styleModule = load(await read('../src/modules/desktopLyrics/style.ts'))
const fonts = load(await read('../src/modules/settings/fonts.ts'), {
  '@/modules/desktopLyrics/style': styleModule,
})
assert.equal(fonts.fontFamilyStack(''), 'var(--font-family-default)')
assert.equal(fonts.fontFamilyStack('  思源黑体  '), '"思源黑体", var(--font-family-default)')
assert.equal(fonts.fontFamilyStack('"Inter";{}'), '"Inter", var(--font-family-default)')
assert.equal([...styleModule.sanitizeFontFamily('𠮷'.repeat(80))].length, 64)

const properties = new Map()
const root = { style: {
  setProperty: (key, value) => properties.set(key, value),
  removeProperty: key => properties.delete(key),
} }
fonts.applyFontSettings('KaiTi', '', root)
assert.equal(properties.get('--font-family'), '"KaiTi", var(--font-family-default)')
assert.equal(properties.get('--lyric-font-family'), 'var(--font-family-default)', 'default lyrics remain independent of the UI font')
assert.equal(properties.get('--font-display'), properties.get('--font-family'))
fonts.applyFontSettings('Inter', 'SimSun', root)
assert.equal(properties.get('--font-family'), '"Inter", var(--font-family-default)')
assert.equal(properties.get('--lyric-font-family'), '"SimSun", var(--font-family-default)')
fonts.applyFontSettings('', '', root)
assert.equal(properties.get('--font-family'), 'var(--font-family-default)')
assert.equal(properties.has('--font-display'), false, 'reset restores the original display font')
assert.equal(properties.has('--font-hand'), false)
console.log('PASS independent font stacks, sanitization, and default restoration')

const source = await read('../src/components/settings/FontFamilyControl.vue')
const script = compileScript(parse(source).descriptor, {
  id: 'font-family-control-test', genDefaultAs: 'component', inlineTemplate: true,
})
const compiled = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const select = {}
const dependencies = {
  vue,
  'vue-i18n': { useI18n: () => ({ t: key => key }) },
  '@/modules/settings/fonts': fonts,
  '@/modules/desktopLyrics/style': styleModule,
  '@/components/ui/CustomSelect.vue': { default: {
    props: ['modelValue', 'options', 'label'], emits: ['update:modelValue'],
    setup(props, { emit }) {
      select.props = props
      select.choose = value => emit('update:modelValue', value)
      return () => null
    },
  } },
}
const component = new Function('require', 'exports', `${compiled}\nreturn component`)(name => {
  assert.ok(name in dependencies, `unexpected dependency: ${name}`)
  return dependencies[name]
}, {})
const renderer = vue.createRenderer({
  createElement: type => ({ type, children: [], props: {} }),
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
const model = vue.ref('')
const updates = []
const app = renderer.createApp({ setup: () => () => vue.h(component, {
  modelValue: model.value, label: 'Lyrics font', previewText: '歌词 Aa 123', previewWeight: 850,
  'onUpdate:modelValue': value => { updates.push(value); model.value = value },
}) })
const tree = { children: [] }
app.mount(tree)
function find(predicate, node = tree) {
  if (predicate(node)) return node
  for (const child of node.children ?? []) {
    const result = find(predicate, child)
    if (result) return result
  }
}
try {
  assert.equal(select.props.modelValue, '')
  select.choose('__custom__')
  await vue.nextTick()
  assert.deepEqual(updates, [], 'opening custom entry must not save a placeholder or reset the current font')
  const input = find(node => node.type === 'input')
  assert.ok(input)
  assert.equal(input.props['aria-label'], 'Lyrics font')
  const event = { target: { value: '  自定义"字体;  ' } }
  input.props.onChange(event)
  await vue.nextTick()
  assert.equal(model.value, '自定义字体')
  assert.equal(event.target.value, '自定义字体')
  const preview = find(node => node.props?.class === 'font-preview')
  assert.equal(preview.props.style.fontFamily, '"自定义字体", var(--font-family-default)')
  assert.equal(preview.props.style.fontWeight, 850)
  select.choose('Inter')
  await vue.nextTick()
  assert.equal(model.value, 'Inter')
  assert.equal(find(node => node.type === 'input'), undefined)
  model.value = '另一种字体'
  await vue.nextTick()
  assert.equal(select.props.modelValue, '__custom__', 'imported custom fonts are editable')
  assert.ok(find(node => node.type === 'input'))
  select.choose('')
  await vue.nextTick()
  assert.equal(model.value, '')
  assert.equal(select.props.modelValue, '')
  console.log('PASS rendered font selector, custom entry, imported values, preview, and reset')
} finally {
  app.unmount()
}
