import { INFLECTION } from './inflection';

/** The plural of an English word, as the generator writes table names: `purchase_orders`, `deliveries`, `statuses`. */
export function plural(word: string): string {
  if (INFLECTION.sameInBothNumbers.has(word) || INFLECTION.alreadyPlural.has(word)) {
    return word;
  }

  const irregular = INFLECTION.irregular.get(word);

  if (irregular !== undefined) {
    return irregular;
  }

  if (/[^aeiou]y$/.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }

  return /(?:s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}
