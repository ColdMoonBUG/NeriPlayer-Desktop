<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { usePlayerStore, type TrackInfo } from '@/stores/player'
import { useAuthStore } from '@/stores/auth'
import TrackContextMenu from '@/components/TrackContextMenu.vue'
import { filterAndRank, trackSearchTokens } from '@/modules/search/textMatcher'
import { formatTrackDuration } from '@/utils/timeFormat'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const player = usePlayerStore()
const auth = useAuthStore()
const tracks = ref<TrackInfo[]>([])
const name = ref('')
const coverUrl = ref('')
const loading = ref(false)
const error = ref('')
const query = ref('')
const menu = ref<InstanceType<typeof TrackContextMenu> | null>(null)
const filtered = computed(() => filterAndRank(query.value, tracks.value, trackSearchTokens))
let generation = 0
async function load() {
  const request = ++generation
  tracks.value = []
  name.value = ''
  coverUrl.value = ''
  error.value = ''
  if (!auth.statusChecked) return
  if (!auth.qq.loggedIn) { error.value = t('explore.login_for_playlists'); return }
  loading.value = true
  try {
    const detail = await invoke<{name: string; coverUrl: string; tracks: TrackInfo[]}>('get_qq_playlist', { id: String(route.params.id) })
    if (request !== generation) return
    tracks.value = detail.tracks
    name.value = detail.name || t('player.source_qq')
    coverUrl.value = detail.coverUrl || ''
  } catch (e) {
    if (request === generation) error.value = String(e)
  } finally {
    if (request === generation) loading.value = false
  }
}
watch(() => [route.params.id, auth.statusChecked, auth.qq], () => { void load() }, { immediate: true })
function play(track?: TrackInfo) {
  player.playAll(filtered.value, track?.id)
}
</script>

<template>
  <div class="qq-playlist">
    <button class="m3-chip" @click="router.back()"><span class="material-symbols-rounded">arrow_back</span>{{ t('common.back') }}</button>
    <header>
      <img v-if="coverUrl" :src="coverUrl" referrerpolicy="no-referrer" />
      <div><h1>{{ name || t('player.source_qq') }}</h1><p>{{ t('library.track_count', { count: tracks.length }) }}</p>
        <button class="m3-chip" :disabled="!tracks.length" @click="play()"><span class="material-symbols-rounded">play_arrow</span>{{ t('player.play_all') }}</button>
        <button class="m3-chip" :disabled="loading" @click="load()"><span class="material-symbols-rounded">refresh</span>{{ t('common.refresh') }}</button>
      </div>
    </header>
    <p v-if="loading"><span class="material-symbols-rounded">progress_activity</span>{{ t('library.cloud_playlists_loading') }}</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else>
      <input v-model="query" class="track-search" :placeholder="t('explore.search_placeholder')" />
      <div v-for="(track, index) in filtered" :key="track.id" class="qq-track" :class="{ active: player.currentTrack?.id === track.id }" @dblclick="play(track)" @contextmenu="menu?.open($event, track)">
        <button :aria-label="track.title" @click="play(track)"><span class="material-symbols-rounded">play_arrow</span></button>
        <span class="track-number">{{ index + 1 }}</span>
        <img v-if="track.coverUrl" :src="track.coverUrl" referrerpolicy="no-referrer" loading="lazy" />
        <div class="track-info"><div>{{ track.title }}</div><small>{{ track.artist }} · {{ track.album }}</small></div>
        <span>{{ formatTrackDuration(track.durationMs) }}</span>
      </div>
    </template>
    <TrackContextMenu ref="menu" @play="play" />
  </div>
</template>

<style scoped>
.qq-playlist { padding: 28px; overflow-y: auto; height: 100%; }
header { display: flex; align-items: center; gap: 24px; margin: 24px 0; }
header img { width: 160px; height: 160px; object-fit: cover; border-radius: 16px; }
header button { margin-right: 8px; }
.track-search { width: 100%; padding: 12px; margin-bottom: 16px; border-radius: 12px; color: inherit; background: transparent; border: 1px solid currentColor; opacity: .7; }
.qq-track { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; cursor: pointer; }
.qq-track:hover, .qq-track.active { background: var(--md-sys-color-surface-container-high); }
.qq-track button { color: inherit; background: transparent; border: none; cursor: pointer; }
.qq-track img { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; }
.track-number { width: 24px; opacity: .5; }
.track-info { flex: 1; min-width: 0; }
.track-info div, .track-info small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.track-info small { opacity: .6; }
</style>
