import { NextResponse } from "next/server";
import {
  formatAbReportEmail,
  readAbPreferenceIndex,
  summarizeAbPreferences,
} from "@/lib/ab-testing";

export const runtime = "nodejs";
export const maxDuration = 60;

async function sendReportEmail(subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[ab-report] RESEND_API_KEY is not set; report email skipped.");
    return { sent: false, reason: "RESEND_API_KEY missing" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AB_REPORT_FROM || "Davi Studio <onboarding@resend.dev>",
      to: "david@davidani.com",
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Resend email failed: HTTP ${res.status} ${raw.slice(0, 200)}`);
  }

  return { sent: true };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") === "weekly" ? "weekly" : "daily";
    const index = await readAbPreferenceIndex();
    const summary = summarizeAbPreferences(index.events, period);
    const email = formatAbReportEmail(summary);
    const delivery = await sendReportEmail(email.subject, email.text);

    return NextResponse.json({ ok: true, summary, delivery });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "A/B report failed" },
      { status: 500 }
    );
  }
}
