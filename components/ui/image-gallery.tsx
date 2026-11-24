'use client'

import { Dialog } from '@base-ui/react/dialog'
import { useDirection } from '@base-ui/react/direction-provider'
import {
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'

import { Button } from '@/components/ui/button'
import { swipeReader } from '@/lib/trackpad-swipe'
import { cn } from '@/lib/utils'
import { X, ChevronLeft, ChevronRight } from "lucide-react"

export type ImageGalleryImage = {

  src?: string
  srcSet?: string

  width: number
  height: number
  alt: string

  color?: string

  credit?: { name: string; href: string }
}

const NOMINAL_WIDTH = 960

function rowsFor(
  ratios: readonly number[],
  width: number,
  gap: number,
  target: number,
  least = 1,
): number[][] {
  const count = ratios.length
  const fewest = Math.max(1, Math.min(least, count))
  const best = Array.from({ length: count + 1 }, () => Number.POSITIVE_INFINITY)
  const start = Array.from({ length: count + 1 }, () => 0)
  best[0] = 0

  for (let end = 1; end <= count; end += 1) {
    let sum = 0
    for (let first = end - 1; first >= 0; first -= 1) {
      sum += ratios[first] ?? 1
      const size = end - first
      const height = (width - gap * (size - 1)) / sum

      if (height <= 0) break
      if (size < fewest) continue
      const miss = (height - target) / target
      const total = (best[first] ?? Number.POSITIVE_INFINITY) + miss * miss
      if (total < (best[end] ?? Number.POSITIVE_INFINITY)) {
        best[end] = total
        start[end] = first
      }

      if (height < target / 3) break
    }
  }

  if (!Number.isFinite(best[count] ?? Number.POSITIVE_INFINITY)) {
    const rows: number[][] = []
    for (let first = 0; first < count; first += fewest) {
      const row = Array.from({ length: Math.min(fewest, count - first) }, (_, at) => first + at)
      if (row.length < fewest && rows.length > 0) rows.at(-1)?.push(...row)
      else rows.push(row)
    }
    return rows
  }

  const rows: number[][] = []
  for (let end = count; end > 0; end = start[end] ?? 0) {
    const first = start[end] ?? 0
    rows.unshift(Array.from({ length: end - first }, (_, offset) => first + offset))
  }
  return rows
}

const FLIGHT_OUT = { response: 0.3, bounce: 0.25, overshoot: 8, ms: 450 }
const FLIGHT_HOME = { response: 0.2, bounce: 0, ms: 190 }

const HANDOFF_MS = 70

function bounceFor(travel: number) {
  if (travel <= FLIGHT_OUT.overshoot) return FLIGHT_OUT.bounce
  const reach = -Math.log(FLIGHT_OUT.overshoot / travel) / Math.PI
  const damping = reach / Math.hypot(1, reach)
  return Math.max(0, Math.min(FLIGHT_OUT.bounce, 1 - damping))
}

function springCurve({ response, bounce, ms }: { response: number; bounce: number; ms: number }) {
  if (typeof CSS === 'undefined' || !CSS.supports('animation-timing-function', 'linear(0, 1)')) {
    return bounce > 0 ? 'cubic-bezier(0.3, 1.18, 0.5, 1)' : 'cubic-bezier(0.32, 0.72, 0, 1)'
  }
  const omega = (2 * Math.PI) / response
  const damping = 1 - bounce
  const decay = damping * omega
  const ringing = omega * Math.sqrt(Math.max(0, 1 - damping * damping))
  const at = (seconds: number) =>
    ringing > 0
      ? 1 -
        Math.exp(-decay * seconds) *
          (Math.cos(ringing * seconds) + (decay / ringing) * Math.sin(ringing * seconds))
      : 1 - (1 + omega * seconds) * Math.exp(-omega * seconds)
  const end = at(ms / 1000)
  const steps = 48
  const points = Array.from({ length: steps + 1 }, (_, step) =>
    (at((ms / 1000) * (step / steps)) / end).toFixed(4),
  )
  return `linear(${points.join(', ')})`
}

const RIPPLE = {

  push: 24,

  spread: 0.1,

  most: 64,

  scale: 0.9,

  blur: 6,

  wave: 0.07,
  waveCap: 90,
  waveHome: 0.04,
  waveHomeCap: 40,

  screen: 1280,

  least: 0.35,
} as const

function rippleFor(dx: number, dy: number, reach = 1) {
  const distance = Math.hypot(dx, dy)
  const push =
    distance > 0 ? Math.min(RIPPLE.most, RIPPLE.push + distance * RIPPLE.spread) * reach : 0
  return {
    x: distance > 0 ? (dx / distance) * push : 0,
    y: distance > 0 ? (dy / distance) * push : 0,
    scale: distance > 0 ? RIPPLE.scale : 1,
    blur: distance > 0 ? RIPPLE.blur : 0,
    out: Math.round(Math.min(distance * RIPPLE.wave, RIPPLE.waveCap)),
    home: Math.round(Math.min(distance * RIPPLE.waveHome, RIPPLE.waveHomeCap)),
  }
}

function reachFor(screen: number) {
  return Math.min(1, Math.max(RIPPLE.least, screen / RIPPLE.screen))
}

const STRONG_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const SOFT_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)'
const GENTLE_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const EVEN = 'cubic-bezier(0.45, 0, 0.55, 1)'
const RIPPLE_OUT = {
  '--ripple-duration': '460ms, 460ms, 380ms, 380ms',
  '--ripple-ease': `${STRONG_OUT}, ${STRONG_OUT}, ${GENTLE_OUT}, ${GENTLE_OUT}`,
}
const RIPPLE_HOME = {
  '--ripple-duration': '300ms, 300ms, 220ms, 220ms',
  '--ripple-ease': `${STRONG_OUT}, ${STRONG_OUT}, ${SOFT_OUT}, ${SOFT_OUT}`,
}

const BACKDROP = { '--backdrop-in': EVEN, '--backdrop-out': SOFT_OUT }

const ITEM = '[data-slot="lightbox-item"]'
const FRAME = '[data-slot="lightbox-frame"]'

const center = (box: DOMRect) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 })

function over(rest: DOMRect, target: DOMRect) {
  const scale = target.width / rest.width
  const from = center(rest)
  const to = center(target)
  return {
    scale,
    transform: `translate(${String(to.x - from.x)}px, ${String(to.y - from.y)}px) scale(${String(scale)})`,
  }
}

type Seen = { top: number; right: number; bottom: number; left: number }

function seenOf(tile: Element, from: { x: number; y: number }): Seen {
  const box = tile.getBoundingClientRect()
  const shows = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y)
    return hit !== null && tile.contains(hit)
  }
  const all = { top: box.top, right: box.right, bottom: box.bottom, left: box.left }
  if (!shows(from.x, from.y)) return all

  const edge = (seen: number, side: number, at: (along: number) => boolean) => {
    const inside = side + Math.sign(seen - side) * 0.5
    if (at(inside)) return 0
    let lost = inside
    let found = seen
    while (Math.abs(found - lost) > 0.5) {
      const mid = (found + lost) / 2
      if (at(mid)) found = mid
      else lost = mid
    }
    return Math.abs(found - side)
  }
  return {
    top: box.top + edge(from.y, box.top, (y) => shows(from.x, y)),
    right: box.right - edge(from.x, box.right, (x) => shows(x, from.y)),
    bottom: box.bottom - edge(from.y, box.bottom, (y) => shows(from.x, y)),
    left: box.left + edge(from.x, box.left, (x) => shows(x, from.y)),
  }
}

function clipFor(box: Seen, seen: Seen, scale: number) {
  const sides = [
    seen.top - box.top,
    box.right - seen.right,
    box.bottom - seen.bottom,
    seen.left - box.left,
  ].map((side) => Math.max(0, side))
  if (sides.every((side) => side < 0.5)) return null
  return `inset(${sides.map((side) => `${(side / scale).toFixed(2)}px`).join(' ')})`
}

