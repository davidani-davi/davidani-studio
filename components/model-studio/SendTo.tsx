"use client";

// "Send to" for the kept views (2026-11-27): an ERP-style file (ZIP + manifest.csv) or the style's Faire
// listing. Faire goes through the extension on the listing page, so the last step (Upload in the square
// editor) is always a person's click on Faire. ERP upload stays paused until ERP PR #43 lands.
import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileArchive, Send, Store, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import core from "@/lib/model-shots-core";
import {
  exportRows, exportZipName, faireHandoffUrl, faireStateLabel, manifestCsv, savedIdsFor, zipFiles, type FaireDestination,
} from "@/lib/model-studio/send-to";
import type { SavedShot, Slot } from "@/lib/model-studio/types";
import { api, ApiError } from "./api";
import { Thumb } from "./bits";

export const ERP_UPLOAD_REASON = "ERP upload is paused while the ERP write load is fixed (PR #43).";

type Lookup =
  | { status: "loading" }
  | { status: "found"; dest: FaireDestination }
  | { status: "none" }
  | { status: "unset" }
  | { status: "error"; error: string };

/** A pasted Faire link or bare id → the p_… id, or "". */
export function listingIdOf(text: string): string {
  return text.trim().match(/\bp_\w+/)?.[0] || "";
}

