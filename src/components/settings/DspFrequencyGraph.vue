<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { audioEffectsFrequencyResponse, type AudioEffectsSound } from '@/modules/audioEffects/model'

const props = defineProps<{ sound: AudioEffectsSound }>()
const { t } = useI18n()
const response = computed(() => audioEffectsFrequencyResponse(props.sound))
const limit = computed(() => Math.max(12, Math.min(60, Math.ceil(Math.max(...response.value.map(point => Math.abs(point.gainDb)), 0) / 6) * 6)))
const x = (frequency: number) => 42 + Math.log10(frequency / 20) / 3 * 518
const y = (gain: number) => 94 - Math.max(-limit.value, Math.min(limit.value, gain)) / limit.value * 72
const path = computed(() => response.value.map((point, index) => `${index ? 'L' : 'M'}${x(point.frequencyHz).toFixed(2)},${y(point.gainDb).toFixed(2)}`).join(' '))
const frequencies = [20, 100, 1000, 10000, 20000]
</script>

<template>
  <figure class="dsp-frequency-graph">
    <figcaption>{{ t('dsp.response') }} <span>{{ t('dsp.response_help') }}</span></figcaption>
    <svg viewBox="0 0 600 200" role="img" :aria-label="t('dsp.response')">
      <g v-for="gain in [-limit, 0, limit]" :key="gain">
        <line x1="42" x2="560" :y1="y(gain)" :y2="y(gain)" :class="{ zero: gain === 0 }" />
        <text x="35" :y="y(gain) + 4" text-anchor="end">{{ gain }} dB</text>
      </g>
      <g v-for="frequency in frequencies" :key="frequency">
        <line :x1="x(frequency)" :x2="x(frequency)" y1="22" y2="166" />
        <text :x="x(frequency)" y="186" text-anchor="middle">{{ frequency >= 1000 ? `${frequency / 1000}k` : frequency }}</text>
      </g>
      <path :d="path" />
    </svg>
  </figure>
</template>

<style scoped>
.dsp-frequency-graph { margin: 0; padding: 14px; border-radius: var(--radius-md); background: var(--md-surface-container); }
figcaption { font-size: 13px; font-weight: 500; }
figcaption span { display: block; margin-top: 4px; color: var(--md-on-surface-variant); font-size: 11px; font-weight: 400; line-height: 1.5; }
svg { display: block; width: 100%; overflow: visible; }
line { stroke: var(--md-outline-variant); stroke-width: .6; }
line.zero { stroke: var(--md-on-surface-variant); stroke-width: 1; }
text { fill: var(--md-on-surface-variant); font: 10px sans-serif; }
path { fill: none; stroke: var(--md-primary); stroke-width: 2.5; stroke-linejoin: round; }
</style>
