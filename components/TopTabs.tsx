"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Compact expanding-pill navigation, shared by every studio page. The pill
 * holds two grouped dropdowns (Studios, Tools) plus two plain links; hovering
 * or clicking a group expands the pill downward into a card panel. Active
 * state is passed in explicitly rather than derived from the URL so each page
 * can render the header statically without a router-hook round-trip on mount.
 */

export type StudioTab =
  | "image"
  | "playground"
  | "photoshoot"
  | "model"
  | "model-beta"
  | "prompt"
  | "techpack"
  | "faire-seo"
  | "inspiration"
  | "library"
  | "cad";

interface Props {
  active: StudioTab;
}

interface NavItem {
  id: StudioTab;
  label: string;
  href: string;
  description: string;
  icon: ReactNode;
  beta?: boolean;
  util?: boolean;
}

interface NavGroup {
  key: "studios" | "tools";
  label: string;
  items: NavItem[];
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

const NAV_GROUPS: NavGroup[] = [
  {
    key: "studios",
    label: "Studios",
    items: [
      {
        id: "image",
        label: "Image Studio",
        href: "/",
        description: "Product and flat-lay shots",
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" {...stroke} />
            <circle cx="5.5" cy="5.5" r="1.4" {...stroke} />
            <path d="M2 12l3.5-3.5L9 12l2.5-2.5 2.5 2.5" {...stroke} />
          </svg>
        ),
      },
      {
        id: "model",
        label: "Single Model Studio",
        href: "/model-studio",
        description: "On-model imagery, one model",
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="5" r="2.6" {...stroke} />
            <path d="M2.8 14c.7-2.9 2.8-4.4 5.2-4.4s4.5 1.5 5.2 4.4" {...stroke} />
          </svg>
        ),
      },
      {
        id: "model-beta",
        label: "Multi Model Studio",
        href: "/model-studio-beta",
        description: "Group shots, multiple models",
        beta: true,
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="5.5" cy="5.5" r="2.2" {...stroke} />
            <circle cx="11" cy="6.5" r="1.8" {...stroke} />
            <path d="M1.8 13.5c.6-2.4 2.1-3.6 3.7-3.6 1.7 0 3.2 1.2 3.8 3.6M9.8 10.6c1.9-.6 3.8.4 4.4 2.9" {...stroke} />
          </svg>
        ),
      },
      {
        id: "photoshoot",
        label: "Photoshoot Generator",
        href: "/photoshoot-studio",
        description: "Consistent multi-shot sets",
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5.5 4l1-1.6h3L10.5 4H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5v-6A1.5 1.5 0 013 4h2.5z" {...stroke} />
            <circle cx="8" cy="8.2" r="2.4" {...stroke} />
          </svg>
        ),
      },
      {
        id: "playground",
        label: "Image Playground",
        href: "/image-playground",
        description: "Freeform image experiments",
        util: true,
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.8l1.4 4.3L13.8 8l-4.4 1.9L8 14.2 6.6 9.9 2.2 8l4.4-1.9L8 1.8z" {...stroke} />
            <circle cx="13" cy="3" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        ),
      },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    items: [
      {
        id: "prompt",
        label: "Prompt Studio",
        href: "/prompt-studio",
        description: "Build and refine prompts",
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 13.5c2-.5 3-.2 4.2.5M3 13.5C3.5 9 5.5 5 9.5 2.5c1.5 1 2.5 2.5 3 4.5C10 10.5 7 12.5 3 13.5z" {...stroke} />
          </svg>
        ),
      },
      {
        id: "techpack",
        label: "Techpack Studio",
        href: "/techpack-studio",
        description: "Techpacks from style data",
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M9.5 1.8H4A1.2 1.2 0 002.8 3v10A1.2 1.2 0 004 14.2h8a1.2 1.2 0 001.2-1.2V5.5l-3.7-3.7z" {...stroke} />
            <path d="M9.3 2v3.9h3.9M5.5 8.5h5M5.5 11h5" {...stroke} />
          </svg>
        ),
      },
      {
        id: "cad",
        label: "CAD Extractor",
        href: "/cad-extractor",
        description: "Clean CADs from source files",
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9L8 1.8z" {...stroke} />
            <path d="M8 8v6.2M8 8L2.6 4.9M8 8l5.4-3.1" {...stroke} strokeWidth={1.1} />
          </svg>
        ),
      },
      {
        id: "faire-seo",
        label: "Faire SEO",
        href: "/faire-seo",
        description: "Listing titles and SEO copy",
        icon: (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="6.8" cy="6.8" r="5" {...stroke} />
            <path d="M10.6 10.6L14.2 14.2" {...stroke} />
          </svg>
        ),
      },
    ],
  },
];

