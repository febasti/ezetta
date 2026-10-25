import { detectLocale, translate } from './translate'
import type { Locale, MessageKey } from './translate'

const STORAGE_KEY = 'locale'

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'de' || stored === 'en') return stored
  } catch {
    // storage unavailable: fall through to detection
  }
  return detectLocale(navigator.languages)
}

const initial = initialLocale()
let locale = $state<Locale>(initial)

export const i18n = {
  get locale(): Locale {
    return locale
  },
  set locale(next: Locale) {
    locale = next
    document.documentElement.lang = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not persisted; the choice still applies for this session
    }
  },
  t(key: MessageKey, params?: Record<string, string | number>): string {
    return translate(locale, key, params)
  },
}

document.documentElement.lang = initial
