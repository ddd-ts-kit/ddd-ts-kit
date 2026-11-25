import { buildsThroughFactories } from '../errors/builds-through-factories';
import { codeListName } from '../errors/code-list-name';
import type { CodeReference } from '../errors/code-reference';
import { codeReferences } from '../errors/code-references';
import { codesSetIn } from '../errors/codes-set-in';
import { KIT_CODE_KEYS } from '../errors/kit-code-keys';
import { KIT_CODES_LIST } from '../errors/kit-codes-list';
import { KIT_ERROR_CODES } from '../errors/kit-error-codes';
import { readCodeList } from '../errors/read-code-list';
import { namesRefusals } from '../errors/names-refusals';
import type { Finding } from '../model/finding';
import type { Project } from '../model/project';
import type { Rule } from '../model/rule';
import type { SourceFile } from '../model/source-file';
import { perFile } from '../support/per-file';
import { matchingBracket } from '../text/matching-bracket';

const ERRORS_LIST = /(?<![\w$.])errors\s*:\s*\[/g;
const UNKEPT = 'A code declared and never raised is a promise the contract makes for nothing.';
const SHARED_KERNEL = 'shared-kernel';

/** A code list by its name: what each of its keys names, undefined for a key whose value is not one string literal. */
type CodeLists = ReadonlyMap<string, ReadonlyMap<string, string | undefined>>;

interface Judged {
  readonly context: string;
  readonly named: boolean;
  readonly lists: CodeLists;
  exists(code: string): boolean;
}

export const errorsKnownCode: Rule = {
  id: 'errors/known-code',
  description:
    'Under "stack.refusals": "factories" or "named", every code a route or a controller declares in `errors`, as a string or as a member of a code list (`BillingCodes.UnknownInvoice`, `KitCodes.Forbidden`), exists: a factory or an error class of its context sets it, or the <context>.codes.ts of its context lists it, a class outside the contexts does, or it is a code of the kit.',
  severity: 'error',
  doc: {
    why: 'The `errors` list of a route is what the OpenAPI document promises: one problem response per status of the codes it names. A code written there that no refusal sets, misspelled or left behind by a renamed factory, is a response the contract documents and the API never gives, while the refusal really raised is missing from it. A code is written as a string or as a member of a code list, `SchedulingCodes.SlotTaken` or `KitCodes.Forbidden` of @ddd-ts-kit/kernel, which the compiler checks too; a key the list does not hold is reported, and so is a list that is neither that of a context, of the shared kernel nor of the kit. A code exists when a factory or an error class of the context of the route sets it, when the <context>.codes.ts of that context lists it (under "stack.refusals": "named"), when a class outside the contexts (the platform, the shared kernel) does, or when it is a code of the kit: VALIDATION_FAILED, NOT_FOUND, CONFLICT, INVARIANT_VIOLATION, UNAUTHORIZED, FORBIDDEN, NOT_ACCEPTABLE, CONCURRENCY_CONFLICT, INVALID_CRITERIA, INVALID_PAGE_REQUEST, TIMEOUT, CIRCUIT_OPEN, BULKHEAD_FULL, ATTEMPTS_EXHAUSTED, SERVICE_UNAVAILABLE (a unit of work the database could not serve in time), the conditions of a write: PRECONDITION_FAILED, PRECONDITION_REQUIRED, and the refusals of a file: FILE_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, FILE_NOT_FOUND, FILE_REJECTED, INVALID_FILE_KEY. A code another context sets does not count: a context answers with its own language. Judged under "stack.refusals": "factories" and "named".',
    bad: `// domain/errors/appointment.error.ts sets 'SLOT_TAKEN'
defineRoute({ method: 'POST', path: '/appointments', errors: ['FORBIDDEN', 'SLOT_ALREADY_TAKEN'], security: ['bearer'] }, book);`,
    good: `defineRoute({ method: 'POST', path: '/appointments', errors: ['FORBIDDEN', 'SLOT_TAKEN'], security: ['bearer'] }, book);

// or, under "stack.refusals": "named", by the members of the code lists
defineRoute({ method: 'POST', path: '/appointments', errors: [KitCodes.Forbidden, SchedulingCodes.SlotTaken], security: ['bearer'] }, book);`,
  },
  scope: 'project',
  run(project) {
    if (!buildsThroughFactories(project)) {
      return [];
    }

    const known = knownCodes(project);
    const named = namesRefusals(project);
    const lists = codeLists(project);

    return perFile(project, this.id, (file) => (isRouteFile(file) ? unknownCodes(file, { known, named, lists }) : []));
  },
};

interface Read {
  readonly known: Map<string, Set<string>>;
  readonly named: boolean;
  readonly lists: CodeLists;
}

/** The code list of each context and of the shared kernel, and that of the kit, by the name a route writes. */
function codeLists(project: Project): CodeLists {
  const lists = new Map<string, ReadonlyMap<string, string | undefined>>([[KIT_CODES_LIST, KIT_CODE_KEYS]]);

  for (const file of project.files.filter((candidate) => !candidate.isTest && candidate.path.endsWith('codes.ts'))) {
    const owner = listOwner(file);
    const list = owner === undefined ? undefined : readCodeList(file.scan, codeListName(owner));

    if (list !== undefined) {
      lists.set(list.name, new Map(list.entries.map(({ key, code }) => [key, code])));
    }
  }

  return lists;
}

function listOwner({ location }: SourceFile): string | undefined {
  if (location.area === 'context') {
    return location.context;
  }

  return location.area === SHARED_KERNEL ? SHARED_KERNEL : undefined;
}

/** The codes set outside the contexts (platform, shared kernel) under the key `*`, and those of each context, its code list included, under its name. */
function knownCodes(project: Project): Map<string, Set<string>> {
  const known = new Map<string, Set<string>>([['*', new Set(KIT_ERROR_CODES)]]);

  for (const file of project.files.filter((candidate) => !candidate.isTest)) {
    const owner = file.location.area === 'context' ? file.location.context : '*';
    const codes = known.get(owner) ?? new Set<string>();

    for (const { code } of codesSetIn(file)) {
      codes.add(code);
    }

    known.set(owner, codes);
  }

  return known;
}

function isRouteFile(file: SourceFile): boolean {
  return !file.isTest && /\.(?:route|controller)\.ts$/.test(file.path);
}

function unknownCodes(file: SourceFile, { known, named, lists }: Read): Finding[] {
  const { scan, location } = file;
  const context = location.area === 'context' ? location.context : '*';

  const exists = (code: string): boolean =>
    known.get('*')?.has(code) === true || known.get(context)?.has(code) === true;

  const judged = { context, named, lists, exists };

  return [...scan.code.matchAll(ERRORS_LIST)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const close = matchingBracket(scan.code, open);

    const written = scan.strings
      .filter((literal) => literal.start > open && literal.end <= close && !exists(literal.value))
      .map((literal) => ({ line: scan.lineAt(literal.start), ...unsetCode(literal.value, judged) }));

    const referred = codeReferences(scan.code, open, close).flatMap((reference) => {
      const refused = refusedReference(reference, judged);

      return refused === undefined ? [] : [{ line: scan.lineAt(reference.start), ...refused }];
    });

    return [...written, ...referred].sort((a, b) => a.line - b.line);
  });
}

