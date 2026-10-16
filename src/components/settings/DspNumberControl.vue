<script setup lang="ts">
import { computed } from 'vue'
import EditableRangeValue from '@/components/ui/EditableRangeValue.vue'

const props = withDefaults(defineProps<{
  modelValue: number
  label: string
  help?: string
  min: number
  max: number
  step?: number
  unit?: string
  scale?: number
  minLabel?: string
  maxLabel?: string
  valueLabel?: string
  /** 双击滑块恢复的值；同时作为填充轨道的起点 */
  defaultValue?: number
  disabled?: boolean
}>(), { step: 0.1, unit: '', scale: 1, help: undefined, minLabel: undefined, maxLabel: undefined,
  valueLabel: undefined, defaultValue: undefined, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const displayValue = computed(() => {
  const value = props.modelValue * props.scale
  const decimals = props.unit === 'Hz' ? 2 : 3
  return `${Number(value.toFixed(decimals))}${props.unit ? ` ${props.unit}` : ''}`
})
const percent = (value: number) => props.max === props.min ? 0
  : Math.max(0, Math.min(100, (value - props.min) / (props.max - props.min) * 100))
const origin = computed(() => props.defaultValue ?? (props.min < 0 && props.max > 0 ? 0 : props.min))
const fill = computed(() => {
  const start = percent(origin.value), end = percent(props.modelValue)
  return { '--fill-from': `${Math.min(start, end)}%`, '--fill-to': `${Math.max(start, end)}%`, '--thumb': `${end}%` }
})
const changed = computed(() => Math.abs(props.modelValue - origin.value) > props.step / 2)
function reset() {
  if (props.defaultValue !== undefined && !props.disabled) emit('update:modelValue', props.defaultValue)
}
</script>

<template>
  <div class="setting-card dsp-number-control" :class="{ changed, disabled }">
    <div class="dsp-number-heading">
      <div class="dsp-number-info">
        <div class="setting-title">{{ label }}</div>
        <div v-if="help" class="setting-desc">{{ help }}</div>
      </div>
      <EditableRangeValue :model-value="modelValue" :min="min" :max="max" :step="step" :input-scale="scale"
        :display-value="valueLabel ?? displayValue" :input-suffix="unit" :aria-label="label"
        @update:model-value="emit('update:modelValue', $event)" />
    </div>
    <div class="dsp-number-range" :style="fill">
      <span>{{ minLabel ?? Number((min * scale).toFixed(2)) }}</span>
      <div class="dsp-number-track">
        <input type="range" :min="min" :max="max" :step="step" :value="modelValue" :aria-label="label" :disabled="disabled"
          @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))" @dblclick="reset" />
      </div>
      <span>{{ maxLabel ?? `${Number((max * scale).toFixed(2))} ${unit}` }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.setting-card {
  padding: 14px 16px; border-radius: var(--radius-md); background: var(--md-surface-container);
  border: 1px solid transparent; transition: border-color .25s ease, background-color .25s ease, opacity .25s ease;
}
.setting-card:hover { background: color-mix(in srgb, var(--md-surface-container) 88%, var(--md-primary) 4%); }
.setting-card.changed { border-color: color-mix(in srgb, var(--md-primary) 28%, transparent); }
.setting-card.disabled { opacity: .5; }
.dsp-number-heading { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.dsp-number-info { flex: 1; min-width: 0; }
.setting-title { font-size: 13px; font-weight: 500; }
.setting-desc { margin-top: 4px; color: var(--md-on-surface-variant); font-size: 11.5px; line-height: 1.55; }
.dsp-number-heading :deep(.editable-range-value) {
  flex-shrink: 0; padding: 3px 9px; border-radius: 999px; background: var(--md-surface-container-highest);
  color: var(--md-primary); font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums;
  transition: background-color .25s ease;
}
.changed .dsp-number-heading :deep(.editable-range-value) { background: var(--md-primary-container); color: var(--md-on-primary-container); }
.dsp-number-range { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
.dsp-number-range > span { color: var(--md-on-surface-variant); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dsp-number-track { position: relative; flex: 1; min-width: 0; height: 20px; display: flex; align-items: center; }
.dsp-number-track::before, .dsp-number-track::after { content: ''; position: absolute; top: 50%; height: 4px; border-radius: 4px; transform: translateY(-50%); pointer-events: none; }
.dsp-number-track::before { left: 0; right: 0; background: var(--md-surface-container-highest); }
.dsp-number-track::after {
  left: var(--fill-from); width: calc(var(--fill-to) - var(--fill-from)); background: var(--md-primary);
  transition: left .12s ease-out, width .12s ease-out;
}
input {
  position: relative; z-index: 1; flex: 1; min-width: 0; margin: 0; appearance: none; height: 20px;
  background: transparent; cursor: pointer;
}
input:disabled { cursor: default; }
input:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 2px; border-radius: 6px; }
input::-webkit-slider-thumb {
  appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--md-primary);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--md-primary) 24%, transparent);
  transition: box-shadow .18s ease, transform .18s ease;
}
input:hover::-webkit-slider-thumb { box-shadow: 0 0 0 6px color-mix(in srgb, var(--md-primary) 16%, transparent); }
input:active::-webkit-slider-thumb { transform: scale(1.15); box-shadow: 0 0 0 9px color-mix(in srgb, var(--md-primary) 20%, transparent); }
input::-moz-range-thumb { width: 16px; height: 16px; border: none; border-radius: 50%; background: var(--md-primary); }
</style>
