<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EQ_PRESETS, usePlayerStore } from '@/stores/player'
import { useSettingsStore } from '@/stores/settings'
import CustomSelect from '@/components/ui/CustomSelect.vue'
import EditableRangeValue from '@/components/ui/EditableRangeValue.vue'

const player = usePlayerStore()
const settings = useSettingsStore()
const { t } = useI18n()
const rateControls = [
  { key: 'speed', title: 'player.playback_speed', desc: 'settings.audio_effects_speed_desc', icon: 'speed', min: 0.1, max: 4,
    presets: [0.5, 0.75, 0.85, 1, 1.25, 1.5, 2, 3, 4] },
  { key: 'pitch', title: 'player.pitch', desc: 'settings.audio_effects_pitch_desc', icon: 'music_note', min: 0.25, max: 2,
    presets: [0.5, 0.75, 0.85, 1, 1.25, 1.5, 2] },
] as const
const gainPresets = [0, 300, 600, 900, 1200, 1500]
const eqFrequencies = [60, 230, 910, 3600, 14000]
const eqOptions = computed(() => Object.keys(EQ_PRESETS).map(id => ({ value: id, label: t(`player.eq_${id}`) })))

function rateValue(key: 'speed' | 'pitch'): number {
  return key === 'speed' ? player.playbackSpeed : player.playbackPitch
}

function setRate(key: 'speed' | 'pitch', value: number) {
  if (key === 'speed') player.setSpeed(value)
  else player.setPitch(value)
}

function onEqBandChange(index: number, value: number) {
  const bands = [...player.equalizerBands]
  bands[index] = Math.round(value)
  player.setEqualizer(player.equalizerEnabled, bands)
  player.equalizerPresetId = 'custom'
  settings.equalizerPresetId = 'custom'
}
</script>

