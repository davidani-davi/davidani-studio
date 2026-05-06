"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  activeStudioJobCount,
  clearInactiveStudioJobs,
  hydrateStudioJobsFromCloud,
  readStudioJobs,
  removeStudioJob,
  subscribeStudioJobs,
  type StudioJob,
  type StudioJobKind,
  type StudioJobStatus,
} from "@/components/studio-job-store";
import {
  clearActivityFeed,
  getActivityActor,
  hydrateActivityFeedFromCloud,
  readActivityFeed,
  setActivityActor,
  subscribeActivityFeed,
  type ActivityEvent,
} from "@/components/activity-store";

const ACTIVE_STATUSES = new Set<StudioJobStatus>(["queued", "analyzing", "generating", "saving"]);

const STUDIO_LABELS: Record<StudioJobKind, string> = {
  image: "Image Studio",
  model: "Single Model Studio",
  "model-beta": "Multi Model Studio",
  prompt: "Prompt Studio",
  techpack: "Techpack Studio",
  library: "Library",
};

const STUDIO_HREFS: Record<StudioJobKind, string> = {
  image: "/",
  model: "/model-studio",
  "model-beta": "/model-studio-beta",
  prompt: "/prompt-studio",
  techpack: "/techpack-studio",
  library: "/library",
};

const STATUS_LABELS: Record<StudioJobStatus, string> = {
  queued: "Queued",
  analyzing: "Analyzing",
  generating: "Generating",
  saving: "Saving",
  done: "Done",
  failed: "Failed",
};
const DEFAULT_TEAM_MEMBERS = ["Team", "David", "Jihyun", "Heejin", "Jeongah", "Jane"];
const CUSTOM_TEAM_MEMBERS_KEY = "davidani_custom_team_members_v1";

