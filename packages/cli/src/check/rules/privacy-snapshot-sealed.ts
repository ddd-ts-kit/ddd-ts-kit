import type { ProjectRule } from '../model/rule';
import { JUDGED_ONLY_WHEN_ON } from '../privacy/judged-only-when-on';
import { clearSnapshotValuesIn } from '../privacy/clear-snapshot-values-in';
import { isSnapshotMapper } from '../privacy/is-snapshot-mapper';
import { personalTermOf } from '../privacy/personal-term-of';
import { privacyJudged } from '../privacy/privacy-judged';
import { vocabularyOf } from '../privacy/vocabulary-of';
import { reporter } from '../support/reporter';

const FIX =
  'Seal it as in the events: `personalData(subject, value)` in `encode`, `data.personalText(...)` or `data.personalInstant(...)` in `decode`. Then change `version`: a snapshot of another version is ignored until the next one replaces it. A name that holds nothing of a person in this project is recorded: `// ddd-ts-kit-disable-next-line privacy/snapshot-sealed -- ADR-NNNN: <why>` above it, or the word in `privacy.allow` of ddd-ts-kit.config.json.';

/**
 * A value of a snapshot named like personal data is sealed with `personalData`, as in the events:
 * an erasure destroys the key of the person, and a value in clear outlives it and is loaded back
 * with the aggregate. Read by name in `<aggregate>-snapshots.mapper.ts`, on both sides of the
 * mapper. Silent with `stack.privacy` off.
 */
export const privacySnapshotSealed: ProjectRule = {
  id: 'privacy/snapshot-sealed',
  description:
    'A value of a snapshot named like personal data is sealed with personalData, the only form an erasure reaches.',
  severity: 'warn',
  doc: {
    why: `An erasure destroys the key of the person: what \`personalData\` sealed reads as erased everywhere at once, in the events and in the snapshots. A snapshot keeps what its \`encode\` writes, and \`encode\` over the state writes the values in clear: the erasure says the person is gone, the value stays in the store of snapshots, and the next load of the aggregate reads it back. Judged: \`<aggregate>-snapshots.mapper.ts\` in \`infrastructure/persistence/\`, the properties of the file and the names \`decode\` reads, so that a mapper whose \`encode\` answers the whole state is seen. A name of the personal vocabulary (\`privacy.vocabulary\` added, \`privacy.allow\` taken away) is reported unless a \`personalData\`, a \`PersonalValue\` type or a personal reader of the file seals it. A rule reads names: a value under a name the vocabulary does not hold is not seen. ${JUDGED_ONLY_WHEN_ON}`,
    bad: `export const dossierSnapshots = {
  version: 1,
  encode: (dossier: Dossier): object => ({ email: dossier.email }),
  decode: (data: StoredEventData) => ({ email: data.text('email') }),
};`,
    good: `export const dossierSnapshots = {
  version: 2,
  encode: (dossier: Dossier): object => ({ email: personalData(dossier.patientId, dossier.email) }),
  decode: (data: StoredEventData) => ({ email: data.personalText('email') }),
};`,
  },
  scope: 'project',
  judge(project) {
    if (!privacyJudged(project)) {
      return [];
    }

    const vocabulary = vocabularyOf(project.config);
    const report = reporter(project, this.id);

    return project.files.filter(isSnapshotMapper).flatMap((file) =>
      clearSnapshotValuesIn(file).flatMap(({ name, line }) => {
        const term = personalTermOf(name, vocabulary);

        return term === undefined
          ? []
          : [
              report(
                { file: file.path, line },
                `The snapshot keeps ${name} in clear (${term}): an erasure destroys the key of the person and leaves this value, which the aggregate loads back.`,
                FIX,
              ),
            ];
      }),
    );
  },
};
