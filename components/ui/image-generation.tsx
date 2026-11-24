'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Scritto from '@scritto/react'

import { CopyCheck, useReceipt } from '@/components/ui/copy-check'
import { LightboxPhoto } from '@/components/ui/image-gallery'
import { joinsLetters } from '@/lib/joined-script'
import { cn } from '@/lib/utils'
import { DownloadIcon } from "lucide-react"

const LIT = [
  { dot: 0.9, falloff: 70 },
  { dot: 1.4, falloff: 50 },
  { dot: 1.9, falloff: 30 },
] as const

const fade = (falloff: number) => {
  const at = (share: number) => `${String(Math.round(falloff * share * 10) / 10)}%`
  return `radial-gradient(ellipse at center, #000 ${at(0.3)}, rgb(0 0 0 / 0.84) ${at(0.45)}, rgb(0 0 0 / 0.5) ${at(0.6)}, rgb(0 0 0 / 0.16) ${at(0.75)}, transparent ${at(0.9)})`
}

const REVEAL = 60

const SETTLE = 900

const FILL = 30
const FULL = REVEAL - 6

const STEPS = [
  { at: 0, label: 'Composing scene', order: [0, 1, 2, 1, 2, 3, 2, 3, 4] },
  { at: 22, label: 'Sketching shapes', order: [0, 1, 2, 7, 8, 3, 6, 5, 4] },
  { at: 42, label: 'Adding color', order: [3, 7, 1, 5, 0, 8, 2, 6, 4] },
  { at: REVEAL, label: 'Refining details', order: [2, 1, 2, 1, 0, 1, 2, 1, 2] },
] as const
const BLINK = 1.2

type Phase = 'forming' | 'refining' | 'done'

