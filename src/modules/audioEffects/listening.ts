import { normalizeAudioEffectsSound, resetAudioEffectsSoundSection, type AudioEffectsSound } from './model'

export type ListeningControlKey = 'bass' | 'vocal' | 'brightness' | 'warmth' | 'space'
export type ListeningTuningValues = Record<ListeningControlKey, number>

export const LISTENING_CONTROLS = [
  { key: 'bass', field: 'bassDb', min: -100, scale: 12, neutral: 0 },
  { key: 'vocal', field: 'vocal', min: 0, scale: 1, neutral: 0 },
  { key: 'brightness', field: 'trebleDb', min: -100, scale: 12, neutral: 0 },
  { key: 'warmth', field: 'warmth', min: 0, scale: 1, neutral: 0 },
  { key: 'space', field: 'stereoWidth', min: -100, scale: 1, neutral: 1 },
] as const

function strength(value: number): number {
  const magnitude = Math.abs(value) / 100
  // 前半段留出更多细调空间，同时保留完整范围和连续的零点
  return Math.sign(value) * magnitude * (0.4 + 0.6 * magnitude)
}

function position(value: number): number {
  const magnitude = Math.min(1, Math.abs(value))
  return Math.sign(value) * (Math.sqrt(0.16 + 2.4 * magnitude) - 0.4) / 1.2 * 100
}

export function listeningTuningValues(sound: AudioEffectsSound): ListeningTuningValues {
  const normalized = normalizeAudioEffectsSound(sound)
  return Object.fromEntries(LISTENING_CONTROLS.map(control => {
    const enabled = control.key === 'space' ? normalized.spaceEnabled : normalized.toneEnabled
    return [control.key, enabled ? Number(position((normalized[control.field] - control.neutral) / control.scale).toFixed(3)) : 0]
  })) as ListeningTuningValues
}

export function applyListeningTuning(sound: AudioEffectsSound, key: ListeningControlKey, value: number): AudioEffectsSound {
  let next = normalizeAudioEffectsSound(sound)
  const control = LISTENING_CONTROLS.find(item => item.key === key)
  if (!control || !Number.isFinite(value)) return next
  const section = key === 'space' ? 'space' : 'tone'
  if (!next[section === 'space' ? 'spaceEnabled' : 'toneEnabled']) next = resetAudioEffectsSoundSection(next, section)
  const bounded = Math.max(control.min, Math.min(100, value))
  next[control.field] = control.neutral + control.scale * strength(bounded)
  if (key === 'space') {
    next.spaceEnabled = true
    next.mono = false
  } else {
    next.toneEnabled = true
    if (key === 'vocal' && bounded > 0) next.vocalRemoval = 0
  }
  return protectListeningSound(next)
}

export function protectListeningSound(sound: AudioEffectsSound): AudioEffectsSound {
  let next = normalizeAudioEffectsSound(sound)
  // 保护只开启限幅，不恢复曾被关闭的压缩器或输出增益
  if (!next.dynamicsEnabled) next = resetAudioEffectsSoundSection(next, 'dynamics')
  next.dynamicsEnabled = true
  next.limiterEnabled = true
  next.limiterCeilingDb = Math.min(-0.5, next.limiterCeilingDb)
  return next
}

export function resetListeningTuning(sound: AudioEffectsSound): AudioEffectsSound {
  const next = normalizeAudioEffectsSound(sound)
  for (const control of LISTENING_CONTROLS) next[control.field] = control.neutral
  return next
}
