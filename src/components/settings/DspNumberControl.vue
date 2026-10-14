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
}>(), { step: 0.1, unit: '', scale: 1 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const displayValue = computed(() => {
  const value = props.modelValue * props.scale
  const decimals = props.unit === 'Hz' ? 2 : 3
  return `${Number(value.toFixed(decimals))}${props.unit ? ` ${props.unit}` : ''}`
})
</script>

<template>
  <div class="setting-card dsp-number-control">
    <div class="dsp-number-heading">
      <div class="dsp-number-info">
        <div class="setting-title">{{ label }}</div>
        <div v-if="help" class="setting-desc">{{ help }}</div>
      </div>
      <EditableRangeValue :model-value="modelValue" :min="min" :max="max" :step="step" :input-scale="scale"
        :display-value="valueLabel ?? displayValue" :input-suffix="unit" :aria-label="label"
        @update:model-value="emit('update:modelValue', $event)" />
    </div>
    <div class="dsp-number-range">
      <span>{{ minLabel ?? Number((min * scale).toFixed(2)) }}</span>
      <input type="range" :min="min" :max="max" :step="step" :value="modelValue" :aria-label="label"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))" />
      <span>{{ maxLabel ?? `${Number((max * scale).toFixed(2))} ${unit}` }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.setting-card { padding: 14px 16px; border-radius: var(--radius-md); background: var(--md-surface-container); }
.dsp-number-heading { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
.dsp-number-info { flex: 1; min-width: 0; }
.setting-title { font-size: 13px; font-weight: 500; }
.setting-desc { margin-top: 4px; color: var(--md-on-surface-variant); font-size: 11px; line-height: 1.5; }
.dsp-number-heading :deep(.editable-range-value) { color: var(--md-primary); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dsp-number-range { display: flex; gap: 10px; align-items: center; margin-top: 14px; }
.dsp-number-range span { color: var(--md-on-surface-variant); font-size: 10px; font-variant-numeric: tabular-nums; }
input { flex: 1; min-width: 0; appearance: none; height: 4px; border-radius: 4px; background: var(--md-surface-container-highest); cursor: pointer; }
input:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 4px; }
input::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--md-primary); }
input::-moz-range-thumb { width: 16px; height: 16px; border: none; border-radius: 50%; background: var(--md-primary); }
</style>
