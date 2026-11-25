export const SWIPE = {
  travel: 40,
  quiet: 120,
  back: 6,
  window: 24,
  rise: 1.5,
  lift: 0.3,
  gap: 100,
  split: 5,
} as const

export type SwipeReading = {
  take: boolean

  step: -1 | 0 | 1
}

export function swipeReader(): (at: number, dx: number, dy: number) => SwipeReading {
  let last = Number.NEGATIVE_INFINITY
  let travel = 0
  let drift = 0
  let spent = false
  let way = 0
  let stepped = Number.NEGATIVE_INFINITY

  let slowest = Number.POSITIVE_INFINITY

  let held: { at: number; speed: number } | null = null

  const recent: Array<{ at: number; size: number }> = []

  return (at, dx, dy) => {
    const since = at - last
    if (since > SWIPE.quiet) {
      travel = 0
      drift = 0
      spent = false
      held = null
      recent.length = 0
    }
    last = at
    const sideways = Math.abs(dx) > Math.abs(dy)

    recent.push({ at, size: Math.abs(dx) })
    while (recent.length > 1 && recent[1]!.at <= at - SWIPE.window) recent.shift()
    const before = recent[0]!.at <= at - SWIPE.window ? recent[0]!.at : null
    let moved = 0
    for (const event of recent) if (event.at > at - SWIPE.window) moved += event.size
    const speed = moved / (before === null ? SWIPE.window : at - before)

    if (spent) {
      const back = sideways && Math.sign(dx) === -way && Math.abs(dx) > SWIPE.back
      if (held && since >= SWIPE.split && held.at - stepped > SWIPE.gap) {
        slowest = Math.min(slowest, held.speed)
      }
      held = { at, speed }
      const rose = at - stepped > SWIPE.gap && speed > slowest * SWIPE.rise + SWIPE.lift
      if (!back && !rose) return { take: sideways, step: 0 }
      spent = false
      travel = 0
      drift = 0
    }

    if (sideways && drift >= Math.abs(travel)) {
      travel = 0
      drift = 0
    }
    travel += dx
    drift += Math.abs(dy)
    if (Math.abs(travel) < SWIPE.travel || Math.abs(travel) <= drift) {
      return { take: sideways, step: 0 }
    }
    const step = travel > 0 ? 1 : -1
    spent = true
    way = step
    stepped = at
    slowest = Number.POSITIVE_INFINITY
    held = null
    return { take: sideways, step }
  }
}

export function listenForSwipes(
  element: HTMLElement,
  onStep: (step: 1 | -1) => void,
  pageable: () => boolean = () => true,
): () => void {
  const read = swipeReader()
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || !pageable()) return
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? element.offsetWidth
          : 1
    const { take, step } = read(event.timeStamp, event.deltaX * unit, event.deltaY * unit)

    if (take && event.cancelable) event.preventDefault()
    if (step !== 0) onStep(step)
  }
  element.addEventListener('wheel', onWheel, { passive: false })
  return () => element.removeEventListener('wheel', onWheel)
}
