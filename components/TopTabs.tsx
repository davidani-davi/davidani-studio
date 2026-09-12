"use client";
import Link from "next/link";
import { STUDIO_TOOLS } from "@/lib/studio-navigation";
export type { StudioTab } from "@/lib/studio-navigation";
import type { StudioTab } from "@/lib/studio-navigation";

export default function TopTabs({ active }: { active: StudioTab }) {
  return (
    <div className="paper-navigation">
      <nav aria-label="Workspaces" className="paper-workspaces">
        <Link href="/home" aria-current={active === "home" ? "page" : undefined}>Home</Link>
        <Link href="/" aria-current={active !== "home" && active !== "playground" ? "true" : undefined}>Studio</Link>
        <Link href="/creative-lab" aria-current={active === "playground" ? "page" : undefined}>Creative Lab</Link>
        <a href="https://davidani-season-plan.vercel.app" target="_blank" rel="noopener noreferrer">Season Plan <span aria-label="opens in a new tab">↗</span></a>
        <a href="https://davidani-playground.vercel.app" target="_blank" rel="noopener noreferrer">Playground <span aria-label="opens in a new tab">↗</span></a>
      </nav>
      <nav aria-label="Studio tools" className="paper-tools">
        {STUDIO_TOOLS.map(({ id, label, href }) => (
          <Link key={id} href={href} aria-current={active === id ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
