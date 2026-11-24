import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PEOPLE, personOf, groupByPerson, personForStyle } from './people';

describe('person library', () => {
  it('lists the house people with portraits that exist', () => {
    expect(PEOPLE.map(p => p.id)).toEqual(['vision', 'celine']);
    for (const p of PEOPLE) expect(fs.existsSync(path.join(__dirname, '../public', p.portrait))).toBe(true);
  });
  it('reads the character tag first, then the set name', () => {
    expect(personOf({ id: 'studio 98', character: 'celine' })).toBe('celine');
    expect(personOf({ id: 'u1', name: 'VISION 5', userAdded: true })).toBe('vision');
    expect(personOf({ id: 'u2', name: 'Draft · Jeonga · Celine linen set' })).toBe('celine');
    expect(personOf({ id: 'pants-dp62024', name: 'DP62024 pants' })).toBe('');
    expect(personOf({ id: 'x', character: 'nobody', name: 'Celine 3' })).toBe('celine');
  });
  it('groups by person and keeps unknown sets under other', () => {
    const g = groupByPerson([{ id: 'a', character: 'vision' }, { id: 'b', name: 'Celine 1' }, { id: 'c', name: 'pants' }]);
    expect(g.map(x => x.person?.id ?? 'other')).toEqual(['vision', 'celine', 'other']);
    expect(groupByPerson([{ id: 'a', character: 'vision' }]).map(x => x.person?.id)).toEqual(['vision']);
  });
  it('keeps one person per colour gallery', () => {
    expect(personForStyle(['celine', 'vision', 'celine', ''])).toBe('celine');
    expect(personForStyle([])).toBe('');
  });
});
