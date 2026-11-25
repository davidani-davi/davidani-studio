"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Button } from "@/components/ui/button";

export type SidePanelTab = "details" | "setup";

/**
 * Details and Setup docked beside the stage on wide screens, so changing a
 * setting or reading a run's trail does not cover the images. Narrow screens
 * keep the slide-over drawers.
 */
export default function SidePanel({
  tab,
  onTabChange,
  onClose,
  details,
  setup,
}: {
  tab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  onClose: () => void;
  details: ReactNode;
  setup: ReactNode;
}) {
  return (
    <aside className="studio-side-panel" aria-label={tab === "details" ? "Run details" : "Setup"}>
      <div className="studio-side-panel__head">
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as SidePanelTab)} variant="segment">
          <TabsList className="rounded-[10px] bg-muted p-0.5">
            <TabsTrigger
              value="details"
              className={`h-7 rounded-lg px-3 py-0 text-xs font-medium ${tab === "details" ? "text-foreground" : ""}`}
              indicatorClassName="rounded-lg bg-white shadow-[0_0_0_1px_rgb(0_0_0/.06),0_1px_2px_rgb(0_0_0/.08)]"
            >
              Details
            </TabsTrigger>
            <TabsTrigger
              value="setup"
              className={`h-7 rounded-lg px-3 py-0 text-xs font-medium ${tab === "setup" ? "text-foreground" : ""}`}
              indicatorClassName="rounded-lg bg-white shadow-[0_0_0_1px_rgb(0_0_0/.06),0_1px_2px_rgb(0_0_0/.08)]"
            >
              Setup
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
          <X aria-hidden />
        </Button>
      </div>
      <div className="studio-side-panel__body">{tab === "details" ? details : setup}</div>
    </aside>
  );
}