type Trip = {
  index: number

  from: DOMRect

  seen: Seen

  radius: number

  still: boolean
  closing: boolean
  frame?: HTMLElement
  animation?: Animation

  tileFade?: Animation
  photoFade?: Animation
}

function ImageGallery({
  images,
  rowHeight = 240,
  gap = 8,
  rippleZoom = true,
  minPerRow = 2,
  className,
  style,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & {
  images: readonly ImageGalleryImage[]

  rowHeight?: number

  gap?: number

  rippleZoom?: boolean

  minPerRow?: number
}) {
  const [width, setWidth] = useState<number>()

  const [zoom, setZoom] = useState<{
    index: number
    phase: 'open' | 'closing' | 'closed'
    base: string
  } | null>(null)

  const [drawn, setDrawn] = useState<number>()

  const [held, setHeld] = useState<number>()

  const gallery = useRef<HTMLDivElement | null>(null)
  const trip = useRef<Trip | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const measured = useCallback((element: HTMLDivElement | null) => {
    gallery.current = element
    if (!element) return
    const watch = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    watch.observe(element)
    return () => {
      watch.disconnect()
      gallery.current = null
    }
  }, [])

  const open = useCallback((index: number, trigger: HTMLElement, at?: { x: number; y: number }) => {
    const root = gallery.current
    if (!root || trip.current) return
    const item = root.querySelector<HTMLElement>(`${ITEM}[data-index="${String(index)}"]`)
    const frame = item?.querySelector<HTMLElement>(FRAME)
    if (!item || !frame) return

    const from = frame.getBoundingClientRect()
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const origin = center(from)
    const reach = reachFor(window.innerWidth)

    for (const other of root.querySelectorAll<HTMLElement>(ITEM)) {
      const at = center(other.getBoundingClientRect())
      const part =
        other === item ? rippleFor(0, 0) : rippleFor(at.x - origin.x, at.y - origin.y, reach)
      const moves = other !== item && !still
      other.style.setProperty('--ripple-x', `${(moves ? part.x : 0).toFixed(1)}px`)
      other.style.setProperty('--ripple-y', `${(moves ? part.y : 0).toFixed(1)}px`)
      other.style.setProperty('--ripple-scale', String(moves ? part.scale : 1))
      other.style.setProperty('--ripple-blur', `${String(moves ? part.blur : 0)}px`)
      other.style.setProperty('--ripple-out', `${String(part.out)}ms`)
      other.style.setProperty('--ripple-home', `${String(part.home)}ms`)
    }

    trip.current = {
      index,
      from,

      seen: seenOf(item, at ?? center(from)),
      radius: Number.parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0,
      still,
      closing: false,
    }
    returnFocus.current = trigger
    setHeld(root.getBoundingClientRect().width)
    setZoom({ index, phase: 'open', base: item.querySelector('img')?.currentSrc ?? '' })
  }, [])

  const launch = useCallback((frame: HTMLDivElement | null) => {
    const current = trip.current
    if (!frame || !current) return
    current.frame = frame
    const rest = frame.getBoundingClientRect()
    const radius = getComputedStyle(frame).borderTopLeftRadius
    setDrawn(Math.ceil(rest.width))
    const item = gallery.current?.querySelector<HTMLElement>(
      `${ITEM}[data-index="${String(current.index)}"]`,
    )

    item?.setAttribute('data-lifted', '')
    current.tileFade = item?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: current.still ? 200 : HANDOFF_MS,
      easing: 'linear',
      fill: 'forwards',
    })

    if (current.still) {
      current.animation = frame.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
        easing: SOFT_OUT,
      })
    } else {
      const start = over(rest, current.from)

      const clip = clipFor(current.from, current.seen, start.scale)
      const travel =
        Math.hypot(
          center(rest).x - center(current.from).x,
          center(rest).y - center(current.from).y,
        ) +
        Math.max(rest.width - current.from.width, rest.height - current.from.height) / 2
      current.animation = frame.animate(
        [

          {
            transform: start.transform,
            borderRadius: `${String(current.radius / start.scale)}px`,
            ...(clip ? { clipPath: clip } : {}),
          },
          { transform: 'none', borderRadius: radius, ...(clip ? { clipPath: 'inset(0px)' } : {}) },
        ],
        {
          duration: FLIGHT_OUT.ms,
          easing: springCurve({ ...FLIGHT_OUT, bounce: bounceFor(travel) }),
        },
      )
      current.photoFade = frame.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: HANDOFF_MS,
        easing: 'linear',
      })
    }
    return () => {
      current.animation?.cancel()
      current.photoFade?.cancel()
      current.tileFade?.cancel()
    }
  }, [])

  const close = useCallback(() => {
    const current = trip.current
    const root = gallery.current
    if (!current || current.closing) return
    current.closing = true
    setZoom((now) => now && { ...now, phase: 'closing' })

    const item = root?.querySelector<HTMLElement>(`${ITEM}[data-index="${String(current.index)}"]`)
    const tile = item?.querySelector<HTMLElement>(FRAME)
    const frame = current.frame

    const land = () => {
      item?.removeAttribute('data-lifted')

      current.tileFade?.cancel()
      trip.current = null
      setZoom((now) => now && { ...now, phase: 'closed' })
    }
    if (!frame || !item || !tile) {
      land()
      return
    }

    if (current.still) {
      current.tileFade?.cancel()
      current.tileFade = item.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 150,
        easing: SOFT_OUT,
        fill: 'both',
      })
      current.animation?.cancel()
      current.animation = frame.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 150,
        easing: SOFT_OUT,
        fill: 'forwards',
      })
      current.animation.onfinish = land
      return
    }

    const now = getComputedStyle(frame)
    const transform = now.transform
    const radius = now.borderTopLeftRadius
    const clipNow = now.clipPath

    const shown = Number(now.opacity)
    current.animation?.cancel()
    current.photoFade?.cancel()

    frame.style.transform = ''
    frame
      .querySelector<HTMLElement>('[data-slot="lightbox-layer"]')
      ?.style.removeProperty('transform')
    const end = over(frame.getBoundingClientRect(), tile.getBoundingClientRect())
    const tileRadius = Number.parseFloat(getComputedStyle(tile).borderTopLeftRadius) || 0

    const home = tile.getBoundingClientRect()
    const clip = clipFor(home, current.seen, end.scale)
    const clips = clip !== null || clipNow !== 'none'
    current.animation = frame.animate(
      [
        {
          transform,
          borderRadius: radius,
          ...(clips ? { clipPath: clipNow === 'none' ? 'inset(0px)' : clipNow } : {}),
        },
        {
          transform: end.transform,
          borderRadius: `${String(tileRadius / end.scale)}px`,
          ...(clips ? { clipPath: clip ?? 'inset(0px)' } : {}),
        },
      ],
      {
        duration: FLIGHT_HOME.ms,
        easing: springCurve(FLIGHT_HOME),
        fill: 'forwards',
      },
    )
    const whole = FLIGHT_HOME.ms + HANDOFF_MS
    const landing = FLIGHT_HOME.ms / whole
    current.tileFade?.cancel()
    current.tileFade = item.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FLIGHT_HOME.ms,
      easing: 'step-end',
      fill: 'both',
    })
    current.photoFade = frame.animate(
      [
        { opacity: shown },
        { opacity: 1, offset: Math.min(landing, (1 - shown) * 0.25) },
        { opacity: 1, offset: landing },
        { opacity: 0 },
      ],
      { duration: whole, easing: 'linear', fill: 'forwards' },
    )
    current.photoFade.onfinish = land
  }, [])

  const neighborOf = useCallback(
    (from: number, delta: 1 | -1) => {
      if (images.length < 2) return undefined
      let at = from
      for (let tried = 1; tried < images.length; tried++) {
        at = (at + delta + images.length) % images.length
        if (images[at]?.src) return at
      }
      return undefined
    },
    [images],
  )

  const step = useCallback(
    (delta: 1 | -1) => {
      const current = trip.current
      const root = gallery.current
      if (!current || !root || current.closing) return
      const next = neighborOf(current.index, delta)
      if (next === undefined) return
      const was = root.querySelector<HTMLElement>(`${ITEM}[data-index="${String(current.index)}"]`)
      const item = root.querySelector<HTMLElement>(`${ITEM}[data-index="${String(next)}"]`)
      const snap = (element: HTMLElement, change: () => void) => {
        element.style.transition = 'none'
        change()
        void element.offsetWidth
        element.style.transition = ''
      }
      if (was) {
        snap(was, () => {
          current.tileFade?.cancel()
          was.removeAttribute('data-lifted')
        })
      }
      if (item) {
        snap(item, () => {
          for (const [name, rest] of [
            ['--ripple-x', '0px'],
            ['--ripple-y', '0px'],
            ['--ripple-scale', '1'],
            ['--ripple-blur', '0px'],
          ] as const) {
            item.style.setProperty(name, rest)
          }
          item.setAttribute('data-lifted', '')
          current.tileFade = item.animate([{ opacity: 0 }, { opacity: 0 }], {
            duration: 1,
            fill: 'forwards',
          })
        })

        item.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const frame = item.querySelector<HTMLElement>(FRAME)
        if (frame) {
          const box = frame.getBoundingClientRect()
          current.seen = { top: box.top, right: box.right, bottom: box.bottom, left: box.left }
          current.radius = Number.parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0
        }
      }
      current.index = next
      setZoom(
        (now) => now && { ...now, index: next, base: item?.querySelector('img')?.currentSrc ?? '' },
      )
    },
    [neighborOf],
  )

  const settle = useCallback(() => {
    const current = trip.current
    current?.animation?.finish()
    current?.photoFade?.finish()
  }, [])

  const ratios = useMemo(() => images.map((image) => image.width / image.height), [images])
  const laidOut = (zoom ? held : undefined) ?? width ?? NOMINAL_WIDTH
  const rows = useMemo(
    () => rowsFor(ratios, laidOut, gap, rowHeight, minPerRow),
    [ratios, laidOut, gap, rowHeight, minPerRow],
  )
  const zoomed = zoom ? images[zoom.index] : undefined

  const openable = useMemo(
    () => images.flatMap((image, index) => (image.src ? [index] : [])),
    [images],
  )
  const previousAt = zoom ? neighborOf(zoom.index, -1) : undefined
  const nextAt = zoom ? neighborOf(zoom.index, 1) : undefined

  return (
    <>
      <div
        ref={measured}
        data-slot="image-gallery"
        data-zoomed={zoom?.phase === 'open' || undefined}
        style={
          {
            '--lightbox-gap': `${String(gap)}px`,
            ...(zoom?.phase === 'open' ? RIPPLE_OUT : RIPPLE_HOME),
            ...style,
          } as CSSProperties
        }
        className={cn('group/lightbox flex flex-col gap-(--lightbox-gap)', className)}
        {...props}
      >
        {rows.map((row) => {
          const share = row.reduce((sum, index) => sum + (ratios[index] ?? 1), 0)
          const room = laidOut - gap * (row.length - 1)
          return (
            <div key={row[0]} data-slot="lightbox-row" className="flex gap-(--lightbox-gap)">
              {row.map((index) => {
                const image = images[index]
                if (!image) return null
                return (
                  <GalleryTile
                    key={image.src ?? index}
                    index={index}
                    image={image}
                    ratio={ratios[index] ?? 1}

                    part={(ratios[index] ?? 1) / share}

                    drawn={Math.ceil((room * (ratios[index] ?? 1)) / share)}
                    onOpen={rippleZoom && image.src ? open : undefined}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {rippleZoom ? (
        <ZoomDialog
          image={zoomed}
          base={zoom?.base}
          drawn={drawn}
          open={zoom !== null && zoom.phase !== 'closed'}
          leaving={zoom?.phase !== 'open'}
          onClose={close}
          onClosed={() => {
            setZoom(null)
            setDrawn(undefined)
            setHeld(undefined)

            gallery.current?.style.removeProperty('--lightbox-reveal')
          }}
          launch={launch}
          returnFocus={returnFocus}
          previous={previousAt === undefined ? undefined : images[previousAt]}
          next={nextAt === undefined ? undefined : images[nextAt]}
          position={
            zoom ? { index: openable.indexOf(zoom.index) + 1, count: openable.length } : undefined
          }
          onStep={step}
          onSettle={settle}
          onReveal={(shown, holding) => {
            const root = gallery.current
            if (!root) return
            root.style.setProperty('--lightbox-reveal', String(shown))
            if (holding) root.setAttribute('data-revealing', '')
            else root.removeAttribute('data-revealing')
          }}
        />
      ) : null}
    </>
  )
}

function coverOver(rest: DOMRect, target: DOMRect, radius: number) {
  const scale = Math.max(target.width / rest.width, target.height / rest.height)
  const from = center(rest)
  const to = center(target)
  const x = Math.max(0, (rest.width - target.width / scale) / 2)
  const y = Math.max(0, (rest.height - target.height / scale) / 2)
  return {
    scale,
    transform: `translate(${String(to.x - from.x)}px, ${String(to.y - from.y)}px) scale(${String(scale)})`,
    clip: `inset(${y.toFixed(2)}px ${x.toFixed(2)}px round ${(radius / scale).toFixed(2)}px)`,
  }
}

type Single = {
  from: DOMRect
  radius: number
  still: boolean
  closing: boolean
  frame?: HTMLElement
  animation?: Animation
  tileFade?: Animation
  photoFade?: Animation
}

function LightboxPhoto({
  src,
  alt,
  width,
  height,
  className,
  children,
  ...props
}: Omit<ComponentProps<'button'>, 'children' | 'onClick'> & {
  src: string
  alt: string
  width?: number
  height?: number
  children: ReactNode
}) {
  const [image, setImage] = useState<ImageGalleryImage>()
  const [leaving, setLeaving] = useState(false)
  const [drawn, setDrawn] = useState<number>()
  const trigger = useRef<HTMLButtonElement>(null)
  const trip = useRef<Single | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const open = () => {
    const tile = trigger.current
    if (!tile || trip.current) return
    const from = tile.getBoundingClientRect()
    const shown = tile.querySelector('img')
    trip.current = {
      from,
      radius: Number.parseFloat(getComputedStyle(tile).borderTopLeftRadius) || 0,
      still: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      closing: false,
    }
    returnFocus.current = tile
    setLeaving(false)
    setImage({
      src,
      alt,
      width: width ?? (shown?.naturalWidth || from.width),
      height: height ?? (shown?.naturalHeight || from.height),
    })
  }

  const launch = useCallback((frame: HTMLDivElement | null) => {
    const current = trip.current
    const tile = trigger.current
    if (!frame || !current || !tile) return
    current.frame = frame
    const rest = frame.getBoundingClientRect()
    const radius = getComputedStyle(frame).borderTopLeftRadius
    setDrawn(Math.ceil(rest.width))
    current.tileFade = tile.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: current.still ? 200 : HANDOFF_MS,
      easing: 'linear',
      fill: 'forwards',
    })

    if (current.still) {
      current.animation = frame.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
        easing: SOFT_OUT,
      })
    } else {
      const start = coverOver(rest, current.from, current.radius)
      const travel =
        Math.hypot(
          center(rest).x - center(current.from).x,
          center(rest).y - center(current.from).y,
        ) +
        Math.max(rest.width - current.from.width, rest.height - current.from.height) / 2
      current.animation = frame.animate(
        [
          { transform: start.transform, clipPath: start.clip },
          { transform: 'none', clipPath: `inset(0px round ${radius})` },
        ],
        {
          duration: FLIGHT_OUT.ms,
          easing: springCurve({ ...FLIGHT_OUT, bounce: bounceFor(travel) }),
        },
      )
      current.photoFade = frame.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: HANDOFF_MS,
        easing: 'linear',
      })
    }
    return () => {
      current.animation?.cancel()
      current.photoFade?.cancel()
      current.tileFade?.cancel()
    }
  }, [])

  const close = useCallback(() => {
    const current = trip.current
    const tile = trigger.current
    if (!current || current.closing) return
    current.closing = true
    setLeaving(true)
    const frame = current.frame
    const land = () => {
      current.tileFade?.cancel()
      trip.current = null
      setImage(undefined)
    }
    if (!frame || !tile) {
      land()
      return
    }

    if (current.still) {
      current.tileFade?.cancel()
      current.tileFade = tile.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 150,
        easing: SOFT_OUT,
        fill: 'both',
      })
      current.animation?.cancel()
      current.animation = frame.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 150,
        easing: SOFT_OUT,
        fill: 'forwards',
      })
      current.animation.onfinish = land
      return
    }

    const now = getComputedStyle(frame)
    const shown = Number(now.opacity)
    const transform = now.transform
    const clipNow =
      now.clipPath === 'none' ? `inset(0px round ${now.borderTopLeftRadius})` : now.clipPath
    current.animation?.cancel()
    current.photoFade?.cancel()

    frame.style.transform = ''
    frame
      .querySelector<HTMLElement>('[data-slot="lightbox-layer"]')
      ?.style.removeProperty('transform')

    const rest = frame.getBoundingClientRect()
    const end = coverOver(rest, tile.getBoundingClientRect(), current.radius)
    current.animation = frame.animate(
      [
        { transform, clipPath: clipNow },
        { transform: end.transform, clipPath: end.clip },
      ],
      { duration: FLIGHT_HOME.ms, easing: springCurve(FLIGHT_HOME), fill: 'forwards' },
    )
    const whole = FLIGHT_HOME.ms + HANDOFF_MS
    const landing = FLIGHT_HOME.ms / whole
    current.tileFade?.cancel()
    current.tileFade = tile.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FLIGHT_HOME.ms,
      easing: 'step-end',
      fill: 'both',
    })
    current.photoFade = frame.animate(
      [
        { opacity: shown },
        { opacity: 1, offset: Math.min(landing, (1 - shown) * 0.25) },
        { opacity: 1, offset: landing },
        { opacity: 0 },
      ],
      { duration: whole, easing: 'linear', fill: 'forwards' },
    )
    current.photoFade.onfinish = land
  }, [])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-slot="lightbox-photo"
        aria-label={`Open ${alt}`}
        aria-haspopup="dialog"
        onClick={open}

        className={cn(
          'block cursor-zoom-in rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
          className,
        )}
        {...props}
      >
        {children}
      </button>
      <ZoomDialog
        image={image}
        base={src}
        drawn={drawn}
        open={image !== undefined}
        leaving={leaving}
        onClose={close}
        onClosed={() => {
          setLeaving(false)
          setDrawn(undefined)
        }}
        launch={launch}
        returnFocus={returnFocus}
        onSettle={() => {
          trip.current?.animation?.finish()
          trip.current?.photoFade?.finish()
        }}
      />
    </>
  )
}

