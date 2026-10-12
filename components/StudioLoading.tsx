import type { CSSProperties } from "react";
import StudioHeader from "@/components/StudioHeader";
import type { StudioTab } from "@/components/TopTabs";
import { LEDGER_DEFAULT } from "@/lib/pane-size";

/**
 * Route-level loading screen for studios whose page waits on the server
 * (Single / Multi model read the model catalogue before rendering). Without
 * it a tab click shows nothing until that read finishes, so the click feels
 * dead. The real header renders at once, so the chips stay put, and the
 * ledger and stage shimmer in the same split the page lands in.
 */
export default function StudioLoading({
  active,
  title,
  subtitle,
}: {
  active: StudioTab;
  title: string;
  subtitle?: string;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-neutral-50 lg:h-screen" aria-busy="true">
      <StudioHeader active={active} title={title} subtitle={subtitle} />
      <div
        className="model-studio-layout min-h-0 flex-1"
        style={{ "--ledger-w": `${LEDGER_DEFAULT}px` } as CSSProperties}
      >
        <aside className="image-studio-ledger flex h-full min-h-0 flex-col gap-2 border-r border-neutral-200 bg-neutral-50 p-2">
          <div className="studio-skeleton h-8 w-full" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-md border border-neutral-200 bg-white p-3">
              <div className="studio-skeleton h-3 w-24" />
              <div className="studio-skeleton mt-2 h-3 w-3/5" />
              <div className="mt-3 flex gap-2">
                <div className="studio-skeleton h-[72px] w-12" />
                <div className="studio-skeleton h-[72px] w-12" />
                <div className="studio-skeleton h-[72px] w-12" />
              </div>
            </div>
          ))}
        </aside>
        <section className="image-studio-stage flex h-full min-h-[320px] flex-col items-center justify-center gap-3 bg-neutral-50 p-8">
          <div className="studio-skeleton aspect-[4/5] w-full max-w-[360px]" />
          <p className="text-xs text-neutral-500" role="status">
            Loading {title}…
          </p>
        </section>
      </div>
    </main>
  );
}
