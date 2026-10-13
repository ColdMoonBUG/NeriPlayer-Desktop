<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isTauri } from '@tauri-apps/api/core'
import { usePlayerStore } from '@/stores/player'
import {
  AUDIO_EFFECT_PRESETS, GRAPHIC_EQ_FREQUENCIES, SOUND_CONTROLS,
  type AudioEffectsSound, type ParametricEqBand, type SpeakerOptimizerSettings,
} from '@/modules/audioEffects/model'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import DspNumberControl from './DspNumberControl.vue'
import DspFrequencyGraph from './DspFrequencyGraph.vue'

const player = usePlayerStore()
const { t } = useI18n()
const sound = computed(() => player.audioEffectsProfile.sound)
const currentOutput = computed(() => player.audioEffectsOutputDevice === 'system_default' ? t('dsp.system_default') : player.audioEffectsOutputDevice)
const category = ref('all')
const categories = ['all', 'style', 'tone', 'scene', 'device', 'user']
const presetOptions = computed(() => [
  ...AUDIO_EFFECT_PRESETS.filter(preset => preset.id !== 'custom' && (category.value === 'all' || preset.category === category.value))
    .map(preset => ({ value: preset.id, label: t(`dsp.presets.${preset.id}`) })),
  ...(category.value === 'all' || category.value === 'user' ? player.audioEffects.userPresets.map(preset => ({ value: preset.id, label: preset.name })) : []),
])
const presetLabel = computed(() => {
  const id = player.audioEffectsProfile.presetId
  if (id === 'custom') return t('dsp.manual')
  return player.audioEffects.userPresets.find(preset => preset.id === id)?.name
    ?? (AUDIO_EFFECT_PRESETS.some(preset => preset.id === id) ? t(`dsp.presets.${id}`) : t('dsp.manual'))
})
const currentUserPreset = computed(() => player.audioEffects.userPresets.find(preset => preset.id === player.audioEffectsProfile.presetId))
const presetName = ref('')
const presetText = ref('')
const autoEqText = ref('')
const feedback = ref('')
const feedbackError = ref(false)
const peqTypes = ['peak', 'low_shelf', 'high_shelf', 'low_pass', 'high_pass', 'notch', 'band_pass']
const sections = ['tone', 'space', 'dynamics'] as const
const soundSwitches = { space: ['mono', 'swapChannels'], dynamics: ['compressorEnabled', 'limiterEnabled'], tone: [] } as const
const rateControls = [
  { key: 'speed', title: 'player.playback_speed', desc: 'settings.audio_effects_speed_desc', min: 0.1, max: 4 },
  { key: 'pitch', title: 'player.pitch', desc: 'settings.audio_effects_pitch_desc', min: 0.25, max: 2 },
] as const
const speedPresets = [0.5, 0.75, 0.95, 1, 1.05, 1.25, 1.5, 2]
const speakerControls = [
  { key: 'protectionHz', min: 0, max: 400, step: 10, unit: 'Hz', scale: 1 },
  ...(['bassHarmonics', 'loudness', 'clarity', 'stereoExpand'] as const).map(key => ({ key, min: 0, max: 1, step: 0.01, unit: '%', scale: 100 })),
] as const

interface RuntimeStats {
  active: boolean
  cpuLoadPercent: number
  limiterReductionDb: number
  compressorReductionDb: number
  sampleRate: number
  nativeAvailable: boolean
  inactiveReason: string | null
}
const stats = ref<RuntimeStats | null>(null)
let statsTimer: ReturnType<typeof setInterval> | undefined
let mounted = false
let statsPending = false
async function refreshStats() {
  if (!isTauri() || statsPending) return
  statsPending = true
  try {
    const result = await player.refreshAudioEffectsStats()
    if (mounted) stats.value = result
  } catch {
    if (mounted) stats.value = null
  } finally { statsPending = false }
}
onMounted(() => { mounted = true; void refreshStats(); statsTimer = setInterval(() => void refreshStats(), 1000) })
onUnmounted(() => { mounted = false; clearInterval(statsTimer) })

