// @vitest-environment node
import { it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatherEvidence, evidenceLines } from './evidence.mjs';

let db;
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-ev-'));
  db = join(dir, 'design_research.sqlite3');
  const now = new Date().toISOString();
  execFileSync('sqlite3', [db, `
    CREATE TABLE captures (id TEXT PRIMARY KEY, brand TEXT NOT NULL, observed_at TEXT NOT NULL, source_url TEXT NOT NULL, source_kind TEXT NOT NULL, account TEXT, coverage TEXT NOT NULL, outcome TEXT NOT NULL, error TEXT);
    CREATE TABLE observations (capture_id TEXT NOT NULL, product_id TEXT NOT NULL, variant TEXT NOT NULL, title TEXT NOT NULL, price TEXT, image TEXT, availability TEXT NOT NULL, bestseller INTEGER, evidence TEXT NOT NULL, PRIMARY KEY(capture_id, product_id, variant));
    INSERT INTO captures VALUES ('c1','b_rival','${now}','u','k',NULL,'full','ok',NULL),('c2','b_dd','${now}','u','k',NULL,'full','ok',NULL),('c0','b_rival','2020-01-01T00:00:00Z','u','k',NULL,'full','ok',NULL);
    INSERT INTO observations VALUES ('c1','p1','v','Walk By Faith Graphic Tee','','','in',1,'e'),('c1','p2','v','Ribbed Knit Cardigan','','','in',1,'e'),('c1','p5','v','Rolled Neck Pullover Top','','','in',1,'e'),('c2','p3','v','Dream Free Graphic Tee','','','in',1,'e'),('c0','p4','v','Old Love Graphic Tee','','','in',1,'e');
  `]);
  writeFileSync(join(dir, 'competitors.json'), JSON.stringify({ brands: { b_rival: { name: 'Rival Shop' }, b_dd: { name: 'Davi & Dani' } } }));
});

it('rivals excludes Davi & Dani and non-wording titles', async () => {
  const ev = await gatherEvidence({ trackerDb: db, days: 60 });
  expect(ev.ours).toEqual([]);
  expect(ev.rivals).toEqual([{ brand: 'Rival Shop', title: 'Walk By Faith Graphic Tee', bestseller: true, days_seen: 1 }]);
});

it('evidenceLines formats "780 units · 103 stores (DT62115)"', () => {
  const s = evidenceLines({ ours: [{ style: 'DT62115', name: 'Dream Free Graphic Tee', faire_units: 780, faire_stores: 103 }], rivals: [{ brand: 'Rival Shop', title: 't', bestseller: true, days_seen: 3 }, { brand: 'Quiet Shop', title: 't', bestseller: false, days_seen: 1 }] });
  expect(s.has('780 units · 103 stores (DT62115)')).toBe(true);
  expect(s.has('Competitor Bestseller (Rival Shop)')).toBe(true);
  expect(s.has('Competitor Bestseller (Quiet Shop)')).toBe(false);
});
