import { ourLine, rivalLine } from './evidence.mjs';

// From leadership's Oct 12 note (no age data in our systems).
export const AVATAR = `Our buyers are boutique owners, many in small Southern towns, whose own customer is now mostly 40s-50s women. Plus-size buyers matter. They buy what feels warm, positive, faith-friendly and easy to wear to church, the school pickup or brunch.`;

// The spec's anti-goals, verbatim where they apply to wording.
export const RULES = [
  'English only.',
  'Winners are 1-3 short, positive words per line (DREAM FREE, LOVE, Walk By Faith). No clever, slangy or long phrases.',
  'At most 3 main lines, each at most 24 characters.',
  'Ideas without evidence, or evidence that is invented, are failures. Every number must come from the tables below.',
  'For "evidence", copy one line from the EVIDENCE list below exactly, or write the word untested.',
];

export function ideasPrompt(ev, job) {
  const ours = ev.ours.map(o => `- ${ourLine(o)} — ${o.name}`).join('\n') || '- (no sales rows)';
  const rivals = ev.rivals.map(r => `- ${r.bestseller ? rivalLine(r) : 'Competitor item (' + r.brand + ')'} — "${r.title}", seen ${r.days_seen} days`).join('\n') || '- (no rival rows)';
  return `You are helping Davi & Dani, a wholesale women's fashion brand, replace wording on a garment.
The attached photo is the garment. Look at its current wording, the lettering technique, the layout (main line(s), any small line above or below) and the garment type.
${job.style ? `Style number: ${job.style}.\n` : ''}${job.note ? `Note from the designer: ${job.note}\n` : ''}
WHO BUYS IT
${AVATAR}

RULES
${RULES.map(r => '- ' + r).join('\n')}

OUR FAIRE SALES (graphic and text tops, units and stores)
${ours}

COMPETITOR SHOPS ON FAIRE (last 60 days)
${rivals}

EVIDENCE (the only strings allowed in "evidence")
${[...ev.ours.map(ourLine), ...ev.rivals.filter(r => r.bestseller).map(rivalLine)].map(l => '- ' + l).join('\n') || '- (none)'}

Write 8 wording ideas that fit the same layout as the photo and would sell to these buyers. Lean on what is proven above.
"main" = the big line(s); "small_top"/"small_bottom" = the small lines if the layout has them (else omit); "why" = one short sentence on why it fits our customer.
Return JSON only: {"ideas":[{"main":["..",".."],"small_top":"..","small_bottom":"..","evidence":"..","why":".."}]} with 8 ideas.`;
}