function changeSound(key: keyof AudioEffectsSound, value: number | boolean) {
  player.updateAudioEffectsSound({ [key]: value })
}
function toggleSound(key: keyof AudioEffectsSound, enabled: boolean) {
  if (enabled && !player.audioEffectsProfile.enabled) player.updateAudioEffectsProfile({ enabled: true })
  player.updateAudioEffectsSound({ [key]: enabled, ...(key === 'parametricEnabled' && enabled ? { equalizerEnabled: true } : {}) })
}
function changeBand(index: number, value: number) {
  const bands = [...sound.value.equalizerBandsDb]
  bands[index] = value
  player.updateAudioEffectsSound({ equalizerBandsDb: bands })
}
function changePeq(index: number, patch: Partial<ParametricEqBand>) {
  player.updateAudioEffectsSound({ parametricBands: sound.value.parametricBands.map((band, position) => position === index ? { ...band, ...patch } : band) })
}
function addPeq() {
  if (sound.value.parametricBands.length >= 10) return
  if (!player.audioEffectsProfile.enabled) player.updateAudioEffectsProfile({ enabled: true })
  player.updateAudioEffectsSound({ equalizerEnabled: true, parametricEnabled: true, parametricBands: [...sound.value.parametricBands, { enabled: true, type: 'peak', frequencyHz: 1000, gainDb: 0, q: 0.707 }] })
}
function removePeq(index: number) {
  player.updateAudioEffectsSound({ parametricBands: sound.value.parametricBands.filter((_, position) => position !== index) })
}
function changeSpeaker(key: keyof SpeakerOptimizerSettings, value: number | string | boolean) {
  if (key === 'enabled' && value === true && !player.audioEffectsProfile.enabled) player.updateAudioEffectsProfile({ enabled: true })
  player.updateAudioEffects({ speaker: { ...player.audioEffects.speaker, [key]: value } })
}
function setRate(key: 'speed' | 'pitch', value: number) {
  if (key === 'speed') player.setSpeed(value)
  else player.setPitch(value)
}
function report(message: string, error = false) { feedback.value = message; feedbackError.value = error }
function savePreset() {
  try { player.saveAudioEffectsPreset(presetName.value.trim()); presetName.value = ''; report(t('dsp.saved')) }
  catch (error) { report(String(error), true) }
}
function importPreset() {
  try { player.importAudioEffectsPreset(presetText.value); report(t('dsp.imported')) }
  catch (error) { report(String(error), true) }
}
function exportPreset() {
  try { presetText.value = player.exportAudioEffectsPreset(currentUserPreset.value?.id); report(t('dsp.exported')) }
  catch (error) { report(String(error), true) }
}
function importAutoEq() {
  try {
    const result = player.importAutoEq(autoEqText.value)
    report([t('dsp.autoeq_result', { imported: result.imported, skipped: result.skipped }), ...result.warnings].join(' '))
  } catch (error) { report(String(error), true) }
}
async function readImportFile(event: Event, target: 'preset' | 'autoeq') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (file.size > 1024 * 1024) throw new Error(t('dsp.file_too_large'))
    const text = await file.text()
    if (target === 'preset') presetText.value = text
    else autoEqText.value = text
  } catch (error) { report(String(error), true) }
  finally { input.value = '' }
}
</script>

