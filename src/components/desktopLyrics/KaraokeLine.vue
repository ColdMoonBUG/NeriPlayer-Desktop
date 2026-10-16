<script setup lang="ts">
// 一行卡拉 OK 歌词：描边垫底层、未唱渐变层、已唱渐变层叠在一起，已唱层按进度裁剪
// 进度每帧由父组件调用 update() 直接写样式，不走响应式，避免每秒 60 次重渲染
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { KARAOKE_REGISTRY, KARAOKE_WAKE } from './registry'
import type { DesktopLyricsFrameLine } from '@/modules/desktopLyrics/frame'
import type { DesktopLyricsAlign, DesktopLyricsKaraoke } from '@/modules/desktopLyrics/style'
import { hasWordTiming, highlightWidth, longLineScrollOffset } from '@/modules/desktopLyrics/timeline'

const props = defineProps<{
  line: DesktopLyricsFrameLine | null
  /** 没有歌词时显示的普通文字（歌名等），不做卡拉 OK */
  fallback?: string
  endMs: number
  karaoke: DesktopLyricsKaraoke
  align: DesktopLyricsAlign
  /** 尚未开始的下一句：整行用未唱颜色 */
  upcoming?: boolean
}>()

// 定时重锚和暂停会小幅校正预测时钟，只对明显的回退重新开始滚动
const SCROLL_CLOCK_CORRECTION_MS = 250

const container = ref<HTMLElement | null>(null)
const fit = ref<HTMLElement | null>(null)
const base = ref<HTMLElement | null>(null)
const outline = ref<HTMLElement | null>(null)
const fill = ref<HTMLElement | null>(null)
let wordOffsets: Array<readonly [number, number]> | null = null
let textWidth = 0
let availableWidth = 0
let lastWidth = -1
let lastOffset = -1
let scrollStartedMs: number | null = null
let lastTimeMs: number | null = null
let observer: ResizeObserver | null = null

const timedWords = computed(() => !!props.line && props.karaoke === 'word' && hasWordTiming(props.line))

/** 三层用同样的分段，保证字形位置完全一致 */
const segments = computed(() => {
  const line = props.line
  if (!line) return [props.fallback || '\u00a0']
  if (timedWords.value) return line.words.map(word => word.text)
  return [line.text || line.words.map(word => word.text).join('') || '\u00a0']
})

function measure() {
  const element = base.value
  const box = container.value
  const scaler = fit.value
  if (!element || !box || !scaler) return
  const measuredWidth = element.offsetWidth
  const spans = [...element.children] as HTMLElement[]
  wordOffsets = timedWords.value ? spans.map(span => [span.offsetLeft, span.offsetWidth] as const) : null
  const boxStyle = getComputedStyle(box)
  const available = Math.max(0, box.clientWidth - Number.parseFloat(boxStyle.paddingLeft) - Number.parseFloat(boxStyle.paddingRight))
  if (measuredWidth !== textWidth || available !== availableWidth) {
    scrollStartedMs = null
    lastWidth = -1
    lastOffset = -1
  }
  textWidth = measuredWidth
  availableWidth = available
  box.classList.toggle('overflowing', textWidth - availableWidth > 2)
  // 重测保留当前画面，实际尺寸或内容变化时先裁好开头
  paint(Math.max(0, lastWidth), Math.max(0, lastOffset))
  requestFrame?.()
}

function paint(width: number, offset: number) {
  const excess = Math.max(0, textWidth - availableWidth)
  const clipStart = excess > 2 ? offset : props.align === 'right' ? excess : props.align === 'center' ? excess / 2 : 0
  const clipEnd = Math.min(textWidth, clipStart + availableWidth)
  const clip = excess > 0 ? `inset(-100% ${Math.max(0, textWidth - clipEnd)}px -100% ${clipStart}px)` : ''
  if (base.value) base.value.style.clipPath = clip
  if (outline.value) outline.value.style.clipPath = clip
  if (fit.value) fit.value.style.transform = offset > 0 ? `translateX(-${offset}px)` : ''
  if (fill.value) {
    const visibleEnd = Math.max(clipStart, Math.min(width, clipEnd))
    fill.value.style.clipPath = `inset(0 ${Math.max(0, textWidth - visibleEnd)}px 0 ${clipStart ? `${clipStart}px` : '0'})`
  }
}

