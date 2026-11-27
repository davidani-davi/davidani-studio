"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import JobCenter from "@/components/JobCenter";
import StudioBootOverlay from "@/components/StudioBootOverlay";
import TopTabs, { type StudioTab } from "@/components/TopTabs";
import ToolMenu from "@/components/ToolMenu";
import { activeStudioJobCount, subscribeStudioJobs } from "@/components/studio-job-store";

interface Metric {
  label: string;
  value: string | number;
}

interface Props {
  active: StudioTab;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  metrics?: Metric[];
  action?: ReactNode;
  /**
   * One slim row for canvas-first screens: brand, the current tool as a menu
   * of every page and tool, the job indicator and `action`. Subtitle, metrics
   * and the two nav rows are dropped so the stage gets the height.
   */
  compact?: boolean;
}

export default function StudioHeader({
  active,
  eyebrow = "Davi & Dani",
  title = "Photo Studio",
  subtitle,
  metrics = [],
  action,
  compact,
}: Props) {
  const [globalActiveJobs, setGlobalActiveJobs] = useState(0);

  useEffect(() => {
    const refresh = () => setGlobalActiveJobs(activeStudioJobCount());
    refresh();
    const unsubscribe = subscribeStudioJobs(refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("davidani:generation-jobs-updated", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", refresh);
      window.removeEventListener("davidani:generation-jobs-updated", refresh);
    };
  }, []);

  const visibleMetrics =
    globalActiveJobs > 0
      ? [
          ...metrics.filter((metric) => metric.label.toLowerCase() !== "active"),
          { label: "Active", value: globalActiveJobs },
        ]
      : metrics;

  if (compact) {
    return (
      <header className="studio-header-compact">
        <StudioBootOverlay />
        <Link href="/" className="studio-header-compact__brand">{eyebrow}</Link>
        <span className="studio-header-compact__sep" aria-hidden="true">/</span>
        <ToolMenu active={active} />
        <div className="studio-header-compact__meta">
          <JobCenter />
          {action}
        </div>
      </header>
    );
  }

  return (
    <header className="studio-header">
      <StudioBootOverlay />
      <div className="studio-header__brand">
        <Link href="/" className="studio-eyebrow">{eyebrow}</Link>
        <span className="studio-header__sep" aria-hidden="true">/</span>
        <h1 className="studio-title">{title}</h1>
        {subtitle ? <p className="studio-subtitle" title={subtitle}>{subtitle}</p> : null}
      </div>
      <div className="studio-header__meta">
        <JobCenter />
        {visibleMetrics.length ? (
          <div className="studio-metrics">
            {visibleMetrics.map((metric) => (
              <span key={metric.label} className="studio-metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
        {action}
      </div>
      <TopTabs active={active} />
    </header>
  );
}
