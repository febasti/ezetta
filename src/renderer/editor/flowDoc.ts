/** One sheet inside the continuous view. */
export interface FlowSource {
  path: string
  title: string
  content: string
}

export interface FlowSegment {
  path: string
  title: string
  /** Start and end offsets of this sheet's text in the combined document. */
  from: number
  to: number
}

export interface FlowDoc {
  doc: string
  segments: FlowSegment[]
}

/**
 * Joins sheets into the text of the continuous view. Trailing line breaks of each sheet are
 * dropped and sheets are separated by a blank line, so an offset inside a segment is the same as
 * the offset inside the sheet's file. Nothing in this text is ever written back.
 */
export function buildFlow(sources: readonly FlowSource[]): FlowDoc {
  const segments: FlowSegment[] = []
  let doc = ''
  for (const source of sources) {
    if (segments.length > 0) doc += '\n\n'
    const text = source.content.replace(/\n+$/, '')
    segments.push({
      path: source.path,
      title: source.title,
      from: doc.length,
      to: doc.length + text.length,
    })
    doc += text
  }
  return { doc, segments }
}

/** The segment that contains `position`, or the nearest one when it falls on a separator. */
export function segmentAt(segments: readonly FlowSegment[], position: number): FlowSegment | null {
  if (segments.length === 0) return null
  let found = segments[0]!
  for (const segment of segments) {
    if (segment.from <= position) found = segment
    else break
  }
  return found
}
