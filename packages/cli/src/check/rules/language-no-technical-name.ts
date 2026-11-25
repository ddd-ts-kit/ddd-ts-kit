import { glossariesOf } from '../language/glossaries-of';
import { technicalWordsOf } from '../language/technical-words-of';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { inContext } from '../support/in-context';

const DECLARATION = /(?<![\w$.])(?:class|interface|enum|type)\s+([A-Za-z_$][\w$]*)/g;

export const languageNoTechnicalName: FileRule = {
  id: 'language/no-technical-name',
  description:
    'No Manager, Helper, Util, Data, Info, Processor, Wrapper, Impl, Base, Abstract, Dto, Entity or Model in a name under domain/ or in a use case name, unless a term of the Ubiquitous language table of the CONTEXT.md of its context holds the word (Scoring model holds ScoringModel).',
  severity: 'error',
  doc: {
    why: 'Manager, Helper, Data or Impl say how a class is built, not what it means. In the domain such a name marks a concept that was not discussed: the behaviour ends up in a bag that keeps growing. A domain expert never says "invoice manager". The ubiquitous language wins, though: when the business does name a concept with such a word (the scoring model of credit risk, the copy of data of the right of access), its term in the glossary of the context holds the word, and `ScoringModel` stands once `Scoring model` is a row of CONTEXT.md. Without that row the name is refused.',
    bad: `export class InvoiceManager {}`,
    good: `export class InvoiceNumbering {}`,
  },
  scope: 'file',
  judge(file, project) {
    if (!inContext(file.location) || !namesTheModel(file)) {
      return [];
    }

    const glossaries = glossariesOf(project);
    const glossary = glossaries.of(file.location.context);
    const doc = glossaries.docOf(file.location.context);

    return [...file.scan.code.matchAll(DECLARATION)].flatMap((match) => {
      const name = match[1] ?? '';
      const technical = technicalWordsOf(name, glossary);

      if (technical.length === 0) {
        return [];
      }

      return [
        {
          line: file.scan.lineAt(match.index),
          message: `${name} carries the technical word "${technical.join('", "')}".`,
          fix: `Name it with the noun or verb a domain expert uses for it; a technical suffix hides a concept that has no name yet. If the business does use the word in this name, define that term in the "## Ubiquitous language" table of ${doc} and the name stands.`,
        },
      ];
    });
  },
};

function namesTheModel(file: SourceFile): boolean {
  if (!inContext(file.location) || file.isTest) {
    return false;
  }

  const { layer, inside } = file.location;

  return layer === 'domain' || (layer === 'application' && (inside[0] === 'commands' || inside[0] === 'queries'));
}
