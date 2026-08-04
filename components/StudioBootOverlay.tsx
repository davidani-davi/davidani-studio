"use client";

import { useEffect, useState } from "react";

/**
 * First-load boot indicator. The server-rendered page paints immediately but
 * stays inert until the studio bundle hydrates; this overlay ships in the SSR
 * HTML so it is visible during exactly that dead window, then fades out the
 * moment hydration completes. Module-level flag keeps it off client-side
 * navigations, which are interactive from the first frame.
 */

let booted = false;

export default function StudioBootOverlay() {
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(booted);

  useEffect(() => {
    if (booted) return;
    booted = true;
    setReady(true);
    const t = setTimeout(() => setGone(true), 420);
    return () => clearTimeout(t);
  }, []);

  if (gone) return null;

  return (
    <div className={`studio-boot ${ready ? "studio-boot--done" : ""}`} aria-hidden="true">
      <div className="studio-boot__logo">D</div>
      <div className="studio-boot__bar">
        <span />
      </div>
      <p className="studio-boot__text">Loading studio</p>
    </div>
  );
}
