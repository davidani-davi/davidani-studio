"use client";
import Link from "next/link";
import { STUDIO_PAGES, STUDIO_TOOLS } from "@/lib/studio-navigation";
import type { StudioTab } from "@/lib/studio-navigation";
export type { StudioTab } from "@/lib/studio-navigation";

export default function TopTabs({ active }: { active: StudioTab }) {
  return (
    <div className="paper-navigation">
      <nav aria-label="Studios" className="paper-workspaces">
        {STUDIO_PAGES.map(({ id, label, href }) => (
          <Link key={id} href={href} aria-current={active === id ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Tools" className="paper-tools">
        {STUDIO_TOOLS.map(({ id, label, href }) => (
          <Link key={id} href={href} aria-current={active === id ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