const PLAIN_LINKS: { id: StudioTab; label: string; href: string }[] = [
  { id: "inspiration", label: "Inspiration", href: "/inspiration" },
  { id: "library", label: "Library", href: "/library" },
];

const Chevron = (
  <svg className="studio-nav-chev" viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M2.5 4.5L6 8l3.5-3.5"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export default function TopTabs({ active }: Props) {
  const router = useRouter();
  const [openGroup, setOpenGroup] = useState<NavGroup["key"] | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const usingKeyboard = useRef(false);

  const activeGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.id === active))?.key ?? null;

  const show = useCallback(
    (group: NavGroup["key"]) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (openGroup === group) return;
      const inner = innerRef.current;
      if (openGroup !== null && inner) {
        const h0 = inner.offsetHeight;
        setOpenGroup(group);
        requestAnimationFrame(() => {
          const pane = inner.querySelector<HTMLElement>(".studio-nav-panes");
          if (!pane) return;
          inner.style.height = `${h0}px`;
          void inner.offsetHeight;
          inner.style.transition = "height 0.26s cubic-bezier(0.32, 0.72, 0.25, 1)";
          inner.style.height = `${pane.offsetHeight}px`;
          if (heightTimer.current) clearTimeout(heightTimer.current);
          heightTimer.current = setTimeout(() => {
            inner.style.transition = "";
            inner.style.height = "";
          }, 280);
        });
      } else {
        setOpenGroup(group);
      }
    },
    [openGroup]
  );

  const close = useCallback(() => {
    pinned.current = false;
    setOpenGroup(null);
  }, []);

  // Dropdown cards only mount when a panel opens, so Next's viewport-based
  // Link prefetch never fires for them until it's too late. Warm every nav
  // destination once so the first click doesn't stall on RSC/chunk fetches.
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) router.prefetch(item.href);
    }
    for (const link of PLAIN_LINKS) router.prefetch(link.href);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") usingKeyboard.current = true;
    };
    const onDown = (e: MouseEvent) => {
      usingKeyboard.current = false;
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (heightTimer.current) clearTimeout(heightTimer.current);
    };
  }, [close]);

  const scheduleClose = () => {
    if (pinned.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, 160);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const pane = openGroup ? NAV_GROUPS.find((g) => g.key === openGroup) : null;

  return (
    <div className="studio-nav-slot">
      <nav
        ref={shellRef}
        className={`studio-nav ${openGroup ? "studio-nav--open" : ""}`}
        aria-label="Studio navigation"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <div className="studio-nav__row">
          {NAV_GROUPS.map((g) => {
            const isOpen = openGroup === g.key;
            const isActive = activeGroup === g.key;
            return (
              <button
                key={g.key}
                type="button"
                className={`studio-nav-trigger ${isActive ? "is-active" : ""} ${isOpen ? "is-open" : ""}`}
                aria-expanded={isOpen}
                onMouseEnter={() => show(g.key)}
                onFocus={() => {
                  if (usingKeyboard.current) show(g.key);
                }}
                onClick={() => {
                  if (isOpen && pinned.current) {
                    close();
                  } else {
                    show(g.key);
                    pinned.current = true;
                  }
                }}
              >
                {g.label}
                {Chevron}
              </button>
            );
          })}
          {PLAIN_LINKS.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              className={`studio-nav-trigger ${active === l.id ? "is-active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="studio-nav-drawer">
          <div ref={innerRef} className="studio-nav-drawer__inner">
            {pane ? (
              <div className="studio-nav-panes" key={pane.key}>
                {pane.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`studio-nav-card ${item.util ? "studio-nav-card--util" : ""} ${
                      active === item.id ? "is-current" : ""
                    }`}
                    onClick={close}
                  >
                    {item.icon}
                    <span className="studio-nav-card__text">
                      <b>
                        {item.label}
                        {item.beta ? <span className="studio-nav-beta">BETA</span> : null}
                      </b>
                      <small>{item.description}</small>
                    </span>
                    {item.util ? (
                      <svg className="studio-nav-card__arr" viewBox="0 0 12 12" aria-hidden="true">
                        <path
                          d="M2.5 6h7M6.5 3l3 3-3 3"
                          stroke="currentColor"
                          strokeWidth={1.3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    ) : null}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </nav>
    </div>
  );
}
