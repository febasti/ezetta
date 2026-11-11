<script lang="ts">
  /**
   * Two facing pages, an icon Tabler does not have: its `file` (a page with a folded corner) made
   * narrower and set twice on one spine, the corner folded on the outer side of each page. Drawn on
   * Tabler's grid and with its line, so it stands among the other icons as one of them.
   */
  interface Props {
    size?: number
    stroke?: number
    'aria-hidden'?: boolean | 'true' | 'false'
  }
  let { size = 24, stroke = 2, ...rest }: Props = $props()
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  {...rest}
>
  <path d="M12 5v14" />
  <path d="M12 5h-7l-3 3v9a2 2 0 0 0 2 2h8" />
  <path d="M5 5v2a1 1 0 0 1 -1 1h-2" />
  <path d="M12 5h7l3 3v9a2 2 0 0 1 -2 2h-8" />
  <path d="M19 5v2a1 1 0 0 0 1 1h2" />
</svg>
