"use client";

import Link from "next/link";

/**
 * Tab bar that lives in the header of every studio page. Presents Image
 * Studio and Model Studio as sibling workflows. Active state is passed in
 * explicitly rather than derived from the URL so each page can render the
 * header statically without a router-hook round-trip on mount.
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

export default function TopTabs({ active }: Props) {
  const tabs: { id: StudioTab; label: string; href: string }[] = [
    { id: "image", label: "Image Studio", href: "/" },
    { id: "model", label: "Single Model Studio", href: "/model-studio" },
    { id: "model-beta", label: "Multi Model Studio", href: "/model-studio-beta" },
    { id: "prompt", label: "Prompt Studio", href: "/prompt-studio" },
    { id: "photoshoot", label: "Photoshoot Generator", href: "/photoshoot-studio" },
    { id: "techpack", label: "Techpack Studio", href: "/techpack-studio" },
    { id: "faire-seo", label: "Faire SEO", href: "/faire-seo" },
    { id: "inspiration", label: "Inspiration", href: "/inspiration" },
    { id: "library", label: "Library", href: "/library" },
    { id: "playground", label: "Image Playground", href: "/image-playground" },
    { id: "cad", label: "CAD Extractor", href: "/cad-extractor" },
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
