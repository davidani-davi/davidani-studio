import peopleFile from '../public/models/people.json';

/** A person who wears the clothes (Vision, Celine). Plates and recast sets are shoots OF a person. */
export interface Person { id: string; name: string; portrait: string; about?: string }
export const PEOPLE: Person[] = (peopleFile as { people: Person[] }).people;

interface ModelLike { id: string; name?: string; character?: string; userAdded?: boolean }

const DRAFT = /^draft\s*·\s*[^·]+·\s*/i;

/** Which person a plate or set shows: its character tag first, else a set named after the person
 *  ("Celine 2", "VISION 5", "Draft · Jeonga · Celine linen"). '' when it shows nobody we know. */
export function personOf(model: ModelLike, people: Person[] = PEOPLE): string {
  const tag = String(model.character || '').toLowerCase();
  if (tag && people.some(p => p.id === tag)) return tag;
  const name = String(model.name || model.id || '').replace(DRAFT, '');
  const hit = people.find(p => new RegExp(`^${p.name}\\b`, 'i').test(name));
  return hit ? hit.id : '';
}

/** People in library order, each with the plates and sets that show them; the rest under 'other'. */
export function groupByPerson<T extends ModelLike>(models: T[], people: Person[] = PEOPLE): { person: Person | null; models: T[] }[] {
  const groups = people.map(person => ({ person, models: models.filter(m => personOf(m, people) === person.id) }));
  const other = models.filter(m => !personOf(m, people));
  return [...groups.filter(g => g.models.length), ...(other.length ? [{ person: null, models: other }] : [])];
}

/** One person per colour gallery (David): a style's other colours already shot on a person pick that person
 *  for the next colour. The most-used person wins; '' when nothing was shot yet. */
export function personForStyle(shotPersons: string[]): string {
  const count = new Map<string, number>();
  for (const p of shotPersons) if (p) count.set(p, (count.get(p) || 0) + 1);
  let best = '', n = 0;
  for (const [p, c] of count) if (c > n) { best = p; n = c; }
  return best;
}
