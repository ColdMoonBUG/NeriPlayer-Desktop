import { readFile } from 'node:fs/promises'
import ts from 'typescript'

export async function loadAudioEffectsModel() {
  const source = await readFile(new URL('../src/modules/audioEffects/model.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('exports', compiled)(exports)
  return exports
}

export async function loadListeningTuning() {
  const model = await loadAudioEffectsModel()
  const source = await readFile(new URL('../src/modules/audioEffects/listening.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('exports', 'require', compiled)(exports, () => model)
  return exports
}
