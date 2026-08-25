/**
 * What to tell someone after a batch run.
 *
 * WHY THIS EXISTS AS LOGIC
 * ------------------------
 * The old summary only appeared when something failed. Batch now reads a style
 * number per image out of the upload's filename, and two things can go quietly
 * sideways without a single failure:
 *
 *  1. A filename carries no style code, so that row ran on the photo alone —
 *     the weaker path, and invisible unless it is said out loud.
 *  2. A filename's style code disagreed with the ERP. Because a filename is
 *     inferred rather than asserted, the ERP wins and the code is demoted. That
 *     is the right default and the wrong thing to do silently: DWTS67099 is
 *     exactly the case where the code is right and the ERP is wrong.
 *
 * A run where everything matched and nothing conflicted says nothing at all.
 * Silence has to mean "clean", or the summary becomes noise people stop
 * reading.
 */

export interface BatchOutcome {
  total: number;
  failures: { error: string }[];
  /** How many queued images had a style number in their filename. */
  matched: number;
  /** Rows where the filename's code lost to the ERP. */
  conflicts: { filename: string; wanted: string; kept: string }[];
}

const MAX_LISTED = 3;

function more(n: number): string {
  return n > MAX_LISTED ? `\n• …and ${n - MAX_LISTED} more` : "";
}

/**
 * Returns the summary text, or null when there is genuinely nothing to say.
 * Sections are ordered by how much they need acting on: failures, then
 * disagreements a person should check, then the quiet note about rows that ran
 * without a style number.
 */
export function buildBatchSummary(o: BatchOutcome): string | null {
  const parts: string[] = [];
  const succeeded = o.total - o.failures.length;

  if (o.failures.length > 0) {
    const list = o.failures
      .slice(0, MAX_LISTED)
      .map((f, i) => `• image ${i + 1}: ${f.error}`)
      .join("\n");
    parts.push(
      `Batch finished — ${succeeded} of ${o.total} succeeded. ` +
        `${o.failures.length} failed:\n${list}${more(o.failures.length)}`
    );
  }

  if (o.conflicts.length > 0) {
    const list = o.conflicts
      .slice(0, MAX_LISTED)
      .map((c) => `• ${c.filename}: code says ${c.wanted}, ERP says ${c.kept} — used ${c.kept}`)
      .join("\n");
    parts.push(
      `${o.conflicts.length} ${o.conflicts.length === 1 ? "file" : "files"} disagreed with the ` +
        `ERP. A style number read from a filename does not overrule the ERP, so these used the ` +
        `ERP's category. Worth a look:\n${list}${more(o.conflicts.length)}`
    );
  }

  const unmatched = o.total - o.matched;
  if (unmatched > 0) {
    parts.push(
      `${unmatched} of ${o.total} ${o.total === 1 ? "file" : "files"} ` +
        `${unmatched === 1 ? "has" : "have"} no style number ` +
        `in the filename, so ${unmatched === 1 ? "it was" : "they were"} read from the photo ` +
        `alone. Rename ${unmatched === 1 ? "it" : "them"} to start with the style code to use ` +
        `the ERP gallery.`
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}
