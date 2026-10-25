<script lang="ts" module>
  import { i18n } from '../i18n/i18n.svelte'
  import type { MessageKey } from '../i18n/translate'
  import { FOLDER_COLORS, FOLDER_ICON_COMPONENTS } from './folderIcons'

  /** The token of a stored colour, or null for the plain one (also for a name this version does not know). */
  export function folderColor(color: string | null): string | null {
    return (FOLDER_COLORS as readonly string[]).includes(color ?? '')
      ? `var(--color-tag-${color})`
      : null
  }

  /** The name of a symbol, for its tooltip, screen readers, and the search. */
  export function folderIconLabel(id: string): string {
    const number = /^(square|circle)-number-(\d)$/.exec(id)
    if (number)
      return i18n.t(number[1] === 'circle' ? 'icon.numberCircle' : 'icon.number', {
        n: number[2]!,
      })
    const letter = /^square-letter-([a-z])$/.exec(id)
    if (letter) return i18n.t('icon.letter', { letter: letter[1]!.toUpperCase() })
    return i18n.t(`icon.${id}` as MessageKey)
  }
</script>

<script lang="ts">
  import IconFolder from '@tabler/icons-svelte/icons/folder'

  interface Props {
    /** The stored symbol id; null or one this version does not know shows the plain folder. */
    icon: string | null
    color?: string | null
    size?: number
  }
  let { icon, color = null, size = 15 }: Props = $props()
  const Component = $derived((icon && FOLDER_ICON_COMPONENTS[icon]) || IconFolder)
</script>

<span class="folder-icon" style:color={folderColor(color)}>
  <Component {size} stroke={1.75} aria-hidden="true" />
</span>

<style>
  .folder-icon {
    display: inline-flex;
    flex: none;
  }
</style>
