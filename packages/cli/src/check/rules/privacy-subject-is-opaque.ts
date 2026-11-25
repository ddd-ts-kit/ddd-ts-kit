import type { Project } from '../model/project';
import type { ProjectRule } from '../model/rule';
import { JUDGED_ONLY_WHEN_ON } from '../privacy/judged-only-when-on';
import { personalDeclarationsOf } from '../privacy/personal-declarations-of';
import { personalTermOf } from '../privacy/personal-term-of';
import { privacyJudged } from '../privacy/privacy-judged';
import { publishedEventsOf } from '../privacy/published-events-of';
import { sameName } from '../privacy/same-name';
import { vocabularyOf } from '../privacy/vocabulary-of';
import { reporter } from '../support/reporter';

const FIX =
  'Name the person by an opaque identifier that says nothing of them (the id of the aggregate, a `customer_id`), and keep the address, the number or the name among the personal fields: an erasure leaves the subject in place, so a subject that is personal data survives the erasure of the person.';

/**
 * The subject of a `personalFields` declaration, and of the `personal` option of an integration
 * event, is an opaque identifier: never a word of the personal vocabulary (an email as the key of
 * a person), never one of the personal fields. The kernel refuses a subject listed among the
 * fields at start-up; the rule says it, and the vocabulary, before. Silent with `stack.privacy` off.
 */
export const privacySubjectIsOpaque: ProjectRule = {
  id: 'privacy/subject-is-opaque',
  description:
    'The subject of a personalFields declaration or of the personal option of an integration event is an opaque identifier, never personal data itself.',
  severity: 'warn',
  doc: {
    why: `The subject names the person whose data a declaration or an event holds: the erasure looks the rows up by it and leaves it in place, the export and the audit trail name the person by it, the event store keys its cipher by it. An identifier that is itself personal data (an email, a phone number) survives the erasure of the person and is copied everywhere the person is named. Judged on the subject of every personalFields call of a context and of the personal option of every integration event: neither a word of the vocabulary nor one of the personal fields (the kernel refuses the second at start-up). ${JUDGED_ONLY_WHEN_ON}`,
    bad: `personalFields(TABLE, { subject: 'email', fields: ['display_name'], erasure: 'row' });`,
    good: `personalFields(TABLE, { subject: 'person_id', fields: ['email', 'display_name'], erasure: 'row' });`,
  },
  scope: 'project',
  judge(project) {
    if (!privacyJudged(project)) {
      return [];
    }

    const vocabulary = vocabularyOf(project.config);
    const report = reporter(project, this.id);

    const subjects = subjectsOf(project);

    return subjects.flatMap(({ file, line, subject, fields, of }) => {
      const term = personalTermOf(subject, vocabulary);
      const listed = fields.some((field) => sameName(field, subject));

      if (term === undefined && !listed) {
        return [];
      }

      return [
        report(
          { file, line },
          `The subject ${subject} of ${of} is itself personal data (${term ?? 'one of its personal fields'}): it cannot name the person whose data the erasure removes.`,
          FIX,
        ),
      ];
    });
  },
};

/** A subject as a declaration or an event names it, and where. */
interface Subject {
  readonly file: string;
  readonly line: number;
  readonly subject: string;
  readonly fields: readonly string[];
  readonly of: string;
}

function subjectsOf(project: Project): Subject[] {
  return [
    ...personalDeclarationsOf(project).map(({ file, line, subject, fields, table }) => ({
      file,
      line,
      subject,
      fields,
      of: `the declaration of ${table}`,
    })),
    ...publishedEventsOf(project).flatMap(({ file, line, personal, type }) =>
      personal === undefined ? [] : [{ file, line, subject: personal.subject, fields: personal.fields, of: type }],
    ),
  ];
}
