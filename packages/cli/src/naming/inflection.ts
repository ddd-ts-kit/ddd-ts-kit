/**
 * What the endings of an English word do not say of its number, read both ways by `plural` and
 * `singular` so that each undoes the other: `statuses` gives back `status`, never `statuse`.
 */
export const INFLECTION = {
  /** The words that are the same in both numbers, or name a mass: no plural to write, no singular to read. */
  sameInBothNumbers: new Set('news series species data metadata analytics statistics logistics economics'.split(' ')),

  /** The words a table is named after as they are, plural already (`reader_settings`). */
  alreadyPlural: new Set(['settings', 'preferences']),

  /** The words whose plural is not the one of their ending, each with it. */
  irregular: new Map([
    ['quiz', 'quizzes'],
    ['menu', 'menus'],
    ['analysis', 'analyses'],
    ['crisis', 'crises'],
    ['thesis', 'theses'],
    ['diagnosis', 'diagnoses'],
    ['hypothesis', 'hypotheses'],
    ['synopsis', 'synopses'],
  ]),

  /** The words that name one thing and end in one `s`: their plural takes `es`, and `houses` is not one of theirs. */
  singularInS: new Set(
    'alias atlas bias bonus bus campus canvas census chorus consensus corpus focus gas lens plus status surplus virus'.split(
      ' ',
    ),
  ),
} as const;
