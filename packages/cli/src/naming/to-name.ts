import { capitalize } from './capitalize';
import type { Name } from './name';
import { plural as pluralize } from './plural';
import { splitWords } from './split-words';

/**
 * A name in every casing, from any of them. Its words are those of its PascalCase form, whatever
 * the separators it was typed with: `credit 2 note` and `Credit2Note` name one file, so a later
 * command, which reads the name of the class, finds what this one wrote.
 */
export function toName(input: string): Name {
  const pascal = splitWords(input).map(capitalize).join('');
  const words = splitWords(pascal);
  const plural = [...words.slice(0, -1), pluralize(words.at(-1) ?? '')];

  return {
    pascal,
    camel: pascal.charAt(0).toLowerCase() + pascal.slice(1),
    kebab: words.join('-'),
    constant: words.join('_').toUpperCase(),
    words: words.join(' '),
    title: capitalize(words.join(' ')),
    article: /^[aeiou]/.test(words[0] ?? '') ? 'an' : 'a',
    table: plural.join('_'),
    tableCamel: plural.map((word, index) => (index === 0 ? word : capitalize(word))).join(''),
  };
}