const SLOP = 8

const FLICK = 0.45

const SWIPE_SHARE = 0.2

const DISMISS = 110
const MAX_ZOOM = 4

const REVEAL = 300

const PINCH_REVEAL = 0.4

const PINCH_CLOSE = 0.8

const DOUBLE_TAP = { ms: 300, px: 30 }

const HELD_STILL = 80

const KEY_ZOOM = 1.6
const KEY_PAN = 0.2

const WHEEL_ZOOM = 0.01
const WHEEL_STEP = 25

const SETTLE = { response: 0.3 }
const DECELERATION = 0.998

const RUBBER = 0.55

type Axis = {
  value: number
  velocity: number
  target: number
  state: 'rest' | 'spring' | 'coast'

  low: number
  high: number
}

const axis = (value: number): Axis => ({
  value,
  velocity: 0,
  target: value,
  state: 'rest',
  low: Number.NEGATIVE_INFINITY,
  high: Number.POSITIVE_INFINITY,
})

function advance(motion: Axis, ms: number, epsilon: number) {
  const omega = (2 * Math.PI) / (SETTLE.response * 1000)
  let left = ms
  while (left > 0 && motion.state !== 'rest') {
    const dt = Math.min(4, left)
    left -= dt
    if (motion.state === 'coast') {
      const edge =
        motion.value < motion.low
          ? motion.low
          : motion.value > motion.high
            ? motion.high
            : undefined
      if (edge === undefined) {
        motion.velocity *= DECELERATION ** dt
        motion.value += motion.velocity * dt
        if (Math.abs(motion.velocity) < 0.005) {
          motion.state = 'rest'
          motion.velocity = 0
          motion.target = motion.value
        }
        continue
      }
      motion.state = 'spring'
      motion.target = edge
    }
    const pull = -omega * omega * (motion.value - motion.target) - 2 * omega * motion.velocity
    motion.velocity += pull * dt
    motion.value += motion.velocity * dt
    if (
      Math.abs(motion.value - motion.target) < epsilon &&
      Math.abs(motion.velocity) * 16 < epsilon
    ) {
      motion.value = motion.target
      motion.velocity = 0
      motion.state = 'rest'
    }
  }
}