type Refused = Pick<Finding, 'message' | 'fix'>;

function unsetCode(code: string, { context, named }: Judged): Refused {
  return {
    message: `The route declares the error code "${code}", which no refusal ${context === '*' ? 'of the project' : `of the context "${context}"`} sets.`,
    fix: named ? namedFix(context) : factoriesFix(context),
  };
}

/** What is wrong with a code named by a member of a list: a list the check cannot read, a key it does not hold, or a code of another context. */
function refusedReference({ list, key }: CodeReference, judged: Judged): Refused | undefined {
  const entries = judged.lists.get(list);

  if (entries === undefined) {
    return {
      message: `The route declares \`${list}.${key}\`, and ${list} is not a code list the check reads.`,
      fix: `Name the code through the code list of its context (<context>.codes.ts), of the shared kernel, or through ${KIT_CODES_LIST} of @ddd-ts-kit/kernel; or write it as a string. ${UNKEPT}`,
    };
  }

  const code = entries.get(key);

  if (code === undefined) {
    return {
      message: `The route declares \`${list}.${key}\`, which names no code of ${list}.`,
      fix: judged.named ? namedFix(judged.context) : factoriesFix(judged.context),
    };
  }

  return judged.exists(code) ? undefined : unsetCode(code, judged);
}

function factoriesFix(context: string): string {
  return `Write the code as its factory sets it, or add the refusal: \`ddd-ts-kit generate error ${context === '*' ? '<context>' : context} <Concept> <refusal>\`. ${UNKEPT}`;
}

function namedFix(context: string): string {
  const owner = context === '*' ? 'its context' : `"${context}"`;

  return `Write the code as the code list of ${owner} (<context>.codes.ts) lists it, or add the refusal: \`ddd-ts-kit generate error ${context === '*' ? '<context>' : context} <Refusal> <factory>\`, for example \`generate error banking InsufficientFunds forAccountId\`. ${UNKEPT}`;
}
