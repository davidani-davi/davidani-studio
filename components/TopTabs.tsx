"use client";

import Link from "next/link";

/**
 * Tab bar that lives in the header of every studio page. Presents Image
 * Studio and Model Studio as sibling workflows. Active state is passed in
 * explicitly rather than derived from the URL so each page can render the
 * header statically without a router-hook round-trip on mount.
 */

export type StudioTab = "image" | "model" | "prompt" | "design" | "inspiration" | "library";

interface Props {
  active: StudioTab;
}

export default function TopTabs({ active }: Props) {
  const tabs: { id: StudioTab; label: string; href: string }[] = [
    { id: "image", label: "Image Studio", href: "/" },
    { id: "model", label: "Model Studio", href: "/model-studio" },
    { id: "prompt", label: "Prompt Studio", href: "/prompt-studio" },
    { id: "design", label: "Design Studio", href: "/design-studio" },
    { id: "inspiration", label: "Inspiration", href: "/inspiration" },
    { id: "library", label: "Library", href: "/library" },
  ];

  return (
    <nav className="studio-tabs" aria-label="Studio navigation">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`studio-tab ${isActive ? "studio-tab--active" : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