function rubber(value: number, low: number, high: number, dimension: number) {
  const past = value < low ? value - low : value > high ? value - high : 0
  if (past === 0 || dimension <= 0) return value
  const give = (1 - 1 / ((Math.abs(past) * RUBBER) / dimension + 1)) * dimension
  return (past < 0 ? low : high) + Math.sign(past) * give
}

type Point = { x: number; y: number }

function panAbout(point: Point, center: Point, pan: Point, scale: number, next: number): Point {
  return {
    x: point.x - center.x - ((point.x - center.x - pan.x) * next) / scale,
    y: point.y - center.y - ((point.y - center.y - pan.y) * next) / scale,
  }
}

type Gesture = {
  pointers: Map<number, Point>
  mode: 'idle' | 'pending' | 'swipe' | 'dismiss' | 'pinch' | 'pan' | 'hold'

  kind: string
  start: Point
  last: Point & { t: number }
  velocity: Point

  from: Point
  stripFrom: number
  pinch?: { distance: number; scale: number; local: Point; between: Point }
  hold?: { local: Point; finger: Point }

  caught: boolean

  tapped?: Point & { t: number }
}

const idle = (): Gesture => ({
  pointers: new Map(),
  mode: 'idle',
  kind: 'mouse',
  start: { x: 0, y: 0 },
  last: { x: 0, y: 0, t: 0 },
  velocity: { x: 0, y: 0 },
  from: { x: 0, y: 0 },
  stripFrom: 0,
  caught: false,
})

const stillMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number }

type Parts = {
  stage: HTMLDivElement | null
  strip: HTMLDivElement | null
  frame: HTMLDivElement | null

  layer: HTMLDivElement | null
  wash: HTMLDivElement | null
  chrome: HTMLDivElement | null
}

type Bindings = {
  leaving: boolean
  neighbors: boolean
  onClose: () => void

  onStep?: (delta: 1 | -1) => void
  onSettle?: () => void
  onReveal?: (shown: number, holding: boolean) => void
  toggleChrome: () => void
  setDetail: (detail: number) => void
}

