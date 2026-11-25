import { declaredRoleOf } from '../../declared/declared-role-of';
import type { ClassInjection } from '../../declared/injection/class-injection';
import { readInjections } from '../../declared/injection/read-injections';
import type { Finding } from '../model/finding';
import type { ProjectFacts } from '../model/project';
import type { FileRule } from '../model/rule';
import { inContext } from '../support/in-context';
import { isDeclaredStyle } from '../support/is-declared-style';
import { pathInContext } from '../support/path-in-context';
import { WITHOUT_MODULE } from '../../model-modules';

export const declarationsConstructorInjection: FileRule = {
  id: 'declarations/constructor-injection',
  description:
    'In the declared style, a class whose decorator lists no dependency states them in its constructor: each parameter is typed by one class, with no `?`, default value, rest or destructuring, and an inherited constructor is one the project can read. Under "stack.dependencies": "signature" a decorator carries no list.',
  severity: 'error',
  doc: {
    why: 'The constructor signature is the one statement of what a declared class depends on: `ddd-ts-kit docs` reads it and writes the list the composition root injects, so nothing is repeated in the decorator and nothing can disagree with the constructor. That only works when each parameter names exactly one injection token, and a token is a class: an interface, a type alias or a primitive is erased by the compiler, a union names two things, an optional or defaulted parameter says the container might not give a value, which it always does. A constructor inherited from a class of a package cannot be read at all. The compiler is not asked for the types at run time: `emitDecoratorMetadata` exists only with legacy decorators compiled by tsc or swc, not with standard decorators nor under tsx or esbuild. Under "stack.dependencies": "signature" a list left in a decorator is a second statement: it wins at run time, so it is removed when it repeats the constructor (ESLint fixes it) and reported when it differs. A project whose config does not say lists its dependencies in its decorators, as 0.1 did, and may keep doing so.',
    bad: `@CommandHandler(IssueInvoiceCommand)
export class IssueInvoiceHandler {
  constructor(
    private readonly invoices: InvoiceRepository | undefined,
    private readonly settings: InvoiceSettings,   // an interface
    private readonly retries = 3,
  ) {}
}
// "stack.dependencies": "signature"
@CommandHandler(IssueInvoiceCommand, [InvoiceRepository, Clock])`,
    good: `@CommandHandler(IssueInvoiceCommand)
export class IssueInvoiceHandler {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly settings: InvoiceSettings,   // an abstract class of application/ports, bound to a value in the platform
    private readonly clock: Clock,
  ) {}
}`,
  },
  scope: 'file',
  judge(file, project) {
    if (
      !isDeclaredStyle(project) ||
      !inContext(file.location) ||
      file.isTest ||
      declaredRoleOf(pathInContext(project, file) ?? '', WITHOUT_MODULE) === undefined
    ) {
      return [];
    }

    return readInjections((path) => project.sourceAt(path), file).flatMap((injection) =>
      injection.listed === undefined ? unstated(project, injection) : listed(project, injection),
    );
  },
};

/**
 * What keeps a constructor from stating the dependencies. A project that lists them in its
 * decorators wrote its classes before the signature was read: there, a class that inherits a
 * constructor nothing can read and lists nothing takes nothing, as it always did.
 */
function unstated(project: ProjectFacts, { problems, readable }: ClassInjection): readonly Finding[] {
  return readable || project.config.stack.dependencies === 'signature' ? problems : [];
}

/** A list in a decorator: the statement of a 0.1 project, a second statement where the constructor is the one. */
function listed(project: ProjectFacts, injection: ClassInjection): Finding[] {
  const { className, line, listed: names = [], dependencies, readable } = injection;

  if (project.config.stack.dependencies !== 'signature' || !readable) {
    return [];
  }

  const typed = dependencies?.map(({ name }) => name);

  if (typed !== undefined && typed.join(',') === names.join(',')) {
    return [
      {
        line,
        message: `The decorator of ${className} lists [${names.join(', ')}], which its constructor already states.`,
        fix: 'Remove the list from the decorator (`eslint --fix` does it) and import the ports that are now only types with `import type`: the constructor signature is the one statement of what a class depends on.',
      },
    ];
  }

  return [
    {
      line,
      message: `The decorator of ${className} lists [${names.join(', ')}] and its constructor says something else: the list wins at run time, so the signature lies.`,
      fix: 'Type each constructor parameter by the class its list entry names (the token is the type), then remove the list from the decorator: the constructor signature is the one statement of what a class depends on.',
    },
  ];
}
