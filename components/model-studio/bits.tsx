"use client";

// Small shared pieces of the Model Studio page: a photo that fades in over a shimmer and falls back to a designed
// tile, a segmented control, and the titled section every panel uses (12 px cards, 10 px controls, 6 px tags).
import { useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Thumb({ src, alt, className, fit = "cover", label }: { src?: string; alt: string; className?: string; fit?: "cover" | "contain"; label?: string }) {
  const [state, setState] = useState<"loading" | "ready" | "broken">(src ? "loading" : "broken");
  const [shown, setShown] = useState(src);
  if (src !== shown) { setShown(src); setState(src ? "loading" : "broken"); }
  return (
    <div className={cn("ms-thumb relative overflow-hidden rounded-[10px] bg-muted", className)}>
      {state === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
      {state === "broken" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageOff className="size-4" aria-hidden />
          <span className="px-1 text-center text-[11px] leading-tight">{label || "No photo"}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setState("ready")}
          onError={() => setState("broken")}
          className={cn("absolute inset-0 size-full transition-opacity duration-300 ease-out", fit === "cover" ? "object-cover" : "object-contain", state === "ready" ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label, disabled, className }: {
  value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string; disabled?: boolean; className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("ms-seg inline-flex h-8 items-stretch rounded-[10px] border border-border bg-background p-[2px]", disabled && "opacity-50", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-8 flex-1 rounded-[8px] px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150",
            "hover:text-foreground disabled:cursor-not-allowed",
            o.value === value && "bg-muted text-foreground shadow-[0_1px_0_rgba(0,0,0,0.04)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, hint, action, children, className, id }: { title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("ms-section rounded-[12px] border border-border bg-card p-3.5", className)}>
      <header className="mb-3 flex min-h-7 flex-col gap-2 min-[481px]:flex-row min-[481px]:items-start min-[481px]:justify-between min-[481px]:gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** One label column, one control column, one baseline: every form row in the page. */
export function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="ms-row grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-1">
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted-foreground">{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "amber" | "red" }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    blue: "bg-[var(--badge-blue-bg,#e8f0ff)] text-[var(--badge-blue-fg,#1d4ed8)]",
    green: "bg-[var(--badge-green-bg,#e7f6ec)] text-[var(--badge-green-fg,#15803d)]",
    amber: "bg-[var(--badge-amber-bg,#fdf3e1)] text-[var(--badge-amber-fg,#b45309)]",
    red: "bg-[#fdecec] text-[#b42318]",
  };
  return <span className={cn("inline-flex h-5 items-center rounded-[6px] px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}