<template>
  <div class="audio-effects-settings">
    <p class="effects-intro">{{ t('settings.audio_effects_desc') }}</p>
    <div class="setting-card effects-master">
      <div class="effects-heading">
        <div class="setting-info"><div class="setting-title">{{ t('dsp.enabled') }}</div><div class="setting-desc">{{ t('dsp.enabled_help') }}</div></div>
        <label class="m3-switch"><input type="checkbox" :checked="player.audioEffectsProfile.enabled" :aria-label="t('dsp.enabled')"
          @change="player.updateAudioEffectsProfile({ enabled: ($event.target as HTMLInputElement).checked })" /><span class="track"><span class="thumb"></span></span></label>
      </div>
      <div class="effects-toolbar">
        <button :class="{ active: player.audioEffectsProfile.enabled }" :aria-pressed="player.audioEffectsProfile.enabled" @click="player.updateAudioEffectsProfile({ enabled: !player.audioEffectsProfile.enabled })">{{ t(player.audioEffectsProfile.enabled ? 'dsp.compare_original' : 'dsp.compare_effect') }}</button>
        <span class="output-label">{{ t('dsp.current_output', { name: currentOutput }) }}</span>
      </div>
    </div>

    <details class="effects-section" open>
      <summary>{{ t('dsp.preset_section') }}</summary>
      <div class="effects-content">
        <div class="effects-presets"><button v-for="item in categories" :key="item" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ t(`dsp.categories.${item}`) }}</button></div>
        <CustomSelect :model-value="player.audioEffectsProfile.presetId" :selected-label="presetLabel" :options="presetOptions" :label="t('player.eq_preset')" @update:model-value="player.setAudioEffectsPreset($event)" />
        <p class="setting-desc">{{ t('dsp.preset_help') }}</p>
        <div class="effects-toolbar"><input v-model="presetName" class="effects-text-input" maxlength="24" :placeholder="t('dsp.preset_name')" :aria-label="t('dsp.preset_name')" />
          <button :disabled="!presetName.trim() || player.audioEffects.userPresets.length >= 50" @click="savePreset">{{ t('dsp.save_preset') }}</button>
          <button v-if="currentUserPreset" class="danger" @click="player.deleteAudioEffectsPreset(currentUserPreset.id)">{{ t('dsp.delete_preset') }}</button></div>
        <details class="effects-import"><summary>{{ t('dsp.preset_transfer') }}</summary>
          <textarea v-model="presetText" :aria-label="t('dsp.preset_json')" :placeholder="t('dsp.preset_json')" spellcheck="false"></textarea>
          <div class="effects-toolbar"><label class="file-button">{{ t('dsp.choose_file') }}<input type="file" accept=".json,application/json" @change="readImportFile($event, 'preset')" /></label>
            <button :disabled="!presetText.trim()" @click="importPreset">{{ t('dsp.import_preset') }}</button><button @click="exportPreset">{{ t('dsp.export_preset') }}</button></div>
        </details>
      </div>
    </details>

    <details class="effects-section" open>
      <summary>{{ t('dsp.equalizer_section') }}<button @click.prevent="player.resetAudioEffectsSection('equalizer')">{{ t('dsp.reset_section') }}</button></summary>
      <div class="effects-content">
        <DspFrequencyGraph :sound="sound" />
        <DspNumberControl v-for="control in SOUND_CONTROLS.filter(item => item.section === 'equalizer')" :key="control.key" :label="t(`dsp.controls.${control.key}`)" :help="t(`dsp.help.${control.key}`)" :model-value="sound[control.key]" :min="control.min" :max="control.max" :step="control.step" :unit="control.unit" @update:model-value="changeSound(control.key, $event)" />
        <div class="effects-heading"><div class="setting-info"><div class="setting-title">{{ t('dsp.graphic_eq') }}</div><div class="setting-desc">{{ t('settings.audio_effects_eq_desc') }}</div></div>
          <label class="m3-switch"><input type="checkbox" :checked="sound.equalizerEnabled" :aria-label="t('dsp.graphic_eq')" @change="toggleSound('equalizerEnabled', ($event.target as HTMLInputElement).checked)" /><span class="track"><span class="thumb"></span></span></label></div>
        <div class="effects-grid effects-eq-bands">
          <DspNumberControl v-for="(frequency, index) in GRAPHIC_EQ_FREQUENCIES" :key="frequency" class="effects-band" :label="t('settings.audio_effects_band', { frequency })" :model-value="sound.equalizerBandsDb[index] ?? 0" :min="-12" :max="12" :step="0.1" unit="dB" @update:model-value="changeBand(index, $event)" />
        </div>
        <div class="effects-heading"><div class="setting-info"><div class="setting-title">{{ t('dsp.parametric_eq') }}</div><div class="setting-desc">{{ t('dsp.parametric_help') }}</div></div>
          <label class="m3-switch"><input type="checkbox" :checked="sound.parametricEnabled" :aria-label="t('dsp.parametric_eq')" @change="toggleSound('parametricEnabled', ($event.target as HTMLInputElement).checked)" /><span class="track"><span class="thumb"></span></span></label></div>
        <div v-for="(band, index) in sound.parametricBands" :key="index" class="peq-band">
          <div class="effects-toolbar"><strong>{{ t('dsp.filter_number', { number: index + 1 }) }}</strong>
            <label class="peq-enabled"><input type="checkbox" :checked="band.enabled" :aria-label="t('dsp.filter_enabled', { number: index + 1 })" @change="changePeq(index, { enabled: ($event.target as HTMLInputElement).checked })" />{{ t('dsp.filter_on') }}</label>
            <button class="danger" :aria-label="t('dsp.remove_filter', { number: index + 1 })" @click="removePeq(index)">{{ t('dsp.remove') }}</button></div>
          <CustomSelect :model-value="band.type" :options="peqTypes.map(type => ({ value: type, label: t(`dsp.filters.${type}`) }))" :label="t('dsp.filter_type')" @update:model-value="changePeq(index, { type: $event as ParametricEqBand['type'] })" />
          <div class="effects-grid">
            <DspNumberControl :label="t('dsp.filter_frequency', { number: index + 1 })" :model-value="band.frequencyHz" :min="20" :max="20000" :step="1" unit="Hz" @update:model-value="changePeq(index, { frequencyHz: $event })" />
            <DspNumberControl v-if="['peak', 'low_shelf', 'high_shelf'].includes(band.type)" :label="t('dsp.filter_gain', { number: index + 1 })" :model-value="band.gainDb" :min="-30" :max="24" :step="0.1" unit="dB" @update:model-value="changePeq(index, { gainDb: $event })" />
            <DspNumberControl :label="t('dsp.filter_q', { number: index + 1 })" :model-value="band.q" :min="0.1" :max="20" :step="0.001" unit="Q" @update:model-value="changePeq(index, { q: $event })" />
          </div>
        </div>
        <button :disabled="sound.parametricBands.length >= 10" class="effects-add" @click="addPeq">{{ t('dsp.add_filter') }} ({{ sound.parametricBands.length }}/10)</button>
        <details class="effects-import"><summary>{{ t('dsp.autoeq') }}</summary><p class="setting-desc">{{ t('dsp.autoeq_help') }}</p>
          <textarea v-model="autoEqText" :aria-label="t('dsp.autoeq_text')" :placeholder="t('dsp.autoeq_text')" spellcheck="false"></textarea>
          <div class="effects-toolbar"><label class="file-button">{{ t('dsp.choose_file') }}<input type="file" accept=".txt,.csv,text/plain,text/csv" @change="readImportFile($event, 'autoeq')" /></label><button :disabled="!autoEqText.trim()" @click="importAutoEq">{{ t('dsp.apply_autoeq') }}</button></div>
        </details>
      </div>
    </details>

    <details v-for="section in sections" :key="section" class="effects-section">
      <summary>{{ t(`dsp.${section}_section`) }}<button @click.prevent="player.resetAudioEffectsSection(section)">{{ t('dsp.reset_section') }}</button></summary>
      <div class="effects-content">
        <div class="effects-heading"><div class="setting-info"><div class="setting-title">{{ t(`dsp.${section}_section`) }}</div><div class="setting-desc">{{ t(`dsp.${section}_help`) }}</div></div>
          <label class="m3-switch"><input type="checkbox" :checked="sound[`${section}Enabled`]" :aria-label="t(`dsp.${section}_section`)" @change="toggleSound(`${section}Enabled`, ($event.target as HTMLInputElement).checked)" /><span class="track"><span class="thumb"></span></span></label></div>
        <div v-for="key in soundSwitches[section]" :key="key" class="effects-heading setting-card">
          <div class="setting-info"><div class="setting-title">{{ t(`dsp.controls.${key}`) }}</div><div class="setting-desc">{{ t(`dsp.help.${key}`) }}</div></div>
          <label class="m3-switch"><input type="checkbox" :checked="sound[key]" :aria-label="t(`dsp.controls.${key}`)" @change="toggleSound(key, ($event.target as HTMLInputElement).checked)" /><span class="track"><span class="thumb"></span></span></label>
        </div>
        <div class="effects-grid">
          <DspNumberControl v-for="control in SOUND_CONTROLS.filter(item => item.section === section)" :key="control.key" :label="t(`dsp.controls.${control.key}`)" :help="t(`dsp.help.${control.key}`)" :model-value="sound[control.key]" :min="control.min" :max="control.max" :step="control.step" :unit="control.unit === 'percent' ? '%' : control.unit === 'ratio' ? 'x' : control.unit" :scale="control.unit === 'percent' ? 100 : 1" @update:model-value="changeSound(control.key, $event)" />
        </div>
      </div>
    </details>

    <details class="effects-section">
      <summary>{{ t('dsp.speaker_section') }}<button @click.prevent="player.resetAudioEffectsSection('speaker')">{{ t('dsp.reset_section') }}</button></summary>
      <div class="effects-content"><div class="effects-heading"><div class="setting-info"><div class="setting-title">{{ t('dsp.speaker_section') }}</div><div class="setting-desc">{{ t('dsp.speaker_help') }}</div></div>
        <label class="m3-switch"><input type="checkbox" :checked="player.audioEffects.speaker.enabled" :aria-label="t('dsp.speaker_section')" @change="changeSpeaker('enabled', ($event.target as HTMLInputElement).checked)" /><span class="track"><span class="thumb"></span></span></label></div>
        <CustomSelect :model-value="player.audioEffects.speaker.size" :options="['phone', 'tablet', 'large'].map(size => ({ value: size, label: t(`dsp.speaker_sizes.${size}`) }))" :label="t('dsp.speaker_size')" @update:model-value="changeSpeaker('size', $event)" />
        <div class="effects-grid"><DspNumberControl v-for="control in speakerControls" :key="control.key" :label="t(`dsp.speaker_controls.${control.key}`)" :help="t(`dsp.speaker_help_controls.${control.key}`)" :model-value="Number(player.audioEffects.speaker[control.key])" :min="control.min" :max="control.max" :step="control.step" :unit="control.unit" :scale="control.scale" @update:model-value="changeSpeaker(control.key, $event)" /></div>
      </div>
    </details>

    <details class="effects-section">
      <summary>{{ t('dsp.rate_section') }}<button @click.prevent="player.setSpeed(1); player.setPitch(1); player.setVinylEffect(false)">{{ t('dsp.reset_section') }}</button></summary>
      <div class="effects-content"><div class="effects-heading setting-card"><div class="setting-info"><div class="setting-title">{{ t('player.vinyl_effect') }}</div><div class="setting-desc">{{ t('dsp.vinyl_help') }}</div></div>
        <label class="m3-switch"><input type="checkbox" :checked="player.vinylEffectEnabled" :aria-label="t('player.vinyl_effect')" @change="player.setVinylEffect(($event.target as HTMLInputElement).checked)" /><span class="track"><span class="thumb"></span></span></label></div>
        <p v-if="player.vinylEffectEnabled" class="setting-desc">{{ t('dsp.vinyl_following', { value: player.effectivePlaybackPitch().toFixed(2) }) }}</p>
        <template v-for="control in rateControls" :key="control.key"><DspNumberControl v-if="control.key === 'speed' || !player.vinylEffectEnabled" :label="t(control.title)" :help="t(control.desc)" :model-value="control.key === 'speed' ? player.playbackSpeed : player.playbackPitch" :min="control.min" :max="control.max" :step="0.05" unit="x" @update:model-value="setRate(control.key, $event)" /></template>
        <div class="effects-presets"><button v-for="value in speedPresets" :key="value" :aria-label="`${t('player.playback_speed')} ${value}x`" :aria-pressed="player.playbackSpeed === value" :class="{ active: player.playbackSpeed === value }" @click="player.setSpeed(value)">{{ value }}x</button></div>
        <DspNumberControl :label="t('player.loudness_gain')" :help="t('settings.audio_effects_gain_desc')" :model-value="player.loudnessGainMb" :min="0" :max="1500" :step="50" :scale="0.01" unit="dB" @update:model-value="player.setLoudnessGain($event)" />
      </div>
    </details>

    <details class="effects-section">
      <summary>{{ t('dsp.advanced_section') }}</summary>
      <div class="effects-content"><div class="effects-heading setting-card"><div class="setting-info"><div class="setting-title">{{ t('dsp.per_output') }}</div><div class="setting-desc">{{ t('dsp.per_output_help', { name: currentOutput }) }}</div></div>
        <label class="m3-switch"><input type="checkbox" :checked="player.audioEffects.perOutputEnabled" :aria-label="t('dsp.per_output')" @change="player.updateAudioEffects({ perOutputEnabled: ($event.target as HTMLInputElement).checked })" /><span class="track"><span class="thumb"></span></span></label></div>
        <div class="effects-heading setting-card"><div class="setting-info"><div class="setting-title">{{ t('dsp.auto_headroom') }}</div><div class="setting-desc">{{ t('dsp.auto_headroom_help') }}</div></div>
          <label class="m3-switch"><input type="checkbox" :checked="player.audioEffects.autoHeadroom" :aria-label="t('dsp.auto_headroom')" @change="player.updateAudioEffects({ autoHeadroom: ($event.target as HTMLInputElement).checked })" /><span class="track"><span class="thumb"></span></span></label></div>
        <div class="setting-card"><div class="setting-title">{{ t('dsp.quality') }}</div><p class="setting-desc">{{ t('dsp.quality_help') }}</p>
          <CustomSelect :model-value="player.audioEffects.powerMode" :options="['eco', 'balanced', 'high'].map(mode => ({ value: mode, label: t(`dsp.quality_modes.${mode}`) }))" :label="t('dsp.quality')" @update:model-value="player.updateAudioEffects({ powerMode: $event as 'eco' | 'balanced' | 'high' })" /></div>
        <div class="setting-card effects-stats"><div class="setting-title">{{ t('dsp.runtime') }}</div>
          <template v-if="stats"><span>{{ t(stats.active ? 'dsp.runtime_active' : 'dsp.runtime_bypass') }}</span><span v-if="stats.inactiveReason">{{ t(`dsp.reasons.${stats.inactiveReason}`) }}</span>
            <div class="effects-stats-grid"><span>{{ t('dsp.cpu') }} <b>{{ stats.cpuLoadPercent.toFixed(2) }}%</b></span><span>{{ t('dsp.sample_rate') }} <b>{{ stats.sampleRate }} Hz</b></span><span>{{ t('dsp.compressor_reduction') }} <b>{{ stats.compressorReductionDb.toFixed(1) }} dB</b></span><span>{{ t('dsp.limiter_reduction') }} <b>{{ stats.limiterReductionDb.toFixed(1) }} dB</b></span></div>
          </template><p v-else class="setting-desc">{{ t('dsp.runtime_unavailable') }}</p></div>
        <div class="setting-card"><div class="setting-title">{{ t('player.reset_effects') }}</div><p class="setting-desc">{{ t('settings.audio_effects_reset_desc') }}</p><button class="danger" @click="player.resetAudioEffects()">{{ t('player.reset_effects') }}</button></div>
      </div>
    </details>
    <p v-if="feedback" class="effects-feedback" :class="{ error: feedbackError }" role="status" aria-live="polite">{{ feedback }}</p>
  </div>