function handling(parts: { current: Parts }, latest: { current: Bindings }) {
  const g = idle()
  let view = { x: axis(0), y: axis(0), s: axis(1), strip: axis(0) }
  let heading: 0 | 1 | -1 = 0
  let frameId = 0
  let last = 0
  let reveal = 0
  let settled = false
  let tapTimer: ReturnType<typeof setTimeout> | undefined

  let swiping = swipeReader()
  let pinchFrom = 1

  const axes = () => [view.x, view.y, view.s, view.strip]

  const stage = () => {
    const box = parts.current.stage?.getBoundingClientRect()
    const width = box?.width ?? window.innerWidth
    const height = box?.height ?? window.innerHeight
    const left = box?.left ?? 0
    const top = box?.top ?? 0
    return { width, height, center: { x: left + width / 2, y: top + height / 2 } }
  }

  const bounds = (scale: number) => {
    const frame = parts.current.frame
    const width = frame?.offsetWidth ?? 0
    const room = (size: number) => Math.max(0, (size * (scale - 1)) / 2)
    return {
      x: latest.current.neighbors ? Math.max(0, (width * scale - stage().width) / 2) : room(width),
      y: room(frame?.offsetHeight ?? 0),
    }
  }
  const inBounds = (pan: Point, scale: number) => {
    const limit = bounds(scale)
    return { x: clamp(pan.x, -limit.x, limit.x), y: clamp(pan.y, -limit.y, limit.y) }
  }
  const pan = () => ({ x: view.x.value, y: view.y.value })

  const ceiling = () => (latest.current.neighbors ? 1 : MAX_ZOOM)

  const pointOn = (point: Point) => {
    const { center } = stage()
    return {
      x: (point.x - center.x - view.x.value) / view.s.value,
      y: (point.y - center.y - view.y.value) / view.s.value,
    }
  }

  const tapZoom = () => Math.min(2.5, MAX_ZOOM)

  const revealOf = () => {
    const { x, y, s } = view
    if (s.value > 1.001) return 0
    const shown = Math.min(
      1,
      Math.max(Math.hypot(x.value, y.value) / REVEAL, (1 - s.value) / PINCH_REVEAL),
    )

    return shown < 0.002 ? 0 : shown
  }

  const releaseWash = (shown = 0) => {
    const { wash, chrome } = parts.current
    if (wash) {
      wash.style.transition = ''
      wash.style.opacity = ''
    }
    if (chrome) chrome.style.opacity = ''
    latest.current.onReveal?.(shown, false)
    reveal = 0
  }

  const paint = () => {
    const { stage: element, strip, frame, layer, wash, chrome } = parts.current

    if (!settled) {
      settled = true
      latest.current.onSettle?.()
    }
    const { x, y, s } = view

    const moved = `translate(${String(x.value)}px, ${String(y.value)}px) scale(${String(s.value)})`
    if (frame) {
      frame.style.transform = x.value === 0 && y.value === 0 && s.value === 1 ? '' : moved
    }
    if (layer) layer.style.transform = ''
    if (strip) {
      strip.style.transform =
        view.strip.value === 0 ? '' : `translateX(${String(view.strip.value)}px)`
    }

    const next = revealOf()
    if (next > 0) {
      if (wash) {
        wash.style.transition = 'none'
        wash.style.opacity = String(1 - next)
      }
      if (chrome) chrome.style.opacity = String(Math.max(0, 1 - next * 3))
      latest.current.onReveal?.(next, true)
    } else if (reveal > 0) {
      releaseWash()
    }
    reveal = next
    element?.toggleAttribute('data-zoomed', s.target > 1.01)
  }

  const rested = () => {
    const scale = view.s.value
    latest.current.setDetail(scale > 1.5 ? Math.min(MAX_ZOOM, Math.ceil(scale)) : 1)
  }

  const commit = () => {
    const delta = heading
    if (!delta) return
    heading = 0
    const { width } = stage()
    flushSync(() => {
      latest.current.onStep?.(delta)
    })

    view.strip.value += delta * width
    view.strip.target += delta * width
    view = { x: axis(0), y: axis(0), s: axis(1), strip: view.strip }
    g.hold = undefined
    g.tapped = undefined
    latest.current.setDetail(1)
    paint()
  }

  const tick = (now: number) => {
    frameId = 0
    if (latest.current.leaving) return
    const ms = clamp(now - last, 0, 64)
    last = now
    advance(view.x, ms, 0.1)
    advance(view.y, ms, 0.1)
    advance(view.s, ms, 0.0005)
    advance(view.strip, ms, 0.5)
    if (g.hold) follow()
    paint()
    if (view.strip.state === 'rest' && heading) commit()
    if (axes().some((motion) => motion.state !== 'rest')) {
      frameId = requestAnimationFrame(tick)
    } else if (!g.hold) {
      rested()
    }
  }

  const run = () => {
    if (stillMotion()) {
      for (const motion of axes()) {
        if (motion.state === 'coast') motion.target = clamp(motion.value, motion.low, motion.high)
        motion.value = motion.target
        motion.velocity = 0
        motion.state = 'rest'
      }
      if (g.hold) follow()
      paint()
      if (heading) commit()
      rested()
      return
    }
    if (frameId) return
    last = performance.now()
    frameId = requestAnimationFrame(tick)
  }

  const stop = () => {
    cancelAnimationFrame(frameId)
    frameId = 0
    for (const motion of axes()) {
      motion.state = 'rest'
      motion.target = motion.value
      motion.velocity = 0
    }
  }

  const grab = () => {
    if (heading) commit()
    stop()
    g.hold = undefined
  }

  const spring = (motion: Axis, target: number, velocity = motion.velocity) => {
    motion.target = target
    motion.velocity = velocity
    motion.state = 'spring'
  }

  const zoomTo = (scale: number, point?: Point) => {
    const { center } = stage()
    const next = clamp(scale, 1, ceiling())
    const from = { x: view.x.target, y: view.y.target }
    const to = inBounds(panAbout(point ?? center, center, from, view.s.target, next), next)
    spring(view.s, next, 0)
    spring(view.x, to.x)
    spring(view.y, to.y)
    run()
  }

  const zoomAt = (scale: number, point: Point) => {
    grab()
    const { center } = stage()
    const next = clamp(scale, 1, ceiling())
    const to = inBounds(panAbout(point, center, pan(), view.s.value, next), next)
    view.s.value = view.s.target = next
    view.x.value = view.x.target = to.x
    view.y.value = view.y.target = to.y
    paint()
    rested()
  }

  const toggleZoom = (point: Point) => {
    if (ceiling() === 1) return
    if (view.s.target > 1.01) zoomTo(1)
    else zoomTo(tapZoom(), point)
  }

  const settleInto = (velocity: Point, point?: Point) => {
    const scale = clamp(view.s.target, 1, ceiling())
    if (scale !== view.s.value && point) {
      const { center } = stage()
      const to = inBounds(panAbout(point, center, pan(), view.s.value, scale), scale)
      spring(view.s, scale, 0)
      spring(view.x, to.x, velocity.x)
      spring(view.y, to.y, velocity.y)
    } else {
      if (scale !== view.s.value) spring(view.s, scale, 0)
      const limit = bounds(scale)
      for (const [motion, speed, edge] of [
        [view.x, velocity.x, limit.x],
        [view.y, velocity.y, limit.y],
      ] as const) {
        if (edge === 0) {
          spring(motion, 0, speed)
        } else {
          motion.velocity = speed
          motion.low = -edge
          motion.high = edge
          motion.state = 'coast'
        }
      }
    }
    run()
  }

  const close = () => {
    if (latest.current.leaving) return
    stop()
    clearTimeout(tapTimer)
    releaseWash(revealOf())
    latest.current.onClose()
  }

  const slide = (delta: 1 | -1) => {
    if (!latest.current.neighbors || latest.current.leaving) return
    if (heading) commit()
    heading = delta
    spring(view.strip, -delta * stage().width)
    run()
  }

  const restore = () => {
    if (view.s.value > 1.01) {
      settleInto({ x: 0, y: 0 })
      return
    }
    spring(view.x, 0)
    spring(view.y, 0)
    spring(view.s, 1)
    run()
  }

  const swipeRelease = () => {
    const { width } = stage()
    const offset = view.strip.value
    const velocity = g.velocity.x
    const toward = Math.sign(offset)

    const far = Math.abs(offset) > width * SWIPE_SHARE && Math.sign(offset - g.stripFrom) === toward
    const flung = Math.abs(velocity) > FLICK && Math.sign(velocity) === toward
    if ((far || flung) && latest.current.neighbors) {
      heading = offset < 0 ? 1 : -1
      spring(view.strip, -heading * width, velocity)
    } else {
      spring(view.strip, 0, velocity)
    }
    run()
  }

  const follow = () => {
    if (!g.hold) return
    const { center } = stage()
    view.x.value = view.x.target = g.hold.finger.x - center.x - view.s.value * g.hold.local.x
    view.y.value = view.y.target = g.hold.finger.y - center.y - view.s.value * g.hold.local.y
  }

  const beginPinch = () => {
    const [a, b] = [...g.pointers.values()]
    if (!a || !b) return
    grab()
    const between = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    g.pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      scale: view.s.value,

      local: pointOn(between),
      between,
    }
    g.mode = 'pinch'
    parts.current.stage?.setAttribute('data-dragging', '')
  }

  const pinchMove = () => {
    const [a, b] = [...g.pointers.values()]
    if (!a || !b || !g.pinch) return
    const spread = (g.pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.pinch.distance

    const top = ceiling()
    const scale =
      spread < 1
        ? Math.max(0.4, 1 - (1 - spread) * 0.6)
        : spread > top
          ? top + (spread - top) * 0.2
          : spread
    const between = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const { center } = stage()
    g.pinch.between = between
    view.s.value = view.s.target = scale
    view.x.value = view.x.target = between.x - center.x - scale * g.pinch.local.x
    view.y.value = view.y.target = between.y - center.y - scale * g.pinch.local.y
    paint()
  }

  const startHold = (finger: Point, t: number) => {
    g.mode = 'hold'
    g.hold = { local: pointOn(finger), finger }
    g.start = finger
    g.last = { ...finger, t }
    g.velocity = { x: 0, y: 0 }
    if (view.s.value >= PINCH_CLOSE) {
      spring(view.s, clamp(view.s.value, 1, ceiling()), 0)
      run()
    }
  }

  const tap = (point: Point, t: number) => {
    const box = parts.current.frame?.getBoundingClientRect()
    const onPhoto =
      box !== undefined &&
      point.x >= box.left &&
      point.x <= box.right &&
      point.y >= box.top &&
      point.y <= box.bottom
    const zoomed = view.s.target > 1.01
    const before = g.tapped
    const twice =
      before !== undefined &&
      t - before.t < DOUBLE_TAP.ms &&
      Math.hypot(point.x - before.x, point.y - before.y) < DOUBLE_TAP.px

    if (g.kind === 'mouse') {
      if (twice) {
        g.tapped = undefined
        return
      }
      g.tapped = { ...point, t }
      if (onPhoto || zoomed) toggleZoom(point)
      else close()
      return
    }

    if (twice) {
      clearTimeout(tapTimer)
      g.tapped = undefined
      toggleZoom(point)
      return
    }
    if (!zoomed && !onPhoto) {
      close()
      return
    }
    g.tapped = { ...point, t }
    clearTimeout(tapTimer)
    tapTimer = setTimeout(() => {
      g.tapped = undefined
      latest.current.toggleChrome()
    }, DOUBLE_TAP.ms)
  }

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (latest.current.leaving) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    if (g.mode === 'swipe') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    g.pointers.set(event.pointerId, point)
    if (g.pointers.size === 1) {
      g.mode = 'pending'
      g.kind = event.pointerType
      g.start = point
      g.last = { ...point, t: event.timeStamp }
      g.velocity = { x: 0, y: 0 }

      g.caught = view.strip.state !== 'rest' || axes().some((motion) => motion.state === 'coast')
      if (g.caught) grab()
      g.stripFrom = view.strip.value
    } else if (g.pointers.size === 2) {
      beginPinch()
    }
  }

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!g.pointers.has(event.pointerId)) return
    const point = { x: event.clientX, y: event.clientY }
    g.pointers.set(event.pointerId, point)
    if (g.mode === 'pinch') {
      pinchMove()
      return
    }
    if (g.pointers.size !== 1) return

    const dt = event.timeStamp - g.last.t
    if (dt > 0) {

      g.velocity = {
        x: g.velocity.x * 0.2 + ((point.x - g.last.x) / dt) * 0.8,
        y: g.velocity.y * 0.2 + ((point.y - g.last.y) / dt) * 0.8,
      }
    }
    g.last = { ...point, t: event.timeStamp }

    if (g.mode === 'hold' && g.hold) {
      g.hold.finger = point
      follow()
      paint()
      return
    }

    let dx = point.x - g.start.x
    let dy = point.y - g.start.y
    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) < SLOP) return
      grab()
      g.mode =
        view.strip.value !== 0
          ? 'swipe'
          : view.s.value > 1.01
            ? 'pan'
            : Math.abs(dx) > Math.abs(dy) && latest.current.neighbors
              ? 'swipe'
              : 'dismiss'
      g.from = pan()
      g.stripFrom = view.strip.value
      g.start = point
      dx = 0
      dy = 0
      parts.current.stage?.setAttribute('data-dragging', '')
    }

    const { width, height } = stage()
    if (g.mode === 'pan') {
      const limit = bounds(view.s.value)
      const x = g.from.x + dx

      if (latest.current.neighbors) {
        const kept = clamp(x, -limit.x, limit.x)
        view.x.value = view.x.target = kept
        view.strip.value = view.strip.target = g.stripFrom + (x - kept)
      } else {
        view.x.value = view.x.target = rubber(x, -limit.x, limit.x, width)
      }
      view.y.value = view.y.target = rubber(g.from.y + dy, -limit.y, limit.y, height)
    } else if (g.mode === 'swipe') {
      view.strip.value = view.strip.target = rubber(g.stripFrom + dx, -width, width, width)
    } else if (g.mode === 'dismiss') {
      const x = g.from.x + dx
      const y = g.from.y + dy
      view.x.value = view.x.target = x
      view.y.value = view.y.target = y

      view.s.value = view.s.target = 1 - Math.min(1, Math.hypot(x, y) / REVEAL) * 0.25
    }
    paint()
  }

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!g.pointers.delete(event.pointerId)) return
    const canceled = event.type === 'pointercancel'
    if (event.timeStamp - g.last.t > HELD_STILL) g.velocity = { x: 0, y: 0 }

    if (g.mode === 'pinch') {
      const [rest] = [...g.pointers.values()]
      if (g.pointers.size === 1 && rest) {
        startHold(rest, event.timeStamp)
      } else if (g.pointers.size === 0) {
        parts.current.stage?.removeAttribute('data-dragging')
        g.mode = 'idle'
        if (view.s.value < PINCH_CLOSE && !canceled) close()
        else settleInto({ x: 0, y: 0 }, g.pinch?.between)
      }
      return
    }
    if (g.pointers.size > 0) return
    parts.current.stage?.removeAttribute('data-dragging')

    const mode = g.mode
    g.mode = 'idle'
    const { x, y } = view
    const velocity = g.velocity
    if (mode === 'hold') {

      const finger = g.hold?.finger
      g.hold = undefined
      if (view.s.value < PINCH_CLOSE && !canceled) close()
      else settleInto(velocity, finger)
    } else if (mode === 'pan') {

      if (view.strip.value !== 0) {
        swipeRelease()
        settleInto({ x: 0, y: velocity.y })
      } else {
        settleInto(velocity)
      }
    } else if (mode === 'swipe') {
      swipeRelease()
    } else if (mode === 'dismiss') {
      const distance = Math.hypot(x.value, y.value)
      const far = distance > DISMISS

      const flung = (velocity.x * x.value + velocity.y * y.value) / Math.max(1, distance) > FLICK
      if ((far || flung) && !canceled) {
        close()
      } else {
        spring(x, 0, velocity.x)
        spring(y, 0, velocity.y)
        spring(view.s, 1, 0)
        run()
      }
    } else if (mode === 'pending') {
      if (view.strip.value !== 0) swipeRelease()
      else if (!canceled && !g.caught) tap({ x: event.clientX, y: event.clientY }, event.timeStamp)
      else restore()
    }
  }

  const key = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (latest.current.leaving || event.metaKey || event.ctrlKey || event.altKey) return
    const zoomed = view.s.target > 1.01
    const { width, height } = stage()
    const panBy = (dx: number, dy: number) => {
      const to = inBounds({ x: view.x.target + dx, y: view.y.target + dy }, view.s.target)
      spring(view.x, to.x)
      spring(view.y, to.y)
      run()
    }
    switch (event.key) {

      case 'ArrowLeft':
      case 'ArrowRight': {
        const toward = event.key === 'ArrowLeft' ? -1 : 1
        if (zoomed) panBy(-toward * width * KEY_PAN, 0)
        else if (latest.current.neighbors) slide(toward)
        else return
        break
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!zoomed) return
        panBy(0, (event.key === 'ArrowUp' ? 1 : -1) * height * KEY_PAN)
        break
      }
      case '+':
      case '=': {
        zoomTo(view.s.target * KEY_ZOOM)
        break
      }
      case '-':
      case '_': {
        zoomTo(view.s.target / KEY_ZOOM)
        break
      }
      case '0': {
        if (!zoomed) return
        zoomTo(1)
        break
      }
      default: {
        return
      }
    }
    event.preventDefault()
  }

  const wheel = (event: WheelEvent) => {
    event.preventDefault()
    if (latest.current.leaving || g.pointers.size > 0) return
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage().height : 1
    const dx = event.deltaX * unit
    const dy = event.deltaY * unit
    const point = { x: event.clientX, y: event.clientY }
    if (event.ctrlKey || event.metaKey) {
      zoomAt(view.s.value * Math.exp(-clamp(dy, -WHEEL_STEP, WHEEL_STEP) * WHEEL_ZOOM), point)
      return
    }
    if (view.s.value > 1.01) {
      grab()
      const to = inBounds({ x: view.x.value - dx, y: view.y.value - dy }, view.s.value)
      view.x.value = view.x.target = to.x
      view.y.value = view.y.target = to.y
      paint()
      return
    }

    const { step } = swiping(event.timeStamp, dx, dy)
    if (step !== 0) slide(step)
  }

  const gestureStart = (event: Event) => {
    event.preventDefault()
    pinchFrom = view.s.value
  }

  const gestureChange = (event: Event) => {
    event.preventDefault()
    if (latest.current.leaving || g.pointers.size > 0) return
    const pinch = event as GestureEvent
    zoomAt(pinchFrom * pinch.scale, { x: pinch.clientX, y: pinch.clientY })
  }

  const listen = (element: HTMLElement) => {
    element.addEventListener('wheel', wheel, { passive: false })
    element.addEventListener('gesturestart', gestureStart)
    element.addEventListener('gesturechange', gestureChange)
    element.addEventListener('gestureend', gestureStart)
    return () => {
      element.removeEventListener('wheel', wheel)
      element.removeEventListener('gesturestart', gestureStart)
      element.removeEventListener('gesturechange', gestureChange)
      element.removeEventListener('gestureend', gestureStart)
    }
  }

  const refit = () => {
    if (latest.current.leaving) return
    grab()
    view = { x: axis(0), y: axis(0), s: axis(1), strip: axis(0) }
    paint()
    rested()
  }

  const reset = () => {
    stop()
    clearTimeout(tapTimer)
    Object.assign(g, idle())
    view = { x: axis(0), y: axis(0), s: axis(1), strip: axis(0) }
    heading = 0
    reveal = 0
    settled = false
    swiping = swipeReader()
  }

  return { down, move, up, key, listen, slide, close, refit, reset, stop }
}

