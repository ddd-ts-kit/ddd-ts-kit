import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { JUDGED_ONLY_WHEN_ON } from '../privacy/judged-only-when-on';
import { personalDeclarationsOf } from '../privacy/personal-declarations-of';
import { privacyJudged } from '../privacy/privacy-judged';
import { personalTermOf } from '../privacy/personal-term-of';
import { publishedEventsOf } from '../privacy/published-events-of';
import { sameName } from '../privacy/same-name';
import { vocabularyOf } from '../privacy/vocabulary-of';
import { wordsOfName } from '../privacy/words-of-name';
import { reporter } from '../support/reporter';
import { callArguments } from '../text/call-arguments';

/** A call to the logger or to the metrics: `logger.info(`, `this.log.warn(`, `metrics.increment(`. */
const CALL =
  /(?<![\w$])(?:this\.)?(?:logger|log|metrics)\s*\.\s*(?:trace|debug|info|warn|error|fatal|child|increment|gauge|histogram|count|record|observe)\s*\(/g;

const NAME = /[A-Za-z_$][\w$]*/g;

/**
 * A call to the logger or to the metrics names no field a declaration says is personal data: what
 * a log keeps is copied, shipped and read far from the erasure, which never reaches it. An
 * approximation at the level of the text: a name of the arguments of the call (an identifier, a
 * property, a key) compared with the personal fields of the `personalFields` declarations and of
 * the `personal` option of the integration events, in the files of the contexts and of the
 * platform; a field of one word outside the vocabulary (`name`) is left out, too common to judge.
 * Silent with `stack.privacy` off, and without a declaration.
 */
export const privacyNoPersonalDataInLogs: Rule = {
  id: 'privacy/no-personal-data-in-logs',
  description:
    'A call to the logger or to the metrics names no field a personalFields declaration or the personal option of an integration event says is personal data.',
  severity: 'warn',
  doc: {
    why: `A log line is copied, shipped, indexed and kept for months by systems the erasure never reaches, and read by people the person never dealt with; a metric with a label per person does the same. The opaque id of the person is enough to follow a request. An approximation at the level of the text: a name among the arguments of a call to the logger or to the metrics (logger.info(...), this.log.warn(...), metrics.increment(...)), an identifier, a property or a key, compared with the personal fields of the personalFields declarations and of the personal option of the integration events, in the files of the contexts and of the platform. A declared field of one word outside the vocabulary (name, label) is left out, too common to judge; a value reached through a variable of another name is not seen. Silent without a declaration. ${JUDGED_ONLY_WHEN_ON}`,
    bad: `this.logger.info('invoice sent', { invoiceId: invoice.id, customerEmail: invoice.customerEmail });`,
    good: `this.logger.info('invoice sent', { invoiceId: invoice.id, customerId: invoice.customerId });`,
  },
  scope: 'project',
  run(project) {
    if (!privacyJudged(project)) {
      return [];
    }

    const vocabulary = vocabularyOf(project.config);

    const personal = [
      ...personalDeclarationsOf(project).flatMap(({ fields, files }) => [...fields, ...files]),
      ...publishedEventsOf(project).flatMap(({ personal: declared }) =>
        (declared?.fields ?? []).map((path) => path.split('.').at(-1)?.replace('[]', '') ?? path),
      ),
    ].filter((field) => wordsOfName(field).length > 1 || personalTermOf(field, vocabulary) !== undefined);

    if (personal.length === 0) {
      return [];
    }

    const report = reporter(project, this.id);

    return project.files
      .filter((file) => !file.isTest && (file.location.area === 'context' || file.location.area === 'platform'))
      .flatMap((file) =>
        loggedIn(file, personal).map(({ line, name }) =>
          report(
            { file: file.path, line },
            `This call to the logger or the metrics names ${name}, which a declaration says is personal data: a log is copied, shipped and kept where the erasure of the person never reaches.`,
            'Log the opaque identifier of the person instead (the id of the aggregate, `customerId`), never the address, the number or the name; a value needed to debug is masked before it is logged. A name that holds nothing of a person here is recorded: `// ddd-ts-kit-disable-next-line privacy/no-personal-data-in-logs -- ADR-NNNN: <why>`.',
          ),
        ),
      );
  },
};

function loggedIn(file: SourceFile, personal: readonly string[]): { readonly line: number; readonly name: string }[] {
  const { code } = file.scan;

  return [...code.matchAll(CALL)].flatMap((call) => {
    const open = call.index + call[0].length - 1;

    const written = callArguments(code, open)
      .map((argument) => argument.code)
      .join(',');

    const name = [...written.matchAll(NAME)]
      .map((match) => match[0])
      .find((found) => personal.some((field) => sameName(field, found)));

    return name === undefined ? [] : [{ line: file.scan.lineAt(call.index), name }];
  });
}
