import { describe, expect, it } from 'vitest';
import { plural, singular } from '../src/naming';

const PAIRS: readonly (readonly [string, string])[] = [
  ['invoice', 'invoices'],
  ['delivery', 'deliveries'],
  ['key', 'keys'],
  ['box', 'boxes'],
  ['batch', 'batches'],
  ['wish', 'wishes'],
  ['address', 'addresses'],
  ['waltz', 'waltzes'],
  ['house', 'houses'],
  ['warehouse', 'warehouses'],
  ['case', 'cases'],
  ['database', 'databases'],
  ['purchase', 'purchases'],
  ['status', 'statuses'],
  ['bus', 'buses'],
  ['bonus', 'bonuses'],
  ['gas', 'gases'],
  ['alias', 'aliases'],
  ['campus', 'campuses'],
  ['quiz', 'quizzes'],
  ['analysis', 'analyses'],
  ['diagnosis', 'diagnoses'],
  ['menu', 'menus'],
];

const SAME_IN_BOTH = ['series', 'species', 'news', 'data', 'analytics'];

describe('the plural and the singular of a word', () => {
  it.each(PAIRS)('are each the other way of the other: %s, %s', (one, several) => {
    expect(plural(one)).toBe(several);
    expect(singular(several)).toBe(one);
  });

  it.each(SAME_IN_BOTH)(
    'are the word itself when it is the same in both numbers, which has no singular to read: %s',
    (word) => {
      expect(plural(word)).toBe(word);
      expect(singular(word)).toBeUndefined();
    },
  );

  it('name a table after a word that is plural already, and still read its singular', () => {
    expect(plural('settings')).toBe('settings');
    expect(singular('settings')).toBe('setting');
    expect(singular('preferences')).toBe('preference');
  });

  it('read no plural in a word that names one thing and ends in s', () => {
    for (const word of ['status', 'bus', 'gas', 'analysis', 'address', 'quiz', 'invoice']) {
      expect(singular(word), word).toBeUndefined();
    }
  });
});