function ZoomDialog({
  image,
  base,
  drawn,
  open,
  leaving,
  onClose,
  onClosed,
  launch,
  returnFocus,
  previous,
  next,
  position,
  onStep,
  onSettle,
  onReveal,
}: {
  image: ImageGalleryImage | undefined

  base?: string
  drawn?: number
  open: boolean

  leaving: boolean
  onClose: () => void
  onClosed: () => void
  launch: (frame: HTMLDivElement | null) => (() => void) | undefined
  returnFocus: RefObject<HTMLElement | null>

  previous?: ImageGalleryImage
  next?: ImageGalleryImage

  position?: { index: number; count: number }

  onStep?: (delta: 1 | -1) => void

  onSettle?: () => void

  onReveal?: (shown: number, holding: boolean) => void
}) {
  const neighbors = previous !== undefined && next !== undefined

  const [back, onward] = useDirection() === 'rtl' ? ([1, -1] as const) : ([-1, 1] as const)
  const stepped = (side: 1 | -1) => {
    onStep?.(side === onward ? 1 : -1)
  }
  const [chrome, setChrome] = useState(true)

  const [detail, setDetail] = useState(1)
  const popup = useRef<HTMLDivElement | null>(null)
  const parts = useRef<Parts>({
    stage: null,
    strip: null,
    frame: null,
    layer: null,
    wash: null,
    chrome: null,
  })
  const latest = useRef<Bindings>({
    leaving,
    neighbors,
    onClose,
    onStep: stepped,
    onSettle,
    onReveal,
    toggleChrome: () => {
      setChrome((shown) => !shown)
    },
    setDetail,
  })
  useLayoutEffect(() => {
    Object.assign(latest.current, {
      leaving,
      neighbors,
      onClose,
      onStep: stepped,
      onSettle,
      onReveal,
    })
  })
  const [engine] = useState(() => handling(parts, latest))

  const held = useCallback(
    (element: HTMLDivElement | null) => {
      parts.current.frame = element
      return launch(element)
    },
    [launch],
  )
  const staged = useCallback(
    (element: HTMLDivElement | null) => {
      parts.current.stage = element
      return element ? engine.listen(element) : undefined
    },
    [engine],
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', engine.refit)
    return () => {
      window.removeEventListener('resize', engine.refit)
    }
  }, [open, engine])

  const slots = [
    [back, previous],
    [0, image],
    [onward, next],
  ] as const

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(opening) => {
        if (!opening) engine.close()
      }}
      onOpenChangeComplete={(opening) => {
        if (opening) return
        engine.reset()
        setChrome(true)
        setDetail(1)
        onClosed()
      }}
    >
      <Dialog.Portal>

        <Dialog.Backdrop
          ref={(element) => {
            parts.current.wash = element
          }}
          data-leaving={leaving || undefined}
          style={BACKDROP as CSSProperties}
          className="fixed inset-0 z-[90] bg-background/75 transition-opacity delay-60 duration-380 ease-(--backdrop-in) data-leaving:opacity-0 data-leaving:delay-0 data-leaving:duration-200 data-leaving:ease-(--backdrop-out) data-starting-style:opacity-0 motion-reduce:delay-0 motion-reduce:duration-200"
        />

        <Dialog.Popup
          ref={popup}
          aria-label={image?.alt}
          initialFocus={popup}
          finalFocus={returnFocus}
          onKeyDown={engine.key}
          className="fixed inset-0 z-[91] touch-none overflow-hidden outline-none select-none"
        >

          <div
            ref={staged}
            data-slot="lightbox-stage"
            onPointerDown={engine.down}
            onPointerMove={engine.move}
            onPointerUp={engine.up}
            onPointerCancel={engine.up}
            className="group/stage absolute inset-0 cursor-zoom-out data-dragging:cursor-grabbing data-zoomed:cursor-grab"
          >

            <div
              ref={(element) => {
                parts.current.strip = element
              }}
              data-slot="lightbox-strip"
              className="absolute inset-0 will-change-transform"
            >
              {slots.map(([place, shown]) =>
                shown ? (
                  <div
                    key={place}
                    style={{ transform: `translateX(${String(place * 100)}%)` }}
                    className="[container-type:size] absolute inset-0 flex items-center justify-center p-4 sm:p-12"
                  >
                    <div
                      ref={place === 0 ? held : undefined}
                      data-slot={place === 0 ? 'lightbox-zoom' : 'lightbox-neighbor'}
                      aria-hidden={place === 0 ? undefined : true}
                      style={
                        {
                          '--ratio': shown.width / shown.height,
                          '--tile': shown.color,
                        } as CSSProperties
                      }
                      className={cn(
                        'relative aspect-(--ratio) w-[min(100cqw,70cqh*var(--ratio))] overflow-hidden rounded-xl will-change-transform group-data-dragging/stage:cursor-grabbing group-data-zoomed/stage:cursor-grab',
                        neighbors ? 'cursor-grab' : 'cursor-zoom-in',
                        shown.color ? 'bg-(--tile)' : 'bg-muted',
                      )}
                    >
                      <div
                        ref={
                          place === 0
                            ? (element) => {
                                parts.current.layer = element
                              }
                            : undefined
                        }
                        data-slot="lightbox-layer"
                        className="absolute inset-0 will-change-transform"
                      >

                        <img
                          src={place === 0 ? base || shown.src : shown.src}
                          srcSet={place === 0 ? undefined : shown.srcSet}
                          sizes={place === 0 || !drawn ? undefined : `${String(drawn)}px`}
                          alt={place === 0 ? shown.alt : ''}
                          decoding={place === 0 ? 'sync' : 'async'}
                          draggable={false}
                          className="absolute inset-0 size-full object-contain"
                        />
                        {place === 0 && drawn && shown.srcSet ? (
                          <SharperPhoto key={shown.src} image={shown} drawn={drawn * detail} />
                        ) : null}
                      </div>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-[inherit] outline -outline-offset-1 outline-foreground/10"
                      />
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </div>

          <div
            ref={(element) => {
              parts.current.chrome = element
            }}
            data-slot="lightbox-chrome"
            className="pointer-events-none absolute inset-0"
          >
            <div
              data-hidden={!chrome || leaving || undefined}
              className="group/chrome absolute inset-0 transition-opacity duration-200 ease-out data-hidden:not-has-focus-visible:opacity-0 motion-reduce:transition-none"
            >
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3 sm:p-4">
                {position && position.count > 1 ? (
                  <span className="rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums backdrop-blur-sm">
                    {position.index} / {position.count}
                  </span>
                ) : (
                  <span />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={engine.close}
                  className="pointer-events-auto rounded-full group-data-hidden/chrome:pointer-events-none"
                >
                  <X />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
              {neighbors ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      engine.slide(back)
                    }}
                    className="pointer-events-auto absolute start-3 top-1/2 hidden -translate-y-1/2 rounded-full group-data-hidden/chrome:pointer-events-none sm:start-4 pointer-fine:inline-flex"
                  >
                    <ChevronLeft className="rtl:-scale-x-100" />
                    <span className="sr-only">Previous photo</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      engine.slide(onward)
                    }}
                    className="pointer-events-auto absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-full group-data-hidden/chrome:pointer-events-none sm:end-4 pointer-fine:inline-flex"
                  >
                    <ChevronRight className="rtl:-scale-x-100" />
                    <span className="sr-only">Next photo</span>
                  </Button>
                </>
              ) : null}
              {image?.credit ? (
                <div className="absolute start-0 bottom-0 flex max-w-full p-3 sm:p-4">
                  <a
                    href={image.credit.href}
                    target="_blank"
                    rel="noreferrer"
                    className="pointer-events-auto max-w-full truncate rounded-full bg-background/80 px-2.5 py-1 text-xs text-foreground backdrop-blur-sm transition-ring outline-none group-data-hidden/chrome:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {image.credit.name}
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          {position && image ? (
            <p aria-live="polite" aria-atomic className="sr-only">
              {`${image.alt}, ${String(position.index)} of ${String(position.count)}`}
            </p>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SharperPhoto({ image, drawn }: { image: ImageGalleryImage; drawn: number }) {
  const [loaded, setLoaded] = useState(false)
  const settled = useCallback((element: HTMLImageElement | null) => {
    if (element?.complete && element.naturalWidth > 0) setLoaded(true)
  }, [])
  return (
    <img
      ref={settled}
      src={image.src}
      srcSet={image.srcSet}
      sizes={`${String(drawn)}px`}
      alt=""
      aria-hidden
      decoding="async"
      onLoad={() => {
        setLoaded(true)
      }}
      data-loaded={loaded || undefined}
      className="absolute inset-0 size-full object-contain opacity-0 transition-opacity duration-200 ease-out data-loaded:opacity-100"
    />
  )
}

function GalleryTile({
  index,
  image,
  ratio,
  part,
  drawn,
  onOpen,
}: {
  index: number
  image: ImageGalleryImage
  ratio: number
  part: number
  drawn: number
  onOpen?: (index: number, trigger: HTMLElement, at?: { x: number; y: number }) => void
}) {
  const [loaded, setLoaded] = useState(false)

  const settled = useCallback((element: HTMLImageElement | null) => {
    if (element?.complete && element.naturalWidth > 0) setLoaded(true)
  }, [])

  return (
    <figure
      data-slot="lightbox-item"
      data-index={index}
      style={{ '--ratio': ratio, '--part': part, '--tile': image.color } as CSSProperties}
      className={cn(

        'group/tile relative isolate m-0 aspect-(--ratio) min-w-0 grow-(--part) basis-0',

        'transition-[translate,scale,opacity,filter] delay-(--ripple-home) duration-(--ripple-duration) ease-(--ripple-ease) group-data-zoomed/lightbox:translate-x-[calc(var(--ripple-x)*var(--ripple-hold))] group-data-zoomed/lightbox:translate-y-[calc(var(--ripple-y)*var(--ripple-hold))] group-data-zoomed/lightbox:scale-[calc(1-(1-var(--ripple-scale))*var(--ripple-hold))] group-data-zoomed/lightbox:blur-[calc(var(--ripple-blur)*var(--ripple-hold))] group-data-zoomed/lightbox:delay-(--ripple-out) group-data-zoomed/lightbox:not-data-lifted:opacity-(--ripple-shown) motion-reduce:translate-none',

        '[--ripple-hold:calc(1-var(--lightbox-reveal,0))] [--ripple-shown:var(--lightbox-reveal,0)] group-data-revealing/lightbox:transition-none',
      )}
    >
      {onOpen ? (

        <button
          type="button"
          aria-label={image.alt}
          aria-haspopup="dialog"
          onClick={(event) => {

            onOpen(
              index,
              event.currentTarget,
              event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined,
            )
          }}
          className="peer absolute inset-0 z-10 cursor-zoom-in rounded-md transition-ring outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      ) : null}
      <div
        data-slot="lightbox-frame"
        className={cn(
          'absolute inset-0 overflow-hidden rounded-md transition-[scale] duration-150 ease-out peer-active:scale-96 motion-reduce:peer-active:scale-100',
          image.color ? 'bg-(--tile)' : 'bg-muted',
        )}
      >
        {image.src ? (
          <img
            ref={settled}
            src={image.src}
            srcSet={image.srcSet}
            sizes={`${String(drawn)}px`}
            alt={image.alt}
            width={image.width}
            height={image.height}
            loading="lazy"
            decoding="async"
            onLoad={() => {
              setLoaded(true)
            }}
            data-loaded={loaded || undefined}

            className="absolute inset-0 size-full object-contain opacity-0 transition-opacity duration-300 ease-out data-loaded:opacity-100 motion-reduce:transition-none"
          />
        ) : null}

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] outline -outline-offset-1 outline-foreground/10"
        />
      </div>
      {image.credit ? (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex p-2 opacity-0 transition-opacity duration-200 ease-out group-hover/tile:opacity-100 group-has-focus-visible/tile:opacity-100 motion-reduce:transition-none pointer-coarse:opacity-100">
          <a
            href={image.credit.href}
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto max-w-full truncate rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground backdrop-blur-sm transition-ring outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {image.credit.name}
          </a>
        </figcaption>
      ) : null}
    </figure>
  )
}

export { ImageGallery, LightboxPhoto }
