/** A colour as hue (0–360), saturation and value (0–1): the axes of the colour field. */
export interface Hsv {
  h: number
  s: number
  v: number
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function hexToHsv(hex: string): Hsv {
  const m = /^#?([0-9a-f]{6})/i.exec(hex)
  const n = m ? parseInt(m[1]!, 16) : 0
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number): number => {
    const k = (n + clamp(h, 0, 360) / 60) % 6
    return clamp(v, 0, 1) - clamp(v, 0, 1) * clamp(s, 0, 1) * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return (
    '#' +
    [f(5), f(3), f(1)]
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
