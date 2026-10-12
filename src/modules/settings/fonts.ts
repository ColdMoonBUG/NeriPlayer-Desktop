import { sanitizeFontFamily } from '@/modules/desktopLyrics/style'

export function fontFamilyStack(value: string): string {
  const family = sanitizeFontFamily(value)
  return family ? `"${family}", var(--font-family-default)` : 'var(--font-family-default)'
}

export function applyFontSettings(
  appFontFamily: string,
  lyricFontFamily: string,
  root: Pick<HTMLElement, 'style'> = document.documentElement,
): void {
  const appStack = fontFamilyStack(appFontFamily)
  root.style.setProperty('--font-family', appStack)
  root.style.setProperty('--lyric-font-family', fontFamilyStack(lyricFontFamily))
  for (const key of ['--font-display', '--font-hand']) {
    if (sanitizeFontFamily(appFontFamily)) root.style.setProperty(key, appStack)
    else root.style.removeProperty(key)
  }
}
