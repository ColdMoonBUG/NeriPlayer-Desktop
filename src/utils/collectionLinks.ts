// 歌单、专辑、歌手在各平台网页上的地址，供「复制链接」「在浏览器中打开」使用
import type { RouteLocationRaw } from 'vue-router'

export interface CollectionMenuTarget {
  route: RouteLocationRaw
  /** 平台网页地址；没有时链接相关的项不可用 */
  webUrl?: string
}

export type CollectionPlatform = 'netease' | 'qq' | 'bilibili' | 'youtube'
export type CollectionKind = 'playlist' | 'album' | 'artist'

export function collectionWebUrl(platform: CollectionPlatform, kind: CollectionKind, rawId: string | number): string {
  const id = encodeURIComponent(String(rawId).trim())
  if (!id) return ''
  switch (platform) {
    case 'qq':
      return kind === 'playlist' ? `https://y.qq.com/n/ryqq/playlist/${id}` : ''
    case 'netease':
      return `https://music.163.com/${kind === 'artist' ? 'artist' : kind}?id=${id}`
    case 'bilibili':
      return kind === 'artist'
        ? `https://space.bilibili.com/${id}`
        : `https://www.bilibili.com/medialist/detail/ml${id}`
    case 'youtube':
      if (kind === 'artist') return `https://music.youtube.com/channel/${id}`
      // 专辑 browseId 需要先解析出 playlistId，不能直接拿来拼网页 list 参数
      if (/^MPRE/i.test(id)) return ''
      // 播放列表的 browseId 带 VL 前缀，网页地址里的 list 参数不带
      return `https://music.youtube.com/playlist?list=${id.replace(/^VL/, '')}`
  }
}
