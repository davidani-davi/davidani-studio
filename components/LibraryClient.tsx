"use client";

import { useEffect, useMemo, useState } from "react";
import TopTabs from "./TopTabs";
import type { LibraryStyle, LibraryView } from "@/lib/style-library";

interface LibraryDraft {
  styleNumber: string;
  color: string;
  seoName: string;
  seoDescription: string;
  views: Array<{ id: string; label: string }>;
}

interface PreviewImage {
  url: string;
  title: string;
  filename: string;
}

async function fetchLibrary(q = "", styleNumber = ""): Promise<LibraryStyle[]> {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (styleNumber.trim()) params.set("styleNumber", styleNumber.trim());
  const res = await fetch(`/api/library?${params.toString()}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Library search failed");
  return data.styles;
}

function formatViewLabel(label: string): string {
  const clean = (label || "View").replace(/[-_]+/g, " ").trim();
  return clean
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function makeDraft(style: LibraryStyle): LibraryDraft {
  return {
    styleNumber: style.styleNumber,
    color: style.color,
    seoName: style.seoName,
    seoDescription: style.seoDescription,
    views: style.views.map((view) => ({ id: view.id, label: formatViewLabel(view.label) })),
  };
}

function downloadImage(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function filenameFor(style: LibraryStyle, view: LibraryView) {
  const parts = [style.styleNumber, style.color, formatViewLabel(view.label)]
    .filter(Boolean)
    .join("-");
  return `${parts.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "library-image"}.png`;
}

export default function LibraryClient() {
  const [styles, setStyles] = useState<LibraryStyle[]>([]);
  const [q, setQ] = useState("");
  const [styleNumber, setStyleNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [bulkRegenerating, setBulkRegenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LibraryDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleCountLabel = useMemo(
    () => `${styles.length} published item${styles.length === 1 ? "" : "s"}`,
    [styles.length]
  );

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

  function startEditing(style: LibraryStyle) {
    setEditingId(style.id);
    setDrafts((items) => ({ ...items, [style.id]: makeDraft(style) }));
  }

  function updateDraft(styleId: string, patch: Partial<LibraryDraft>) {
    setDrafts((items) => ({
      ...items,
      [styleId]: { ...items[styleId], ...patch },
    }));
  }

  function updateDraftView(styleId: string, viewId: string, label: string) {
    setDrafts((items) => ({
      ...items,
      [styleId]: {
        ...items[styleId],
        views: items[styleId].views.map((view) =>
          view.id === viewId ? { ...view, label } : view
        ),
      },
    }));
  }

  async function saveDraft(styleId: string) {
    const draft = drafts[styleId];
    if (!draft) return;

    setSavingId(styleId);
    setError(null);
    try {
      const res = await fetch("/api/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", styleId, ...draft }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Library update failed");
      setStyles((items) =>
        items.map((item) => (item.id === styleId ? data.style : item))
      );
      setEditingId(null);
    } catch (err: any) {
      setError(err?.message || "Library update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function regenerateSeo(styleId: string) {
    setRegeneratingId(styleId);
    setError(null);
    try {
      const res = await fetch("/api/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "SEO regeneration failed");
      setStyles((items) =>
        items.map((item) => (item.id === styleId ? data.style : item))
      );
      if (editingId === styleId) {
        setDrafts((items) => ({ ...items, [styleId]: makeDraft(data.style) }));
      }
    } catch (err: any) {
      setError(err?.message || "SEO regeneration failed");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function redoVisibleSeo() {
    if (styles.length === 0) return;
    const ok = window.confirm(
      `Redo Faire SEO for ${styles.length} visible published item${
        styles.length === 1 ? "" : "s"
      }? This will replace the current title and description.`
    );
    if (!ok) return;

    setBulkRegenerating(true);
    setError(null);
    try {
      for (let i = 0; i < styles.length; i++) {
        const style = styles[i];
        setBulkProgress(`${i + 1} of ${styles.length}: ${style.styleNumber} ${style.color}`);
        await regenerateSeo(style.id);
      }
      setBulkProgress(`Finished ${styles.length} item${styles.length === 1 ? "" : "s"}.`);
    } finally {
      setBulkRegenerating(false);
    }
  }

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
            placeholder="Search title, description, color, view..."
            className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => void redoVisibleSeo()}
            disabled={bulkRegenerating || loading || styles.length === 0}
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {bulkRegenerating ? "Redoing..." : "Redo visible SEO"}
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {loading ? "Loading" : visibleCountLabel}
          </p>
        </div>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {bulkProgress && (
          <div className="mb-4 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white">
            {bulkProgress}
          </div>
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
            {styles.map((style) => {
              const isEditing = editingId === style.id;
              const draft = drafts[style.id] || makeDraft(style);

              return (
                <article
                  key={style.id}
                  className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
                >
                  <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="grid gap-2 sm:grid-cols-[180px_180px]">
                          <input
                            value={draft.styleNumber}
                            onChange={(event) =>
                              updateDraft(style.id, { styleNumber: event.target.value })
                            }
                            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold outline-none focus:border-neutral-900"
                            aria-label="Style number"
                          />
                          <input
                            value={draft.color}
                            onChange={(event) =>
                              updateDraft(style.id, { color: event.target.value })
                            }
                            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold outline-none focus:border-neutral-900"
                            aria-label="Color"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-neutral-900">
                            {style.styleNumber}
                          </h2>
                          {style.color && (
                            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                              {style.color}
                            </span>
                          )}
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                            {style.views.length} view{style.views.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                      <p className="mt-1 text-xs text-neutral-500">
                        Updated {new Date(style.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveDraft(style.id)}
                            disabled={savingId === style.id}
                            className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                          >
                            {savingId === style.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(style)}
                          className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void regenerateSeo(style.id)}
                        disabled={regeneratingId === style.id}
                        className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                      >
                        {regeneratingId === style.id ? "Analyzing..." : "Redo SEO"}
                      </button>
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
                  </div>

                  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {style.views.map((view) => {
                        const label =
                          draft.views.find((item) => item.id === view.id)?.label ||
                          formatViewLabel(view.label);
                        const filename = filenameFor(style, { ...view, label });

                        return (
                          <figure key={view.id} className="group">
                            <button
                              type="button"
                              onClick={() =>
                                setPreview({
                                  url: view.imageUrl,
                                  title: `${style.styleNumber} ${style.color} ${formatViewLabel(
                                    label
                                  )}`.trim(),
                                  filename,
                                })
                              }
                              className="relative block aspect-[4/5] w-full overflow-hidden rounded-lg bg-neutral-100 text-left focus:outline-none focus:ring-2 focus:ring-neutral-900"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={view.imageUrl}
                                alt={`${style.styleNumber} ${label}`}
                                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                              />
                              <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-800 opacity-0 shadow-sm transition group-hover:opacity-100">
                                View
                              </span>
                            </button>
                            <div className="mt-2 flex items-center gap-2">
                              {isEditing ? (
                                <input
                                  value={label}
                                  onChange={(event) =>
                                    updateDraftView(style.id, view.id, event.target.value)
                                  }
                                  className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium outline-none focus:border-neutral-900"
                                  aria-label="View label"
                                />
                              ) : (
                                <figcaption className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-700">
                                  {formatViewLabel(label)}
                                </figcaption>
                              )}
                              <button
                                type="button"
                                onClick={() => downloadImage(view.imageUrl, filename)}
                                className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                              >
                                Download
                              </button>
                            </div>
                          </figure>
                        );
                      })}
                    </div>
                    <div className="rounded-lg bg-neutral-50 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Faire SEO Title
                      </p>
                      {isEditing ? (
                        <input
                          value={draft.seoName}
                          onChange={(event) =>
                            updateDraft(style.id, { seoName: event.target.value })
                          }
                          className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-neutral-900"
                        />
                      ) : (
                        <p className="mt-1 text-sm font-semibold text-neutral-900">
                          {style.seoName}
                        </p>
                      )}
                      <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Faire Description
                      </p>
                      {isEditing ? (
                        <textarea
                          value={draft.seoDescription}
                          onChange={(event) =>
                            updateDraft(style.id, { seoDescription: event.target.value })
                          }
                          rows={8}
                          className="mt-2 w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-neutral-900"
                        />
                      ) : (
                        <p className="mt-1 text-sm leading-relaxed text-neutral-700">
                          {style.seoDescription}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-neutral-900">
                {preview.title}
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => downloadImage(preview.url, preview.filename)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex max-h-[calc(92vh-58px)] justify-center overflow-auto bg-neutral-100 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.title}
                className="max-h-[calc(92vh-90px)] w-auto max-w-full rounded-lg object-contain shadow-sm"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
