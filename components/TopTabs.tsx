"use client";

import Link from "next/link";

/**
 * Tab bar that lives in the header of every studio page. Presents Image
 * Studio and Model Studio as sibling workflows. Active state is passed in
 * explicitly rather than derived from the URL so each page can render the
 * header statically without a router-hook round-trip on mount.
 */

export type StudioTab = "image" | "model";

interface Props {
  active: StudioTab;
}

export default function TopTabs({ active }: Props) {
  const tabs: { id: StudioTab; label: string; href: string }[] = [
    { id: "image", label: "Image Studio", href: "/" },
    { id: "model", label: "Model Studio", href: "/model-studio" },
  ];

  return (
    <nav className="ml-6 flex items-center gap-1 text-sm">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`rounded-md px-2 py-1 transition ${
              isActive
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
