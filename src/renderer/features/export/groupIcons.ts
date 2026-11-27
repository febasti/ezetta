import type { IconName } from '../../ui/Icon.svelte'

/** A symbol for each group of elements: in the list, and before the name of the panel it leads to. */
export const GROUP_ICONS: Readonly<Record<string, IconName>> = {
  page: 'layout',
  title: 'file',
  text: 'typography',
  headings: 'heading',
  lists: 'list',
  quotes: 'quote',
  references: 'link',
  indexes: 'book',
  tables: 'table',
  figures: 'image',
  equations: 'formula',
  code: 'code',
}
/** The symbols of the two panels that are not an element's. */
export const EXPORT_ICON: IconName = 'file-export'
export const OPTIONS_ICON: IconName = 'adjustments'

/** The panel with the templates. */
export const TEMPLATES_ICON: IconName = 'pages'
