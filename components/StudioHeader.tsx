"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import JobCenter from "@/components/JobCenter";
import TopTabs, { type StudioTab } from "@/components/TopTabs";
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
}

export default function StudioHeader({
  active,
  eyebrow = "Davi & Dani",
  title = "Photo Studio",
  subtitle,
  badge = "V2.3",
  metrics = [],
  action,
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

  return (
    <header className="studio-header">
      <div className="studio-header__brand">
        <div className="studio-logo">D</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="studio-eyebrow">{eyebrow}</p>
            <span className="studio-version">{badge}</span>
          </div>
          <h1 className="studio-title">{title}</h1>
          {subtitle ? <p className="studio-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      <TopTabs active={active} />

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
    </header>
  );
}