</template>

<style scoped lang="scss">
.audio-effects-settings { min-width: 0; }
.effects-intro { margin: 0 4px 14px; color: var(--md-on-surface-variant); font-size: 12px; line-height: 1.6; }
.setting-card { padding: 16px; border-radius: var(--radius-md); background: var(--md-surface-container); }
.setting-title { font-size: 14px; font-weight: 500; }
.setting-desc { margin: 4px 0 0; color: var(--md-on-surface-variant); font-size: 12px; line-height: 1.6; }
.effects-heading, .effects-toolbar { display: flex; gap: 12px; align-items: center; }
.effects-heading { justify-content: space-between; }
.effects-toolbar { flex-wrap: wrap; }
.effects-master { margin-bottom: 10px; }
.effects-master .effects-toolbar { margin-top: 12px; }
.setting-info { flex: 1; min-width: 0; }
.output-label { font-size: 11px; color: var(--md-on-surface-variant); overflow-wrap: anywhere; }
.effects-section { margin: 10px 0; border: 1px solid var(--md-outline-variant); border-radius: var(--radius-lg); overflow: hidden; }
.effects-section > summary { display: flex; align-items: center; gap: 8px; padding: 14px 16px; cursor: pointer; font-size: 14px; font-weight: 600; list-style: none; background: var(--md-surface-container-low); }
.effects-section > summary::before { content: 'chevron_right'; font-family: 'Material Symbols Rounded'; font-size: 22px; font-weight: 400; transition: transform .15s; }
.effects-section[open] > summary::before { transform: rotate(90deg); }
summary:focus-visible { outline: 2px solid var(--md-primary); outline-offset: -3px; }
.effects-section > summary > button { margin-left: auto; font-weight: 400; }
.effects-content { display: flex; flex-direction: column; gap: 14px; padding: 16px; }
.effects-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.effects-presets { display: flex; flex-wrap: wrap; gap: 6px; }
button, .file-button { padding: 8px 12px; border: 1px solid var(--md-outline-variant); border-radius: var(--radius-sm); background: transparent; color: var(--md-on-surface-variant); font: inherit; font-size: 12px; cursor: pointer; text-align: center; }
button:hover, .file-button:hover { background: var(--md-surface-container-highest); }
button:focus-visible, .file-button:focus-within { outline: 2px solid var(--md-primary); outline-offset: 2px; }
button.active { border-color: transparent; background: var(--md-primary-container); color: var(--md-on-primary-container); }
button:disabled { opacity: .45; cursor: default; }
button.danger { color: var(--md-error); }
.effects-add { align-self: flex-start; }
.peq-band { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--md-outline-variant); border-radius: var(--radius-md); }
.peq-band strong { font-size: 13px; font-weight: 500; }
.peq-band .effects-toolbar button { margin-left: auto; }
.peq-enabled { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
.peq-enabled input { accent-color: var(--md-primary); }
.effects-text-input, textarea { border: 1px solid var(--md-outline-variant); border-radius: var(--radius-sm); background: var(--md-surface-container); color: var(--md-on-surface); font: inherit; font-size: 12px; padding: 10px; }
.effects-text-input { flex: 1; min-width: 140px; }
.effects-text-input:focus, textarea:focus { outline: 2px solid var(--md-primary); outline-offset: 1px; }
.effects-import summary { color: var(--md-primary); font-size: 12px; cursor: pointer; padding: 6px 0; }
textarea { display: block; box-sizing: border-box; width: 100%; min-height: 130px; resize: vertical; margin: 10px 0; font-family: var(--font-family-mono, monospace); line-height: 1.5; }
.file-button { position: relative; overflow: hidden; }
.file-button input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
.effects-stats { font-size: 12px; color: var(--md-on-surface-variant); }
.effects-stats > span { display: inline-block; margin: 8px 10px 0 0; }
.effects-stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.effects-stats-grid b { color: var(--md-on-surface); font-weight: 500; font-variant-numeric: tabular-nums; }
.effects-feedback { position: sticky; bottom: 12px; margin: 12px 0 0; padding: 12px; border-radius: var(--radius-md); color: var(--md-on-primary-container); background: var(--md-primary-container); font-size: 12px; line-height: 1.5; }
.effects-feedback.error { color: var(--md-on-error-container); background: var(--md-error-container); }
@media (max-width: 680px) { .effects-grid, .effects-stats-grid { grid-template-columns: minmax(0, 1fr); } .effects-content { padding: 12px; } }
</style>