<template>
  <div class="audio-effects-settings">
    <div class="effects-intro">{{ t('settings.audio_effects_desc') }}</div>
    <div v-for="control in rateControls" :key="control.key" class="setting-card">
      <div class="effects-heading">
        <span class="setting-icon-wrap material-symbols-rounded">{{ control.icon }}</span>
        <div class="setting-info">
          <div class="setting-title">{{ t(control.title) }}</div>
          <div class="setting-desc">{{ t(control.desc) }}</div>
        </div>
        <EditableRangeValue :model-value="rateValue(control.key)" class="effects-value"
          :min="control.min" :max="control.max" :step="0.05" :display-value="`${rateValue(control.key).toFixed(2)}x`"
          input-suffix="x" :aria-label="t(control.title)" @update:model-value="setRate(control.key, $event)" />
      </div>
      <div class="effects-range">
        <span>{{ control.min }}x</span>
        <input type="range" class="m3-slider" :min="control.min" :max="control.max" step="0.05"
          :value="rateValue(control.key)" :aria-label="t(control.title)"
          @input="setRate(control.key, parseFloat(($event.target as HTMLInputElement).value))" />
        <span>{{ control.max }}x</span>
      </div>
      <div class="effects-presets">
        <button v-for="value in control.presets" :key="value" :class="{ active: rateValue(control.key) === value }"
          :aria-pressed="rateValue(control.key) === value" :aria-label="`${t(control.title)} ${value}x`"
          @click="setRate(control.key, value)">{{ value }}x</button>
      </div>
    </div>

    <div class="setting-card">
      <div class="effects-heading">
        <span class="setting-icon-wrap material-symbols-rounded">volume_up</span>
        <div class="setting-info">
          <div class="setting-title">{{ t('player.loudness_gain') }}</div>
          <div class="setting-desc">{{ t('settings.audio_effects_gain_desc') }}</div>
        </div>
        <EditableRangeValue :model-value="player.loudnessGainMb" class="effects-value"
          :min="0" :max="1500" :step="50" :input-scale="0.01" :input-width="60"
          :display-value="`+${(player.loudnessGainMb / 100).toFixed(1)}dB`" input-suffix="dB"
          :aria-label="t('player.loudness_gain')" @update:model-value="player.setLoudnessGain($event)" />
      </div>
      <div class="effects-range">
        <span>0dB</span>
        <input type="range" class="m3-slider" min="0" max="1500" step="50" :value="player.loudnessGainMb"
          :aria-label="t('player.loudness_gain')" @input="player.setLoudnessGain(parseFloat(($event.target as HTMLInputElement).value))" />
        <span>+15dB</span>
      </div>
      <div class="effects-presets">
        <button v-for="value in gainPresets" :key="value" :class="{ active: player.loudnessGainMb === value }"
          :aria-pressed="player.loudnessGainMb === value" :aria-label="`${t('player.loudness_gain')} +${value / 100}dB`"
          @click="player.setLoudnessGain(value)">+{{ value / 100 }}dB</button>
      </div>
    </div>

    <div class="setting-card">
      <div class="effects-heading">
        <span class="setting-icon-wrap material-symbols-rounded">equalizer</span>
        <div class="setting-info">
          <div class="setting-title">{{ t('player.equalizer') }}</div>
          <div class="setting-desc">{{ t('settings.audio_effects_eq_desc') }}</div>
        </div>
        <label class="m3-switch">
          <input type="checkbox" :checked="player.equalizerEnabled" :aria-label="t('player.equalizer')"
            @change="player.setEqualizer(($event.target as HTMLInputElement).checked, player.equalizerBands)" />
          <span class="track"><span class="thumb"><span v-if="player.equalizerEnabled" class="material-symbols-rounded">check</span></span></span>
        </label>
      </div>
    </div>
    <div class="setting-card">
      <div class="setting-title">{{ t('player.eq_preset') }}</div>
      <CustomSelect :model-value="player.equalizerPresetId" :options="eqOptions" :label="t('player.eq_preset')"
        @update:model-value="player.setEqualizerPreset($event)" />
      <div class="effects-bands">
        <div v-for="(frequency, index) in eqFrequencies" :key="frequency" class="setting-card effects-band">
          <div class="effects-band-heading">
            <span>{{ frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz` }}</span>
            <EditableRangeValue :model-value="player.equalizerBands[index]" class="effects-value"
              :min="-1500" :max="1500" :step="50" :input-scale="0.01" :input-width="60"
              :display-value="`${(player.equalizerBands[index] / 100).toFixed(1)}dB`" input-suffix="dB"
              :aria-label="t('settings.audio_effects_band', { frequency })" @update:model-value="onEqBandChange(index, $event)" />
          </div>
          <div class="effects-range">
            <span>-15dB</span>
            <input type="range" class="m3-slider" min="-1500" max="1500" step="50" :value="player.equalizerBands[index]"
              :aria-label="t('settings.audio_effects_band', { frequency })"
              @input="onEqBandChange(index, parseFloat(($event.target as HTMLInputElement).value))" />
            <span>+15dB</span>
          </div>
        </div>
      </div>
    </div>

    <div class="setting-card effects-reset">
      <div class="setting-title">{{ t('player.reset_effects') }}</div>
      <div class="setting-desc">{{ t('settings.audio_effects_reset_desc') }}</div>
      <button class="effects-reset-button" @click="player.resetAudioEffects()">{{ t('player.reset_effects') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.audio-effects-settings { min-width: 0; }
.effects-intro { margin: 0 4px 14px; color: var(--md-on-surface-variant); font-size: 12px; line-height: 1.6; }
.setting-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: var(--md-surface-container);
  margin-bottom: 8px;
  transition: background var(--duration-short);
  &:hover { background: var(--md-surface-container-high); }
}
.setting-title { font-size: 14px; font-weight: 500; }
.setting-desc { margin-top: 3px; color: var(--md-on-surface-variant); font-size: 12px; line-height: 1.5; }
.setting-info { flex: 1; min-width: 0; }
.effects-heading { display: flex; align-items: center; gap: 14px; }
.setting-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--md-surface-container-high);
  color: var(--md-on-surface-variant);
}
.effects-value { color: var(--md-primary); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.effects-range {
  display: flex;
  align-items: center;
  gap: 12px;
  input { flex: 1; min-width: 0; width: auto; }
  > span { min-width: 36px; color: var(--md-on-surface-variant); font-size: 11px; font-variant-numeric: tabular-nums; }
  > span:last-child { text-align: right; }
}
.m3-slider {
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: var(--md-surface-container-highest);
  cursor: pointer;
  &:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 4px; }
  &::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--md-primary); }
  &::-moz-range-thumb { width: 16px; height: 16px; border: none; border-radius: 50%; background: var(--md-primary); }
}
.effects-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  button {
    padding: 6px 12px;
    border: 1px solid var(--md-outline-variant);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--md-on-surface-variant);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    &:hover { background: var(--md-surface-container-highest); }
    &.active { border-color: transparent; background: var(--md-primary-container); color: var(--md-on-primary-container); }
    &:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 2px; }
  }
}
.effects-bands { display: grid; gap: 18px; padding-top: 4px; }
.setting-card.effects-band { gap: 0; padding: 0; margin: 0; border-radius: 0; background: transparent; }
.effects-band-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12px; }
.effects-reset { gap: 4px; }
.effects-reset-button {
  align-self: flex-start;
  margin-top: 8px;
  padding: 9px 16px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--md-error);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: var(--md-surface-container-highest); }
  &:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 2px; }
}
.m3-switch .material-symbols-rounded { font-size: 14px; }
@media (max-width: 540px) {
  .effects-heading { flex-wrap: wrap; gap: 10px; }
  .setting-icon-wrap { display: none; }
  .effects-range { gap: 8px; }
}
</style>
