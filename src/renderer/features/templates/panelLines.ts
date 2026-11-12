/**
 * Values that belong together share a line of the template editor's properties: the size of the
 * type and its line spacing, the weight with italic and underline, the letter case with the space
 * between letters. A line takes the name of what it holds; each value keeps its own name for screen
 * readers and its tooltip, and a switch is an icon (italic, underline).
 */
export interface SharedLine {
  props: readonly string[]
  /** Not shared while one of these is there, which has a line of its own with the same values. */
  unless?: readonly string[]
  de: string
  en: string
}

export const SHARED_LINES: readonly SharedLine[] = [
  { props: ['paper', 'orientation'], de: 'Papierformat', en: 'Paper size' },
  { props: ['size', 'line_height'], de: 'Größe', en: 'Size' },
  { props: ['weight', 'italic', 'underline'], de: 'Schnitt', en: 'Weight' },
  { props: ['text_case', 'letter_spacing'], de: 'Schreibweise', en: 'Letter case' },
  { props: ['label_weight', 'label_style'], de: 'Schnitt', en: 'Weight' },
  { props: ['color', 'align'], de: 'Farbe', en: 'Colour' },
]

/** A switch drawn as an icon, by the property it sets. */
export const TOGGLE_ICONS: Readonly<Record<string, 'italic' | 'underline'>> = {
  italic: 'italic',
  underline: 'underline',
}

/** A field with an icon in front of it, standing for its name. */
export const FIELD_ICONS: Readonly<Record<string, 'line-height' | 'letter-spacing'>> = {
  line_height: 'line-height',
  letter_spacing: 'letter-spacing',
}

/** One line of the panel: one value with its name, or several that share it. */
export interface PanelLine {
  props: string[]
  shared?: SharedLine
}

/**
 * The lines of a group, in the order of its values: a value that shares a line with another the
 * group shows too stands in that line, where the first of them would stand.
 */
export function panelLines(ids: readonly string[]): PanelLine[] {
  const lines: PanelLine[] = []
  const done = new Set<string>()
  for (const id of ids) {
    if (done.has(id)) continue
    const shared = SHARED_LINES.find(
      (l) =>
        l.props.includes(id) &&
        !l.unless?.some((p) => ids.includes(p)) &&
        l.props.filter((p) => ids.includes(p)).length > 1,
    )
    const props = shared ? shared.props.filter((p) => ids.includes(p)) : [id]
    props.forEach((p) => done.add(p))
    lines.push(shared ? { props, shared } : { props })
  }
  return lines
}