async function fetchBytes(url: string, name: string): Promise<Uint8Array> {
  const res = await fetch(`/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new ApiError(`Could not read ${name}.`, res.status);
  return new Uint8Array(await res.arrayBuffer());
}

function saveBlob(bytes: Uint8Array, name: string, type: string) {
  const href = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export function SendTo({ style, color, kept, model, disabled, size, onSave, onNotice }: {
  style: string; color: string; kept: Slot[]; model: string; disabled: boolean;
  /** "sm" in the canvas run bar. */
  size?: "sm";
  /** Saves the kept views to the shared saved set and returns the set as the studio now has it. */
  onSave: () => Promise<SavedShot[] | null>;
  onNotice: (text: string) => void;
}) {
  const [zipping, setZipping] = useState(false);
  const [faireOpen, setFaireOpen] = useState(false);

  const exportFile = async () => {
    setZipping(true);
    try {
      const rows = exportRows(style, color, kept, model);
      const files = [];
      for (const r of rows) files.push({ name: r.file, data: await fetchBytes(r.url, r.file) });
      files.push({ name: "manifest.csv", data: new TextEncoder().encode(manifestCsv(rows)) });
      saveBlob(zipFiles(files), exportZipName(style, color), "application/zip");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "The file could not be made.");
    } finally {
      setZipping(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="default" size={size} disabled={disabled || zipping} />}>
          <Send data-icon="inline-start" aria-hidden />{zipping ? "Making file…" : `Send to${kept.length ? ` (${kept.length})` : ""}`}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start">
          <DropdownMenuItem onClick={() => setFaireOpen(true)}>
            <Store aria-hidden />
            <span className="flex flex-col"><span>Faire listing</span><span className="text-[11px] text-muted-foreground">Square and add on the listing page</span></span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void exportFile()}>
            <FileArchive aria-hidden />
            <span className="flex flex-col"><span>ERP file (ZIP + CSV)</span><span className="text-[11px] text-muted-foreground">Views with ERP names and a manifest</span></span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <Upload aria-hidden />
            <span className="flex flex-col"><span>Upload to ERP</span><span className="text-[11px] text-muted-foreground">Paused until ERP PR #43</span></span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FaireSend open={faireOpen} onOpenChange={setFaireOpen} style={style} color={color} kept={kept} onSave={onSave} />
    </>
  );
}

export function FaireSend({ open, onOpenChange, style, color, kept, onSave }: {
  open: boolean; onOpenChange: (open: boolean) => void; style: string; color: string; kept: Slot[];
  onSave: () => Promise<SavedShot[] | null>;
}) {
  const [lookup, setLookup] = useState<Lookup>({ status: "loading" });
  const [pasted, setPasted] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const asked = useRef("");

  useEffect(() => {
    if (!open || asked.current === style) return;
    asked.current = style;
    setLookup({ status: "loading" }); setError(""); setPasted("");
    api<FaireDestination & { ok: true }>(`/api/model-studio/faire-destination?style=${encodeURIComponent(style)}`)
      .then((d) => setLookup(d.productId ? { status: "found", dest: d } : { status: "none" }))
      .catch((err) => {
        asked.current = "";
        if (err instanceof ApiError && err.status === 503) setLookup({ status: "unset" });
        else setLookup({ status: "error", error: err instanceof Error ? err.message : "The Faire lookup failed." });
      });
  }, [open, style]);

  const productId = lookup.status === "found" ? lookup.dest.productId || "" : listingIdOf(pasted);

  const send = async () => {
    if (!productId) return;
    // Reserve the tab inside the click so the save that follows cannot get it popup-blocked.
    const tab = window.open("about:blank", "_blank");
    setSending(true); setError("");
    try {
      const saved = await onSave();
      if (!saved) throw new Error("The views were not saved, so nothing was sent.");
      const ids = savedIdsFor(kept, saved);
      if (ids.length !== kept.length) throw new Error("Some views did not save. Try again.");
      const url = faireHandoffUrl(productId, ids);
      if (tab) { tab.opener = null; tab.location.href = url; } else window.open(url, "_blank", "noopener");
      onOpenChange(false);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Could not send to Faire.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="ms-faire-send max-w-[520px] rounded-[12px]">
        <DialogHeader>
          <DialogTitle>Send to Faire</DialogTitle>
          <DialogDescription>
            {style}{color ? ` · ${color}` : ""}. These views go to the shared saved set, then the listing opens on Faire with them in Model Studio.
            Nothing is added to the listing until you click Upload in the square editor there.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2" aria-label="Views to send">
          {kept.map((s, i) => (
            <figure key={`${s.view}-${i}`} className="space-y-1">
              <Thumb src={s.url} alt={`${style} ${s.view}`} className="aspect-[3/4] w-full" />
              <figcaption className="text-[11px] text-muted-foreground">{i + 1}. {core.VIEW_LABEL[s.view] || s.view}</figcaption>
            </figure>
          ))}
        </div>

        <div className="rounded-[10px] border border-border p-3 text-[13px]" data-testid="faire-listing">
          {lookup.status === "loading" && <p className="text-muted-foreground">Finding {style} on Faire…</p>}
          {lookup.status === "found" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Listing <span className="font-mono text-[12px]">{lookup.dest.productId}</span>{lookup.dest.state ? ` · ${faireStateLabel(lookup.dest.state)}` : ""}</span>
              {lookup.dest.url && <a className="inline-flex items-center gap-1 text-[12px] underline underline-offset-2" href={lookup.dest.url} target="_blank" rel="noopener noreferrer">Open listing<ExternalLink className="size-3" aria-hidden /></a>}
            </div>
          )}
          {lookup.status !== "found" && lookup.status !== "loading" && (
            <div className="space-y-2">
              <p className="text-muted-foreground">
                {lookup.status === "none" ? `Faire has no listing for ${style} yet. Create the draft first, or paste a listing link.`
                  : lookup.status === "unset" ? "The automatic Faire lookup is not set up yet. Paste the listing link from Faire."
                  : `${lookup.error} Paste the listing link instead.`}
              </p>
              <Input aria-label="Faire listing link" placeholder="https://www.faire.com/brand-portal/my-shop/products/p_…" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            </div>
          )}
        </div>

        {error && <Alert variant="error" className="rounded-[10px]"><AlertDescription>{error}</AlertDescription></Alert>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!productId || sending || !kept.length} onClick={() => void send()}>
            <Store data-icon="inline-start" aria-hidden />{sending ? "Saving…" : "Save and open on Faire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
