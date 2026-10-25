<script lang="ts" module>
  import IconAlignCenter from '@tabler/icons-svelte/icons/align-center'
  import IconAlignLeft from '@tabler/icons-svelte/icons/align-left'
  import IconAlignRight from '@tabler/icons-svelte/icons/align-right'
  import IconAlertTriangle from '@tabler/icons-svelte/icons/alert-triangle'
  import IconArrowBackUp from '@tabler/icons-svelte/icons/arrow-back-up'
  import IconArrowForwardUp from '@tabler/icons-svelte/icons/arrow-forward-up'
  import IconAsterisk from '@tabler/icons-svelte/icons/asterisk'
  import IconQuote from '@tabler/icons-svelte/icons/quote'
  import IconTag from '@tabler/icons-svelte/icons/tag'
  import IconLayoutSidebarRight from '@tabler/icons-svelte/icons/layout-sidebar-right'
  import IconEye from '@tabler/icons-svelte/icons/eye'
  import IconBold from '@tabler/icons-svelte/icons/bold'
  import IconArchive from '@tabler/icons-svelte/icons/archive'
  import IconHistory from '@tabler/icons-svelte/icons/history'
  import IconCheck from '@tabler/icons-svelte/icons/check'
  import IconSelector from '@tabler/icons-svelte/icons/selector'
  import IconChevronDown from '@tabler/icons-svelte/icons/chevron-down'
  import IconChevronLeft from '@tabler/icons-svelte/icons/chevron-left'
  import IconChevronRight from '@tabler/icons-svelte/icons/chevron-right'
  import IconCode from '@tabler/icons-svelte/icons/code'
  import IconEyeOff from '@tabler/icons-svelte/icons/eye-off'
  import IconFileText from '@tabler/icons-svelte/icons/file-text'
  import IconFolder from '@tabler/icons-svelte/icons/folder'
  import IconHighlight from '@tabler/icons-svelte/icons/highlight'
  import IconItalic from '@tabler/icons-svelte/icons/italic'
  import IconLayoutSidebar from '@tabler/icons-svelte/icons/layout-sidebar'
  import IconLink from '@tabler/icons-svelte/icons/link'
  import IconList from '@tabler/icons-svelte/icons/list'
  import IconListNumbers from '@tabler/icons-svelte/icons/list-numbers'
  import IconMessage from '@tabler/icons-svelte/icons/message'
  import IconNotes from '@tabler/icons-svelte/icons/notes'
  import IconBook from '@tabler/icons-svelte/icons/book'
  import IconTable from '@tabler/icons-svelte/icons/table'
  import IconMathFunction from '@tabler/icons-svelte/icons/math-function'
  import IconPhoto from '@tabler/icons-svelte/icons/photo'
  import IconPhotoOff from '@tabler/icons-svelte/icons/photo-off'
  import IconPilcrow from '@tabler/icons-svelte/icons/pilcrow'
  import IconPlus from '@tabler/icons-svelte/icons/plus'
  import IconSearch from '@tabler/icons-svelte/icons/search'
  import IconTypography from '@tabler/icons-svelte/icons/typography'
  import IconNotebook from '@tabler/icons-svelte/icons/notebook'
  import IconPencil from '@tabler/icons-svelte/icons/pencil'
  import IconFlag from '@tabler/icons-svelte/icons/flag'
  import IconArrowDown from '@tabler/icons-svelte/icons/arrow-down'
  import IconArrowUp from '@tabler/icons-svelte/icons/arrow-up'
  import IconAbc from '@tabler/icons-svelte/icons/abc'
  import IconLetterCase from '@tabler/icons-svelte/icons/letter-case'
  import IconRegex from '@tabler/icons-svelte/icons/regex'
  import IconX from '@tabler/icons-svelte/icons/x'
  import IconLayout from '@tabler/icons-svelte/icons/layout'
  import IconListTree from '@tabler/icons-svelte/icons/list-tree'
  import IconAdjustments from '@tabler/icons-svelte/icons/adjustments'
  import IconLock from '@tabler/icons-svelte/icons/lock'
  import IconCopy from '@tabler/icons-svelte/icons/copy'
  import IconTrash from '@tabler/icons-svelte/icons/trash'
  import IconFileImport from '@tabler/icons-svelte/icons/file-import'
  import IconFileExport from '@tabler/icons-svelte/icons/file-export'
  import IconRefresh from '@tabler/icons-svelte/icons/refresh'
  import IconCircleCheck from '@tabler/icons-svelte/icons/circle-check'
  import IconChevronUp from '@tabler/icons-svelte/icons/chevron-up'
  import IconHeading from '@tabler/icons-svelte/icons/heading'
  import IconH1 from '@tabler/icons-svelte/icons/h-1'
  import IconH2 from '@tabler/icons-svelte/icons/h-2'
  import IconH3 from '@tabler/icons-svelte/icons/h-3'
  import IconH4 from '@tabler/icons-svelte/icons/h-4'
  import IconNote from '@tabler/icons-svelte/icons/note'
  import IconSun from '@tabler/icons-svelte/icons/sun'
  import IconMoon from '@tabler/icons-svelte/icons/moon'
  import IconDeviceDesktop from '@tabler/icons-svelte/icons/device-desktop'

  /**
   * The one icon set: Tabler (MIT), outline style. App code names icons by meaning, here, and
   * nowhere else. To add an icon, import it above and add it to this list.
   */
  const ICONS = {
    'chevron-right': IconChevronRight,
    'chevron-down': IconChevronDown,
    'chevron-left': IconChevronLeft,
    plus: IconPlus,
    folder: IconFolder,
    file: IconFileText,
    'eye-off': IconEyeOff,
    warning: IconAlertTriangle,
    'panel-left': IconLayoutSidebar,
    search: IconSearch,
    check: IconCheck,
    archive: IconArchive,
    history: IconHistory,
    selector: IconSelector,
    x: IconX,
    lock: IconLock,
    layout: IconLayout,
    'list-tree': IconListTree,
    adjustments: IconAdjustments,
    copy: IconCopy,
    trash: IconTrash,
    'file-import': IconFileImport,
    'file-export': IconFileExport,
    highlighter: IconHighlight,
    comment: IconMessage,
    code: IconCode,
    bold: IconBold,
    italic: IconItalic,
    link: IconLink,
    list: IconList,
    'list-numbers': IconListNumbers,
    quote: IconQuote,
    paragraph: IconPilcrow,
    refresh: IconRefresh,
    'align-left': IconAlignLeft,
    'align-center': IconAlignCenter,
    'align-right': IconAlignRight,
    'circle-check': IconCircleCheck,
    'chevron-up': IconChevronUp,
    heading: IconHeading,
    'heading-1': IconH1,
    'heading-2': IconH2,
    'heading-3': IconH3,
    'heading-4': IconH4,
    undo: IconArrowBackUp,
    redo: IconArrowForwardUp,
    asterisk: IconAsterisk,
    typography: IconTypography,
    notes: IconNotes,
    image: IconPhoto,
    formula: IconMathFunction,
    citation: IconBook,
    tag: IconTag,
    table: IconTable,
    'panel-right': IconLayoutSidebarRight,
    preview: IconEye,
    'image-off': IconPhotoOff,
    'arrow-up': IconArrowUp,
    'arrow-down': IconArrowDown,
    'letter-case': IconLetterCase,
    'whole-word': IconAbc,
    regex: IconRegex,
    book: IconBook,
    notebook: IconNotebook,
    pencil: IconPencil,
    flag: IconFlag,
    note: IconNote,
    sun: IconSun,
    moon: IconMoon,
    'device-desktop': IconDeviceDesktop,
  } as const
  export type IconName = keyof typeof ICONS
  export const ICON_NAMES = Object.keys(ICONS) as IconName[]
</script>

<script lang="ts">
  interface Props {
    name: IconName
    size?: number
  }
  let { name, size = 16 }: Props = $props()
  const Component = $derived(ICONS[name])
</script>

<Component {size} stroke={1.75} aria-hidden="true" />
