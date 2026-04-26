"use client";

import { useEffect, useState } from "react";
import TopTabs from "./TopTabs";
import type { LibraryStyle } from "@/lib/style-library";

async function fetchLibrary(q = "", styleNumber = ""): Promise<LibraryStyle[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (styleNumber.trim()) params.set("styleNumber", styleNumber.trim());
  const res = await fetch(`/api/library?${params.toString()}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Library search failed");
  return data.styles;
}

export default function LibraryClient() {
  const [styles, setStyles] = useState<LibraryStyle[]>([]);
  const [q, setQ] = useState("");
  const [styleNumber, setStyleNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextQ = q, nextStyleNumber = styleNumber) {
    setLoading(true);
    setError(null);
    try {
      setStyles(await fetchLibrary(nextQ, nextStyleNumber));
    } catch (err: any) {
      setError(err?.message || "Library search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="flex flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
            D
          </div>
          <span className="text-sm font-semibold">Davi &amp; Dani Photo Studio</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            Library
          </span>
          <TopTabs active="library" />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          Refresh
        </button>
      </header>

      <section className="border-b border-neutral-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row">
          <input
            value={styleNumber}
            onChange={(event) => setStyleNumber(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
            placeholder="Search style number, e.g. DJ52056"
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-900 md:w-72"
          />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
            placeholder="Search name, description, view..."
            className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Search
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-6">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {loading ? (
          <p className="text-sm text-neutral-500">Loading library...</p>
        ) : styles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center text-sm text-neutral-500">
            No styles yet. Upload a result from Image Studio or Model Studio to start the team
            library.
          </div>
        ) : (
          <div className="grid gap-4">
            {styles.map((style) => (
              <article
                key={style.id}
                className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-neutral-900">
                        {style.userStyleName}
                      </h2>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                        {style.styleNumber}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Updated {new Date(style.updatedAt).toLocaleString()} · {style.views.length} view
                      {style.views.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${style.seoName}\n\n${style.seoDescription}`
                      )
                    }
                    className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    Copy SEO
                  </button>
                </div>

                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {style.views.map((view) => (
                      <figure key={view.id} className="group">
                        <div className="aspect-[4/5] overflow-hidden rounded-lg bg-neutral-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={view.imageUrl}
                            alt={`${style.styleNumber} ${view.label}`}
                            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                          />
                        </div>
                        <figcaption className="mt-1 text-xs font-medium text-neutral-600">
                          {view.label}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="rounded-lg bg-neutral-50 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      SEO Name
                    </p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">{style.seoName}</p>
                    <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                      SEO Description
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                      {style.seoDescription}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
