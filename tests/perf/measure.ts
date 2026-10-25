import { execFileSync } from 'node:child_process'
import type { ElectronApplication, Page } from '@playwright/test'

export interface ProcessRow {
  pid: number
  kind: string
  rssMb: number
}

const mb = (kb: number): number => Math.round((kb / 1024) * 10) / 10

/** Every process of the app (the main process, renderers, GPU, helpers, and the Java of the checker) with its resident memory. */
export function processTree(rootPid: number): ProcessRow[] {
  const out = execFileSync('ps', ['-ax', '-o', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' })
  const rows = out
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]), command: m[4]! }))
  const inTree = new Set<number>([rootPid])
  for (let grew = true; grew;) {
    grew = false
    for (const row of rows)
      if (inTree.has(row.ppid) && !inTree.has(row.pid)) {
        inTree.add(row.pid)
        grew = true
      }
  }
  return rows
    .filter((row) => inTree.has(row.pid))
    .map((row) => ({
      pid: row.pid,
      kind: /--type=renderer/.test(row.command)
        ? 'renderer'
        : /--type=gpu-process/.test(row.command)
          ? 'gpu'
          : /--type=utility/.test(row.command)
            ? 'utility'
            : /java/.test(row.command)
              ? 'java (checker)'
              : row.pid === rootPid
                ? 'main'
                : 'other',
      rssMb: mb(row.rss),
    }))
}

export function memorySummary(app: ElectronApplication): {
  main: number
  renderer: number
  gpu: number
  utility: number
  java: number
  other: number
  total: number
} {
  const rows = processTree(app.process().pid!)
  const sum = (kind: string): number =>
    Math.round(rows.filter((r) => r.kind === kind).reduce((a, r) => a + r.rssMb, 0))
  const total = Math.round(rows.reduce((a, r) => a + r.rssMb, 0))
  return {
    main: sum('main'),
    renderer: sum('renderer'),
    gpu: sum('gpu'),
    utility: sum('utility'),
    java: sum('java (checker)'),
    other: sum('other'),
    total,
  }
}

/** The JavaScript heap of the page in MB, after the garbage collector has run. */
export async function heapMb(page: Page): Promise<number> {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('HeapProfiler.collectGarbage')
    const usage = (await session.send('Runtime.getHeapUsage')) as { usedSize: number }
    return Math.round((usage.usedSize / 1048576) * 10) / 10
  } finally {
    await session.detach()
  }
}

/** DOM nodes and event listeners in the page: what a leak shows up in first. */
export async function domCounts(page: Page): Promise<{ nodes: number; listeners: number }> {
  const session = await page.context().newCDPSession(page)
  try {
    const counters = (await session.send('Memory.getDOMCounters')) as {
      nodes: number
      jsEventListeners: number
    }
    return { nodes: counters.nodes, listeners: counters.jsEventListeners }
  } finally {
    await session.detach()
  }
}

export const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! * 10) / 10
}

/** Starts recording the time from each key press to the frame after the editor has handled it. */
export async function startLatency(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __latency: number[]; __long: number[] }
    w.__latency = []
    w.__long = []
    document.addEventListener(
      'keydown',
      () => {
        const t0 = performance.now()
        requestAnimationFrame(() =>
          requestAnimationFrame(() => w.__latency.push(performance.now() - t0)),
        )
      },
      true,
    )
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__long.push(entry.duration)
    }).observe({ type: 'longtask', buffered: false })
  })
}

export async function readLatency(
  page: Page,
): Promise<{ p50: number; p95: number; max: number; longTasks: number }> {
  const { latency, long } = await page.evaluate(() => {
    const w = window as unknown as { __latency: number[]; __long: number[] }
    return { latency: w.__latency, long: w.__long }
  })
  return {
    p50: percentile(latency, 0.5),
    p95: percentile(latency, 0.95),
    max: Math.round(Math.max(0, ...latency) * 10) / 10,
    longTasks: long.length,
  }
}

/** Scrolls an element in steps and counts the frames that took longer than 20 ms. */
export async function scrollJank(
  page: Page,
  selector: string,
  distance: number,
): Promise<{ frames: number; slow: number; worst: number; avg: number }> {
  return page.evaluate(
    async ({ selector, distance }) => {
      const el = document.querySelector(selector) as HTMLElement
      const frames: number[] = []
      let last = performance.now()
      let position = el.scrollTop
      const step = distance / 120
      await new Promise<void>((resolve) => {
        let n = 0
        const tick = (): void => {
          const now = performance.now()
          frames.push(now - last)
          last = now
          position += step
          el.scrollTop = position
          if (++n < 120) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      return {
        frames: frames.length,
        slow: frames.filter((f) => f > 20).length,
        worst: Math.round(Math.max(...frames)),
        avg: Math.round((frames.reduce((a, f) => a + f, 0) / frames.length) * 10) / 10,
      }
    },
    { selector, distance },
  )
}

/** The main-thread time the page spends per key press (scripting, style, layout, painting), from Chromium's own counters. */
export async function perKeystroke(
  page: Page,
  type: () => Promise<void>,
  keys: number,
): Promise<{ script: number; style: number; layout: number; total: number }> {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Performance.enable')
    const read = async (): Promise<Record<string, number>> => {
      const { metrics } = (await session.send('Performance.getMetrics')) as {
        metrics: { name: string; value: number }[]
      }
      return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
    }
    const before = await read()
    await type()
    const after = await read()
    const ms = (name: string): number => ((after[name] ?? 0) - (before[name] ?? 0)) * 1000
    const per = (value: number): number => Math.round((value / keys) * 100) / 100
    const script = ms('ScriptDuration')
    const style = ms('RecalcStyleDuration')
    const layout = ms('LayoutDuration')
    return {
      script: per(script),
      style: per(style),
      layout: per(layout),
      total: per(script + style + layout),
    }
  } finally {
    await session.detach()
  }
}
