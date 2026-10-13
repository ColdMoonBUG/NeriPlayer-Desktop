<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { AUDIO_EFFECT_PRESETS } from '@/modules/audioEffects/model'
import CustomSelect from './ui/CustomSelect.vue'
import EditableRangeValue from './ui/EditableRangeValue.vue'

const emit = defineEmits<{ details: [] }>()
const player = usePlayerStore()
const { t } = useI18n()
const SPEED_PRESETS = [0.5, 0.75, 0.95, 1, 1.05, 1.25, 1.5, 2]
const presetOptions = computed(() => [
  ...AUDIO_EFFECT_PRESETS.filter(preset => preset.id !== 'custom').map(preset => ({ value: preset.id, label: t(`dsp.presets.${preset.id}`) })),
  ...player.audioEffects.userPresets.map(preset => ({ value: preset.id, label: preset.name })),
])
const presetLabel = computed(() => presetOptions.value.some(option => option.value === player.audioEffectsProfile.presetId) ? undefined : t('dsp.manual'))
</script>

<template>
  <div class="audiofx-panel">
    <div class="audiofx-section">
      <div class="audiofx-section-header">{{ t('player.playback_speed') }}</div>
      <div class="audiofx-speed-grid">
        <button v-for="speed in SPEED_PRESETS" :key="speed" class="speed-option"
          :class="{ active: player.playbackSpeed === speed }" :aria-pressed="player.playbackSpeed === speed"
          @click="player.setSpeed(speed)">{{ speed }}x</button>
      </div>
      <div class="audiofx-slider-row">
        <span class="audiofx-slider-label">0.1x</span>
        <input type="range" min="0.1" max="4" step="0.05" :value="player.playbackSpeed"
          class="audiofx-slider" :aria-label="t('player.playback_speed')"
          @input="player.setSpeed(parseFloat(($event.target as HTMLInputElement).value))" />
        <span class="audiofx-slider-label">4x</span>
        <EditableRangeValue :model-value="player.playbackSpeed" class="audiofx-slider-value"
          :min="0.1" :max="4" :step="0.05" :display-value="`${player.playbackSpeed.toFixed(2)}x`"
          input-suffix="x" :aria-label="t('player.playback_speed')" @update:model-value="player.setSpeed($event)" />
      </div>
    </div>

    <div v-if="!player.vinylEffectEnabled" class="audiofx-section">
      <div class="audiofx-section-header">{{ t('player.pitch') }}</div>
      <div class="audiofx-slider-row">
        <span class="audiofx-slider-label">0.25x</span>
        <input type="range" min="0.25" max="2" step="0.05" :value="player.playbackPitch"
          class="audiofx-slider" :aria-label="t('player.pitch')"
          @input="player.setPitch(parseFloat(($event.target as HTMLInputElement).value))" />
        <span class="audiofx-slider-label">2x</span>
        <EditableRangeValue :model-value="player.playbackPitch" class="audiofx-slider-value"
          :min="0.25" :max="2" :step="0.05" :display-value="`${player.playbackPitch.toFixed(2)}x`"
          input-suffix="x" :aria-label="t('player.pitch')" @update:model-value="player.setPitch($event)" />
      </div>
    </div>

    <div class="audiofx-section">
      <div class="audiofx-section-header">
        {{ t('player.vinyl_effect') }}
        <label class="audiofx-toggle">
          <input type="checkbox" :checked="player.vinylEffectEnabled" :aria-label="t('player.vinyl_effect')"
            @change="player.setVinylEffect(($event.target as HTMLInputElement).checked)" />
          <span class="audiofx-toggle-slider"></span>
        </label>
      </div>
      <p v-if="player.vinylEffectEnabled" class="audiofx-help">{{ t('dsp.vinyl_following', { value: player.effectivePlaybackPitch().toFixed(2) }) }}</p>
      <CustomSelect surface="dark" :model-value="player.audioEffectsProfile.presetId" :selected-label="presetLabel" :label="t('player.eq_preset')"
        :options="presetOptions" @update:model-value="player.setAudioEffectsPreset($event)" />
    </div>

    <button class="speed-option audiofx-details" @click="emit('details')">{{ t('player.audio_effects_details') }}</button>
    <button class="speed-option audiofx-reset" @click="player.resetAudioEffects()">{{ t('player.reset_effects') }}</button>
  </div>
</template>

<style scoped lang="scss">
.audiofx-panel { display: flex; flex-direction: column; gap: 12px; }
.audiofx-section { display: flex; flex-direction: column; gap: 8px; }
.audiofx-section :deep(.custom-select) { width: 100%; }
.audiofx-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 600;
}
.audiofx-speed-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.audiofx-help { margin: 0; color: rgba(255, 255, 255, 0.6); font-size: 11px; line-height: 1.5; }
.speed-option {
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  text-align: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover { background: rgba(255, 255, 255, 0.1); color: white; }
  &.active { background: rgba(255, 255, 255, 0.08); color: var(--np-primary, var(--md-primary, #D0BCFF)); font-weight: 600; }
  &:focus-visible { outline: 2px solid var(--np-primary, var(--md-primary, #D0BCFF)); outline-offset: 2px; }
}
.audiofx-slider-row { display: flex; align-items: center; gap: 6px; }
.audiofx-slider-label { color: rgba(255, 255, 255, 0.45); font-size: 10px; min-width: 28px; text-align: center; }
.audiofx-slider-value {
  color: var(--np-primary, var(--md-primary, #D0BCFF));
  font-size: 11px;
  font-weight: 600;
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.audiofx-slider {
  flex: 1;
  min-width: 0;
  appearance: none;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  cursor: pointer;

  &:focus-visible { outline: 2px solid var(--np-primary, var(--md-primary, #D0BCFF)); outline-offset: 4px; }
  &::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--np-primary, var(--md-primary, #D0BCFF)); }
  &::-moz-range-thumb { width: 14px; height: 14px; border: none; border-radius: 50%; background: var(--np-primary, var(--md-primary, #D0BCFF)); }
}
.audiofx-toggle {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 18px;
  input { opacity: 0; width: 0; height: 0; }
  input:focus-visible + .audiofx-toggle-slider { outline: 2px solid var(--np-primary, var(--md-primary, #D0BCFF)); outline-offset: 3px; }
  input:checked + .audiofx-toggle-slider { background: var(--np-primary, var(--md-primary, #D0BCFF)); }
  input:checked + .audiofx-toggle-slider::before { transform: translateX(16px); }
}
.audiofx-toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 18px;
  transition: 0.2s;
  &::before { content: ''; position: absolute; height: 14px; width: 14px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: 0.2s; }
}
.audiofx-details { background: rgba(255, 255, 255, 0.08); color: var(--np-primary, var(--md-primary, #D0BCFF)); }
.audiofx-reset { color: #EF5350; border-top: 1px solid rgba(255, 255, 255, 0.06); border-radius: 0; padding-top: 10px; }
</style>
