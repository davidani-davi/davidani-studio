"use client";

import type { ReactNode } from "react";
import TopTabs, { type StudioTab } from "@/components/TopTabs";

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
  badge = "V1.5",
  metrics = [],
  action,
}: Props) {
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
        {metrics.length ? (
          <div className="studio-metrics">
            {metrics.map((metric) => (
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
