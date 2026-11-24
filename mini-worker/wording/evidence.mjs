// Evidence for wording ideas: our own Faire sales (Journey Postgres mirror, never the ERP) and
// competitor shop items from the daily Faire rival tracker. Every number an idea may cite comes from here.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WORDING = /\b(graphic|lettering|slogan|faith|love)\b/i;

const OURS_SQL = `
with g as (select distinct on (style) style, name from agent_catalog
           where brand_id = 7 and name ilike '%graphic%' and coalesce(category, '') in ('TOP', ''))
select g.style, g.name,
       coalesce(sum(l.qty) filter (where o.channel = 'faire'), 0)::int as faire_units,
       count(distinct o.customer_id) filter (where o.channel = 'faire')::int as faire_stores
from g join order_lines l on l.style = g.style and l.brand_id = 7 and l.status in ('01','02','OPEN','INVOICED')
join orders o on o.id = l.order_id
group by 1, 2 having coalesce(sum(l.qty) filter (where o.channel = 'faire'), 0) > 0
order by 3 desc limit 25`;

async function ours(pgUrl) {
  if (!pgUrl) return [];
  const { stdout } = await run('psql', [pgUrl, '-At', '-v', 'ON_ERROR_STOP=1', '-c', `select coalesce(json_agg(t), '[]') from (${OURS_SQL}) t`], { timeout: 60000, maxBuffer: 8 << 20 });
  return JSON.parse(stdout.trim() || '[]');
}

async function rivals(trackerDb, days) {
  if (!trackerDb) return [];
  let names = {};
  try { names = JSON.parse(await readFile(join(dirname(trackerDb), 'competitors.json'), 'utf8')).brands || {}; } catch { /* names fall back to ids */ }
  const sql = `select c.brand, o.title, max(coalesce(o.bestseller, 0)) as bestseller, count(distinct substr(c.observed_at, 1, 10)) as days_seen
    from observations o join captures c on c.id = o.capture_id
    where c.observed_at >= datetime('now', '-${Number(days) | 0} days')
    group by c.brand, o.title`;
  const { stdout } = await run('sqlite3', ['-readonly', '-json', trackerDb, sql], { timeout: 60000, maxBuffer: 32 << 20 });
  const rows = JSON.parse(stdout.trim() || '[]');
  return rows
    .map(r => ({ brand: names[r.brand]?.name || r.brand, title: r.title, bestseller: Number(r.bestseller) === 1, days_seen: Number(r.days_seen) }))
    .filter(r => WORDING.test(r.title) && !/davi\W*(and\W*|&\W*)?dani/i.test(r.brand))
    .sort((a, b) => Number(b.bestseller) - Number(a.bestseller) || b.days_seen - a.days_seen)
    .slice(0, 40);
}

export async function gatherEvidence({ pgUrl, trackerDb, days = 60 } = {}) {
  const [o, r] = await Promise.all([ours(pgUrl), rivals(trackerDb, days)]);
  return { ours: o, rivals: r };
}

export const ourLine = (o) => `${o.faire_units} units · ${o.faire_stores} stores (${o.style})`;
export const rivalLine = (r) => `Competitor Bestseller (${r.brand})`;

/** The only evidence strings an idea may cite. */
export function evidenceLines(ev) {
  return new Set([...ev.ours.map(ourLine), ...ev.rivals.filter(r => r.bestseller).map(rivalLine)]);
}