function timeAgo(timestamp: number): string {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function openJobResult(job: StudioJob) {
  if (!job.resultId || !job.currentIdKey) return;
  localStorage.setItem(job.currentIdKey, job.resultId);
  window.dispatchEvent(
    new CustomEvent("davidani:history-updated", {
      detail: { historyKey: job.historyKey, currentId: job.resultId },
    })
  );
}

export default function JobCenter() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [actor, setActor] = useState("Team");
  const [customMembers, setCustomMembers] = useState<string[]>([]);
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const refresh = () => setJobs(readStudioJobs());
    const refreshActivity = () => {
      setActivity(readActivityFeed());
      setActor(getActivityActor());
      setCustomMembers(readCustomTeamMembers());
    };
    refresh();
    refreshActivity();
    let cancelled = false;
    hydrateStudioJobsFromCloud()
      .then((cloudJobs) => {
        if (!cancelled) setJobs(cloudJobs);
      })
      .catch((err) => console.warn("Cloud jobs hydration failed:", err));
    hydrateActivityFeedFromCloud()
      .then((events) => {
        if (!cancelled) setActivity(events);
      })
      .catch((err) => console.warn("Activity feed hydration failed:", err));
    const unsubscribe = subscribeStudioJobs(refresh);
    const unsubscribeActivity = subscribeActivityFeed(refreshActivity);
    window.addEventListener("storage", refresh);
    window.addEventListener("storage", refreshActivity);
    window.addEventListener("davidani:generation-jobs-updated", refresh);
    window.addEventListener("davidani:activity-updated", refreshActivity);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeActivity();
      window.removeEventListener("storage", refresh);
      window.removeEventListener("storage", refreshActivity);
      window.removeEventListener("davidani:generation-jobs-updated", refresh);
      window.removeEventListener("davidani:activity-updated", refreshActivity);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    hydrateStudioJobsFromCloud()
      .then(setJobs)
      .catch((err) => console.warn("Cloud jobs refresh failed:", err));
    hydrateActivityFeedFromCloud()
      .then(setActivity)
      .catch((err) => console.warn("Activity feed refresh failed:", err));
  }, [open]);

  const activeCount = useMemo(
    () => jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).length || activeStudioJobCount(),
    [jobs]
  );
  const activeJobs = jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
  const recentJobs = jobs.filter((job) => !ACTIVE_STATUSES.has(job.status)).slice(0, 8);
  const hasJobs = jobs.length > 0;
  const recentActivity = activity.slice(0, 10);
  const teamMembers = useMemo(
    () => [...DEFAULT_TEAM_MEMBERS, ...customMembers.filter((name) => !DEFAULT_TEAM_MEMBERS.includes(name))],
    [customMembers]
  );

  return (
    <div className="job-center">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`job-center-trigger ${activeCount > 0 ? "job-center-trigger--active" : ""}`}
        aria-expanded={open}
      >
        <span className="job-center-trigger__dot" />
        <span>Jobs</span>
        <strong>{activeCount}</strong>
      </button>

      {open ? (
        <div className="job-center-panel">
          <div className="job-center-panel__header">
            <div>
              <p className="job-center-eyebrow">Job Center</p>
              <h2>Production queue</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="job-center-close">
              Close
            </button>
          </div>

          <div className="job-center-summary">
            <span>{activeJobs.length} active</span>
            <span>{recentJobs.length} recent</span>
            <label className="job-center-actor">
              <span>Working as</span>
              <select
                value={actor}
                onChange={(event) => {
                  if (event.target.value === "__add_user__") {
                    const name = window.prompt("Add team member name");
                    if (!name?.trim()) return;
                    const next = saveCustomTeamMember(name);
                    setCustomMembers(next);
                    setActor(name.trim());
                    setActivityActor(name.trim());
                    return;
                  }
                  setActor(event.target.value);
                  setActivityActor(event.target.value);
                }}
              >
                {teamMembers.map((name) => (
                  <option key={name}>{name}</option>
                ))}
                <option value="__add_user__">+ Add a user</option>
              </select>
            </label>
          </div>

          {!hasJobs ? (
            <div className="job-center-empty">
              Your active generations and recent results will appear here.
            </div>
          ) : (
            <div className="job-center-list">
              {activeJobs.length ? (
                <div className="job-center-group">
                  <p className="job-center-group__title">Running now</p>
                  {activeJobs.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </div>
              ) : null}

              {recentJobs.length ? (
                <div className="job-center-group">
                  <div className="job-center-group__head">
                    <p className="job-center-group__title">Recent</p>
                    <button type="button" onClick={clearInactiveStudioJobs}>
                      Clear
                    </button>
                  </div>
                  {recentJobs.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </div>
              ) : null}

              <div className="job-center-group">
                <div className="job-center-group__head">
                  <p className="job-center-group__title">Team activity</p>
                  {recentActivity.length ? (
                    <button type="button" onClick={clearActivityFeed}>
                      Clear
                    </button>
                  ) : null}
                </div>
                {recentActivity.length ? (
                  recentActivity.map((event) => <ActivityRow key={event.id} event={event} />)
                ) : (
                  <div className="job-center-empty job-center-empty--compact">
                    Team actions will appear here as people generate, approve, and save work.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function readCustomTeamMembers(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TEAM_MEMBERS_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
      : [];
  } catch {
    return [];
  }
}

function saveCustomTeamMember(name: string): string[] {
  const cleaned = name.trim();
  if (!cleaned) return readCustomTeamMembers();
  const next = [...new Set([...readCustomTeamMembers(), cleaned])].sort((a, b) =>
    a.localeCompare(b)
  );
  localStorage.setItem(CUSTOM_TEAM_MEMBERS_KEY, JSON.stringify(next));
  return next;
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  return (
    <div className="activity-row">
      <div>
        <p>
          <strong>{event.actor}</strong> {event.action}
        </p>
        {event.target ? <span>{event.target}</span> : null}
      </div>
      <time>{timeAgo(event.createdAt)}</time>
    </div>
  );
}

function JobRow({ job }: { job: StudioJob }) {
  const active = ACTIVE_STATUSES.has(job.status);
  const href = STUDIO_HREFS[job.kind];
  const canOpenResult = Boolean(job.resultId && job.currentIdKey);

  return (
    <div className={`job-row job-row--${job.status}`}>
      <div className="job-row__main">
        <div className="job-row__topline">
          <span className="job-row__studio">{STUDIO_LABELS[job.kind]}</span>
          <span className="job-row__time">{timeAgo(job.updatedAt)}</span>
        </div>
        <p className="job-row__label">{job.label}</p>
        {job.error ? <p className="job-row__error">{job.error}</p> : null}
      </div>
      <div className="job-row__actions">
        <span className="job-row__status">{STATUS_LABELS[job.status]}</span>
        <Link href={href} onClick={() => canOpenResult && openJobResult(job)}>
          {canOpenResult ? "Open" : active ? "View" : "Studio"}
        </Link>
        {!active ? (
          <button type="button" onClick={() => removeStudioJob(job.id)} aria-label="Remove job">
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