/** 父组件每帧调用；timeMs 已加歌词偏移 */
function update(timeMs: number) {
  const element = fill.value
  const line = props.line
  if (!element) return
  if (lastTimeMs !== null && timeMs < lastTimeMs - SCROLL_CLOCK_CORRECTION_MS) scrollStartedMs = null
  lastTimeMs = timeMs
  let width = 0
  if (line && !props.upcoming) {
    width = props.karaoke === 'off'
      ? (timeMs >= line.startMs ? textWidth : 0)
      : highlightWidth(line, props.endMs, timeMs, textWidth, wordOffsets, props.karaoke === 'word')
  }
  if (line && !props.upcoming && timeMs >= line.startMs) scrollStartedMs ??= timeMs
  else scrollStartedMs = null
  const offset = Math.round(longLineScrollOffset(textWidth - availableWidth, scrollStartedMs === null ? 0 : timeMs - scrollStartedMs) * 2) / 2
  const rounded = Math.round(width * 2) / 2
  if (rounded === lastWidth && offset === lastOffset) return
  lastWidth = rounded
  lastOffset = offset
  paint(rounded, offset)
}

const register = inject(KARAOKE_REGISTRY, null)
const requestFrame = inject(KARAOKE_WAKE, null)
let unregister: (() => void) | null = null

// 锚点刷新会带来新对象，只在显示内容或槽位状态变化时重新开始滚动
watch([
  () => props.line?.startMs,
  () => segments.value.join('\u0000'),
  () => props.karaoke,
  () => props.align,
  () => props.upcoming,
], () => {
  scrollStartedMs = null
  lastWidth = -1
  lastOffset = -1
  void nextTick(measure)
})

onMounted(() => {
  void nextTick(measure)
  unregister = register?.({ update }) ?? null
  // 字体加载完成或窗口缩放后重新量
  observer = new ResizeObserver(() => measure())
  if (container.value) observer.observe(container.value)
  if (base.value) observer.observe(base.value)
  void document.fonts?.ready.then(() => measure())
})

onBeforeUnmount(() => {
  unregister?.()
  observer?.disconnect()
})
</script>

<template>
  <div ref="container" class="karaoke-line" :class="[`align-${align}`, { upcoming }]">
    <div ref="fit" class="karaoke-fit">
      <span class="karaoke-shadow" aria-hidden="true"><span ref="outline" class="karaoke-text karaoke-stroke"><span v-for="(segment, index) in segments" :key="index">{{ segment }}</span></span></span>
      <span ref="base" class="karaoke-text karaoke-unplayed"><span v-for="(segment, index) in segments" :key="index">{{ segment }}</span></span>
      <span class="karaoke-glow" aria-hidden="true"><span ref="fill" class="karaoke-text karaoke-played"><span v-for="(segment, index) in segments" :key="index">{{ segment }}</span></span></span>
    </div>
  </div>
</template>

<style scoped>
.karaoke-line {
  display: flex;
  width: 100%;
  min-width: 0;
  overflow: visible;
  padding: 0.12em max(0.2em, var(--dl-effect-inset));
  box-sizing: border-box;
}

.karaoke-line.align-left { justify-content: flex-start; }
.karaoke-line.align-center { justify-content: center; }
.karaoke-line.align-right { justify-content: flex-end; }
.karaoke-line.overflowing { justify-content: flex-start; }

.karaoke-fit {
  position: relative;
  flex: 0 0 auto;
  line-height: 1.3;
  will-change: transform;
}

.karaoke-text {
  display: block;
  white-space: pre;
  font-family: var(--dl-font-family);
  font-size: var(--dl-font-size);
  font-weight: var(--dl-font-weight);
  letter-spacing: var(--dl-letter-spacing);
}

/* 描边画在最底下，被上面的填充盖住内半边，只露出外半边 */
.karaoke-shadow {
  position: absolute;
  inset: 0;
  filter: var(--dl-shadow);
}

.karaoke-stroke {
  color: transparent;
  -webkit-text-stroke: var(--dl-stroke);
}

.karaoke-unplayed,
.karaoke-played {
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
}

.karaoke-unplayed {
  position: relative;
  background-image: var(--dl-unplayed);
}

.karaoke-glow {
  position: absolute;
  inset: 0;
  filter: var(--dl-glow);
}

.karaoke-played {
  background-image: var(--dl-played);
  clip-path: inset(0 100% 0 0);
  will-change: clip-path;
}

.upcoming .karaoke-glow { visibility: hidden; }
</style>
