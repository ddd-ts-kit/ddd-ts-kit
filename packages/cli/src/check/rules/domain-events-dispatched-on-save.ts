import { dependencyLists } from '../declarations/dependency-lists';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';

const DISPATCHER = 'DomainEventDispatcher';
// A call of the function of the kernel: not a method of another object, nor a function or a method declared under that name.
const PULL = /(?<![\w$.])(?<!function\s+)takeRecordedEvents\s*\((?![^()]*\)\s*(?::[^;{=]*)?\{)/g;
const IMPORTED = /(?<![\w$.])import\b[\w\s{},*$]*?(?<![\w$])DomainEventDispatcher(?![\w$])/g;
const TYPED = /:\s*(?:[\w$]+\s*\.\s*)*DomainEventDispatcher(?![\w$])/;

const FIX =
  'Events leave with the save: `await repository.save(aggregate)` and nothing else; a removal that announces an event takes the aggregate.';

/** What a file of a context is held to: every judged file calls no `takeRecordedEvents()`, some also know no dispatcher. */
interface Judged {
  readonly place: string;
  readonly refusesDispatcher: boolean;
}

export const domainEventsDispatchedOnSave: FileRule = {
  id: 'domain-events/dispatched-on-save',
  description:
    'Domain events leave with the save: no `takeRecordedEvents()` in application/ or infrastructure/, no DomainEventDispatcher in a command, a query or a repository adapter.',
  severity: 'error',
  doc: {
    why: 'Domain events leave with the save. Once a repository method that was handed an aggregate resolves, the events the aggregate recorded are dispatched in order, inside the unit of work of the command, so their handlers and the outbox commit or roll back with the state. A handler that pulls the events and dispatches them itself announces them twice or outside the transaction, and a repository adapter that dispatches mixes persistence with wiring. Reported: a call to takeRecordedEvents() in application/ or infrastructure/ of a context, and DomainEventDispatcher imported, listed as a dependency or received by a constructor in application/commands, application/queries and a repository adapter. The module file, the tests, the platform and main.ts are left alone.',
    bad: `// application/commands/issue-invoice/issue-invoice.handler.ts
@CommandHandler(IssueInvoiceCommand)
constructor(private readonly invoices: InvoiceRepository, private readonly dispatcher: DomainEventDispatcher) {}
await this.invoices.save(invoice);
await this.dispatcher.dispatch(takeRecordedEvents(invoice));`,
    good: `// application/commands/issue-invoice/issue-invoice.handler.ts
@CommandHandler(IssueInvoiceCommand)
constructor(private readonly invoices: InvoiceRepository) {}
await this.invoices.save(invoice);
// a removal that announces an event takes the aggregate
await this.invoices.remove(invoice);`,
  },
  scope: 'file',
  judge(file) {
    const judged = judgedAs(file);

    if (judged === undefined) {
      return [];
    }

    const lines = [...pulled(file), ...(judged.refusesDispatcher ? dispatcherIn(file) : [])];

    return lines.map(({ line, what }) => ({
      line,
      message: `${what} in ${judged.place}: the events an aggregate recorded are dispatched when its repository saves it.`,
      fix: FIX,
    }));
  },
};

interface Named {
  readonly line: number;
  readonly what: string;
}

/** Production files of application/ and infrastructure/; the module file, the tests and everything outside a context are not judged. */
function judgedAs(file: SourceFile): Judged | undefined {
  const { location } = file;

  if (location.area !== 'context' || file.isTest) {
    return undefined;
  }

  const [folder = ''] = location.inside;

  if (location.layer === 'application') {
    return { place: `application/${folder}`, refusesDispatcher: folder === 'commands' || folder === 'queries' };
  }

  if (location.layer !== 'infrastructure') {
    return undefined;
  }

  return {
    place: `infrastructure/${folder}`,
    refusesDispatcher: folder === 'persistence' && file.path.endsWith('.repository.ts'),
  };
}

function pulled({ scan }: SourceFile): Named[] {
  return [...scan.code.matchAll(PULL)].map((match) => ({
    line: scan.lineAt(match.index),
    what: '`takeRecordedEvents()` is called',
  }));
}

/** Where the file names the dispatcher: in an import, in a dependency list, as the type of a constructor parameter. */
function dispatcherIn(file: SourceFile): Named[] {
  const { scan } = file;

  const imported = [...scan.code.matchAll(IMPORTED)].map((match) => ({
    line: scan.lineAt(match.index + match[0].length - 1),
    what: `${DISPATCHER} is imported`,
  }));

  const listed = dependencyLists(file).flatMap(({ owner, names }) =>
    names
      .filter(({ name }) => name === DISPATCHER)
      .map(({ line }) => ({ line, what: `${DISPATCHER} is named in the dependency list of ${owner}` })),
  );

  return [...imported, ...listed, ...received(file)];
}

function received(file: SourceFile): Named[] {
  return file.structure.classes.flatMap((shape) =>
    shape.methods
      .filter((method) => method.isConstructor && method.parameters.some((parameter) => TYPED.test(parameter)))
      .map((method) => ({ line: method.line, what: `The constructor of ${shape.name} receives a ${DISPATCHER}` })),
  );
}
