"use client";

import Link from "next/link";

/**
 * Tab bar that lives in the header of every studio page. Presents Image
 * Studio and Model Studio as sibling workflows. Active state is passed in
 * explicitly rather than derived from the URL so each page can render the
 * header statically without a router-hook round-trip on mount.
 */

export type StudioTab = "image" | "model" | "prompt" | "design" | "library";

interface Props {
  active: StudioTab;
}

export default function TopTabs({ active }: Props) {
  const tabs: { id: StudioTab; label: string; href: string }[] = [
    { id: "image", label: "Image Studio", href: "/" },
    { id: "model", label: "Model Studio", href: "/model-studio" },
    { id: "prompt", label: "Prompt Studio", href: "/prompt-studio" },
    { id: "design", label: "Design Studio", href: "/design-studio" },
    { id: "library", label: "Library", href: "/library" },
  ];

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm sm:ml-6">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`relative px-2 py-1.5 text-[12px] font-medium transition ${
              isActive
                ? "text-neutral-950 after:absolute after:inset-x-2 after:-bottom-[15px] after:h-0.5 after:bg-brand-500"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
