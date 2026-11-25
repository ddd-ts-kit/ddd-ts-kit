import { INFLECTION } from './inflection';

/**
 * The singular of a plural English word (`reminders`, `deliveries`, `boxes`, `statuses`), or
 * undefined when the word has no other form to give: it names one thing (`status`, `address`), or
 * is the same in both numbers (`series`). What `plural` makes of a word, this gives back.
 */
export function singular(word: string): string | undefined {
  const irregular = [...INFLECTION.irregular].find(([, several]) => several === word)?.[0];

  if (irregular !== undefined || namesOneThing(word)) {
    return irregular;
  }

  if (/[^aeiou]ies$/.test(word)) {
    return `${word.slice(0, -3)}y`;
  }

  if (/(?:ss|x|z|ch|sh)es$/.test(word) || INFLECTION.singularInS.has(word.slice(0, -2))) {
    return word.slice(0, -2);
  }

  return /[^su]s$/.test(word) ? word.slice(0, -1) : undefined;
}

/** A word the table knows as having no singular to read: it names one thing though it ends in `s`, or is the same in both numbers. */
function namesOneThing(word: string): boolean {
  return INFLECTION.singularInS.has(word) || INFLECTION.irregular.has(word) || INFLECTION.sameInBothNumbers.has(word);
}