export function ImageGeneration({
  src,
  alt = '',
  resolution = '1024 × 768',
  progress,
  step,
  className,
}: {

  src?: string
  alt?: string
  resolution?: string

  progress?: number

  step?: string
  className?: string
}) {
  const shown = useProgress(progress)
  const phase: Phase = !src || shown < REVEAL ? 'forming' : shown < 100 ? 'refining' : 'done'
  const ready = useSettled(phase !== 'forming')
  const stage = STEPS.findLast((one) => shown >= one.at) ?? STEPS[0]
  const label = step ?? stage.label
  const refine = phase === 'forming' ? 1 : (100 - shown) / (100 - REVEAL)
  const [copied, showCopied] = useReceipt()
  const filled = smoothstep((shown - FILL) / (FULL - FILL))
  const { canvas, light } = useContrails(src, shown, phase === 'forming')

  const layers = (
    <>

      {src && (
        <canvas
          ref={canvas}
          aria-hidden
          className="image-generation-trails absolute inset-0 size-full"
        />
      )}

      <div
        style={{ opacity: phase === 'forming' ? 1 - (src ? filled : 0) : 0 }}
        className="absolute inset-0 transition-opacity duration-500 ease-out"
      >

        <span
          aria-hidden
          className="absolute inset-0.5 bg-[radial-gradient(circle,var(--color-muted-foreground)_0.6px,transparent_1.1px)] bg-size-[8px_8px] bg-repeat-space opacity-5"
        />

        {LIT.map(({ dot, falloff }, index) => (
          <span
            key={dot}
            ref={index === 0 ? light : undefined}
            aria-hidden
            style={{
              backgroundImage: `radial-gradient(circle, var(--color-foreground) ${String(dot)}px, transparent ${String(dot + 0.5)}px)`,
              maskImage: `${fade(falloff)}, ${fade(falloff)}`,
            }}
            className="image-generation-cloud absolute inset-0.5 bg-size-[8px_8px] bg-repeat-space [mask-repeat:no-repeat] motion-reduce:animate-none motion-reduce:opacity-70"
          />
        ))}
      </div>
      {src && (
        <>

          <img
            src={src}
            alt=""
            aria-hidden
            className="image-generation-wash absolute inset-0 size-full object-cover"
          />
          <img
            src={src}
            alt=""
            aria-hidden
            className="image-generation-picture absolute inset-0 size-full object-cover"
          />
        </>
      )}
    </>
  )

  return (
    <div
      data-slot="image-generation"
      data-phase={phase}
      data-ready={ready ? '' : undefined}
      style={
        {
          aspectRatio: aspectOf(resolution),

          '--cloud-grow': 0.72 + 0.28 * (shown / 100),
          '--image-progress': shown / 100,
          '--image-refine': refine,
          '--image-filled': filled,
        } as CSSProperties
      }
      className={cn(

        'group/image-generation relative w-full max-w-80 min-w-0 overflow-hidden rounded-2xl bg-muted outline outline-1 -outline-offset-1 outline-black/10 transition-[--cloud-grow] duration-700 ease-out motion-reduce:transition-none dark:outline-white/10',
        className,
      )}
    >
      {src ? (

        <LightboxPhoto
          src={src}
          alt={alt || `A generated ${resolution} image`}
          disabled={phase !== 'done'}
          className={cn(
            'absolute inset-0 size-full overflow-hidden',
            phase !== 'done' && 'cursor-default',
          )}
        >
          {layers}
        </LightboxPhoto>
      ) : (
        <div
          role="img"
          aria-label={`Generating a ${resolution} image`}
          className="absolute inset-0"
        >
          {layers}
        </div>
      )}

      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="image-generation-chrome flex items-center gap-2 rounded-full bg-background/70 py-1.5 ps-2.5 pe-3 text-xs font-medium text-foreground/80 backdrop-blur-[4px]">
          <DotMatrix order={stage.order} />
          {joinsLetters(label) ? (
            <span dir="auto">{label}</span>
          ) : (
            <span dir="auto" className="flex">
              <Scritto
                value={label}
                transition={{ duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
              />
            </span>
          )}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-valuetext={phase === 'done' ? 'Done' : label}
        aria-label="Generation progress"
        className="image-generation-chrome pointer-events-none absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-background/50 backdrop-blur-[4px]"
      >
        <span className="image-generation-progress block h-full rounded-full bg-foreground/70" />
      </div>

      <span className="image-generation-badge pointer-events-none absolute start-2.5 top-2.5">
        <span className={cn(PILL, 'px-2.5 font-mono')}>{resolution}</span>
      </span>
      {src && (
        <div
          inert={!ready}
          className="image-generation-actions absolute end-2.5 top-2.5 flex gap-2"
        >
          <span className="image-generation-badge">
            <button
              type="button"
              aria-label="Copy the image"
              disabled={phase !== 'done'}
              data-sound="copy"
              onClick={() => {

                copyImage(src).then(showCopied, () => undefined)
              }}
              className={cn(PILL, ACTION)}
            >
              <CopyCheck copied={copied} size={14} />
            </button>
          </span>
          <span className="image-generation-badge">
            <a
              href={phase === 'done' ? src : undefined}
              download={fileName(src)}
              aria-disabled={phase !== 'done' || undefined}
              aria-label="Download the image"
              className={cn(PILL, ACTION)}
            >
              <DownloadIcon data-slot="download-icon" size={14} strokeWidth={1.8} aria-hidden />
            </a>
          </span>
        </div>
      )}
    </div>
  )
}

const PILL =
  'flex h-7 items-center rounded-full bg-background/70 text-xs text-muted-foreground backdrop-blur-[4px]'

const ACTION =
  'relative size-7 justify-center outline-none transition-[color,box-shadow,scale,opacity] duration-150 ease-out after:absolute after:-inset-1 not-disabled:not-aria-disabled:hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring not-disabled:not-aria-disabled:active:scale-[0.96] disabled:opacity-50 aria-disabled:opacity-50'

function DotMatrix({ order }: { order: readonly number[] }) {
  const last = Math.max(...order) + 1
  return (
    <span aria-hidden className="grid grid-cols-3 gap-px">
      {order.map((place, index) => (
        <span
          key={index}
          style={{ animationDelay: `${String((place / last - 1) * BLINK)}s` }}
          className="image-generation-dot size-0.75 rounded-full bg-current"
        />
      ))}
    </span>
  )
}

const TRAIL_WIDTH = 128

const DEPOSIT = 0.04

const DECAY = 0.016

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

function useContrails(src: string | undefined, shown: number, active: boolean) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const light = useRef<HTMLSpanElement>(null)
  const latest = useRef({ shown, active })

  useEffect(() => {
    latest.current = { shown, active }
  }, [shown, active])

  useEffect(() => {
    const node = canvas.current
    const lit = light.current
    if (!src || !node || !lit) return
    const picture = new Image()
    picture.src = src
    const trail = document.createElement('canvas')
    let cover = 0
    let last = 0
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const { shown, active } = latest.current
      const into = node.getContext('2d')
      const marks = trail.getContext('2d')
      if (!into || !marks || !picture.complete || !picture.naturalWidth || !node.clientWidth) return
      const width = TRAIL_WIDTH
      const height = Math.round((TRAIL_WIDTH * node.clientHeight) / node.clientWidth)
      if (node.width !== width || node.height !== height) {
        node.width = trail.width = width
        node.height = trail.height = height
      }

      if (shown < last - 10) {
        marks.clearRect(0, 0, width, height)
        cover = 0
      }
      last = shown
      if (!active) return

      const through = Math.min(1, shown / REVEAL)
      marks.globalCompositeOperation = 'destination-out'
      marks.globalAlpha = DECAY * (1 - through)
      marks.fillRect(0, 0, width, height)
      marks.globalCompositeOperation = 'source-over'
      marks.globalAlpha = 1
      const style = getComputedStyle(lit)
      const grow = Number(style.getPropertyValue('--cloud-grow')) || 1
      for (const name of ['a', 'b']) {
        const part = (key: string) =>
          parseFloat(style.getPropertyValue(`--cloud-${name}-${key}`) || '0') / 100
        const across = width * part('w') * grow
        const down = height * part('h') * grow

        const x = (width - across) * (0.5 + part('x1') + part('x2')) + across / 2
        const y = (height - down) * (0.5 + part('y1') + part('y2')) + down / 2
        const reach = across * 0.3
        marks.save()
        marks.translate(x, y)
        marks.scale(1, down / across)
        const glow = marks.createRadialGradient(0, 0, 0, 0, 0, reach)
        glow.addColorStop(0, `rgb(0 0 0 / ${String(DEPOSIT)})`)
        glow.addColorStop(1, 'rgb(0 0 0 / 0)')
        marks.fillStyle = glow
        marks.fillRect(-reach, -reach, reach * 2, reach * 2)
        marks.restore()
      }

      cover += (smoothstep((shown - FILL) / (FULL - FILL)) - cover) * 0.06
      into.globalCompositeOperation = 'copy'
      into.globalAlpha = 1
      into.drawImage(trail, 0, 0)
      into.globalCompositeOperation = 'source-over'
      into.globalAlpha = cover
      into.fillRect(0, 0, width, height)
      into.globalCompositeOperation = 'source-in'
      into.globalAlpha = 1
      const scale = Math.max(width / picture.naturalWidth, height / picture.naturalHeight)
      const w = picture.naturalWidth * scale
      const h = picture.naturalHeight * scale
      into.drawImage(picture, (width - w) / 2, (height - h) / 2, w, h)
      into.globalCompositeOperation = 'source-over'
    }

    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [src])

  return { canvas, light }
}

function copyImage(src: string) {
  const png = fetch(src)
    .then((response) => response.blob())
    .then(async (blob) => {
      if (blob.type === 'image/png') return blob
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
      return canvas.convertToBlob({ type: 'image/png' })
    })
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

function fileName(src: string) {
  return src.split(/[?#]/)[0]?.split('/').at(-1) || 'image'
}

function useSettled(landed: boolean) {
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!landed) {
      setSettled(false)
      return
    }
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setSettled(true), calm ? 300 : SETTLE)
    return () => {
      window.clearTimeout(timer)
    }
  }, [landed])

  return landed && settled
}

const CLIMB = 22_000

const EASE = 1.6
const TICK = 110

function useProgress(given: number | undefined) {
  const [self, setSelf] = useState(0)

  useEffect(() => {
    if (given !== undefined) return
    const from = performance.now()
    const timer = window.setInterval(() => {
      const through = Math.min(1, (performance.now() - from) / CLIMB)
      setSelf(Math.round(100 * (1 - Math.pow(1 - through, EASE))))
      if (through === 1) window.clearInterval(timer)
    }, TICK)
    return () => {
      window.clearInterval(timer)
    }
  }, [given])

  return Math.min(100, Math.max(0, Math.round(given ?? self)))
}

function aspectOf(resolution: string) {
  const match = /(\d+)\s*[×x]\s*(\d+)/i.exec(resolution)
  if (!match) return 1
  return Number(match[1]) / Number(match[2]) || 1
}
