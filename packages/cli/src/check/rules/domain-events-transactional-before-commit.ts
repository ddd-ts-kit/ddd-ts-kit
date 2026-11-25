import { adapterFolders } from '../domain-events/adapter-folders';
import type { EventHandler } from '../domain-events/event-handler';
import { eventHandlersOf } from '../domain-events/event-handlers-of';
import type { HandlerDependency } from '../domain-events/handler-dependency';
import { refusedBeforeCommit } from '../domain-events/refused-before-commit';
import type { Finding } from '../model/finding';
import type { Project } from '../model/project';
import type { Rule } from '../model/rule';
import { perFile } from '../support/per-file';

const KERNEL = '@ddd-ts-kit/kernel';
const PUBLISHER = 'IntegrationEventPublisher';
const PERSISTENCE = 'persistence';

const BEFORE_FIX =
  "Declare the handler `phase: 'after-commit'` when its effect may be lost on a crash (it then runs at most once), or publish an integration event from a publisher (outbox, at least once) and do the work in the handler of that event when it must not be lost.";

const AFTER_FIX =
  'Send a command through the CommandBus port and let the publisher of the event that command records write to the outbox, or leave this handler before the commit: after the commit nothing makes the outbox row atomic with a state change.';

export const domainEventsTransactionalBeforeCommit: Rule = {
  id: 'domain-events/transactional-before-commit',
  description:
    'A domain event handler that runs before the commit has only effects the rollback undoes: it depends on the domain of its context, on persistence ports and on kernel ports other than Cache, CachePurger, Lock, RateLimiter, JobScheduler and EventBus; an after-commit handler never depends on IntegrationEventPublisher.',
  severity: 'error',
  doc: {
    why: "An effect of a domain event exists only if the state change that recorded the event is committed. A handler that runs before the commit runs inside the transaction, and the commit can still fail after it ran (a deferred constraint, a serialization failure, a lost connection): that is safe only when the rollback undoes everything the handler did, so a before-commit handler has transactional effects only. Judged: every production class of application/event-handlers/*.event-handler.ts and application/integration/publishers/*.publisher.ts, and any class carrying @DomainEventHandler. Its phase is after-commit when its decorator says phase: 'after-commit', or, without a decorator, when every .on(..) of <context>.module.ts whose callback mentions it has a third argument holding phase: 'after-commit'; otherwise it is before-commit. Its dependencies are the names of its dependency list, of .toClass(Handler, [..]) and the types of its constructor parameters, resolved through the imports. Before the commit it may depend on the domain/ of its context, on the kernel ports except Cache, CachePurger, Lock, RateLimiter, JobScheduler and EventBus (CacheInvalidation is allowed: the purge it asks for commits with the work), on @ddd-ts-kit/auth, on application helpers of its context, and on a port of application/ports/ only when it is a persistence port: at least one production class implements it under infrastructure/persistence/ and none anywhere else under infrastructure/. Refused: those five kernel ports, any other port of application/ports/, anything of infrastructure/, of another context, of the platform or of another package. An after-commit handler is refused IntegrationEventPublisher alone: after the commit nothing makes the outbox row atomic with a state change, so it sends a command instead.",
    bad: `// application/event-handlers/invoice-issued.event-handler.ts
// Mailer is implemented under infrastructure/external/: the mail leaves even when the commit fails
@DomainEventHandler(InvoiceIssued)
constructor(
  private readonly invoiceRepository: InvoiceRepository,
  private readonly mailer: Mailer,
  private readonly cache: Cache,
) {}
// after the commit the outbox row would be written in no transaction
@DomainEventHandler(InvoiceIssued, { phase: 'after-commit' })
constructor(private readonly integrationEventPublisher: IntegrationEventPublisher) {}`,
    good: `// application/event-handlers/invoice-issued.event-handler.ts: repositories, persistence ports, buses
@DomainEventHandler(InvoiceIssued)
constructor(
  private readonly invoiceRepository: InvoiceRepository,
  private readonly commandBus: CommandBus,
) {}
// an effect that may be lost on a crash runs after the commit, at most once
@DomainEventHandler(InvoiceIssued, { phase: 'after-commit' })
constructor(private readonly cache: Cache) {}
// explicit style, in billing.module.ts
platform.domainEvents.on('billing.invoice.issued', async (event) => {
  if (event instanceof InvoiceIssued) {
    await invoiceIssuedEventHandler.handle(event);
  }
}, { phase: 'after-commit' });
// an effect that must not be lost: a publisher writes to the outbox, the handler of that event does the work
@DomainEventHandler(InvoiceIssued)
export class InvoiceIssuedPublisher {
  constructor(
    private readonly integrationEventPublisher: IntegrationEventPublisher,
    private readonly idGenerator: IdGenerator,
  ) {}
}`,
  },
  scope: 'file',
  run(project) {
    return perFile(project, this.id, (file) =>
      eventHandlersOf(project, file).flatMap((handler) =>
        handler.isAfterCommit ? publishing(handler) : outsideTheTransaction(handler),
      ),
    );
  },
  acrossProject(project) {
    return perFile(project, this.id, (file) =>
      eventHandlersOf(project, file).flatMap((handler) =>
        handler.isAfterCommit ? [] : otherThanPersistence(project, handler),
      ),
    );
  },
};

/** After the commit, the outbox row would be written in no transaction. */
function publishing({ name, dependencies }: EventHandler): Finding[] {
  const publishers = dependencies.filter(
    ({ name: dependency, target }) => dependency === PUBLISHER && target.kind === 'package' && target.name === KERNEL,
  );

  return publishers.map(({ line }) => ({
    line,
    message: `${name} runs after the commit and depends on ${PUBLISHER}: the event it publishes would be committed apart from the state change it announces.`,
    fix: AFTER_FIX,
  }));
}

/** What one file shows: a kernel port no transaction covers, an adapter, another context, the platform, a foreign package. */
function outsideTheTransaction(handler: EventHandler): Finding[] {
  return handler.dependencies.flatMap((dependency) => {
    const why = refusedBeforeCommit(handler.context, dependency);

    return why === undefined ? [] : [survives(handler, dependency, why)];
  });
}

/** A port of `application/ports/` is transactional when its adapters, and all of them, live under `infrastructure/persistence/`. */
function otherThanPersistence(project: Project, handler: EventHandler): Finding[] {
  return handler.dependencies.flatMap((dependency) => {
    const { name, target } = dependency;

    if (!isOwnPort(handler, dependency) || target.kind !== 'file') {
      return [];
    }

    const folders = adapterFolders(project, { context: handler.context, name, path: target.path });
    const elsewhere = folders.find((folder) => folder !== PERSISTENCE);

    if (folders.length > 0 && elsewhere === undefined) {
      return [];
    }

    const why =
      elsewhere === undefined
        ? `which has no adapter under infrastructure/${PERSISTENCE}/`
        : `whose adapter is under infrastructure/${elsewhere}${elsewhere === '' ? '' : '/'}`;

    return [survives(handler, dependency, why)];
  });
}

function isOwnPort({ context }: EventHandler, { target }: HandlerDependency): boolean {
  if (target.kind !== 'file' || target.location.area !== 'context') {
    return false;
  }

  const { location } = target;

  return location.context === context && location.layer === 'application' && location.inside[0] === 'ports';
}

function survives(handler: EventHandler, { name, line }: HandlerDependency, why: string): Finding {
  return {
    line,
    message: `${handler.name} runs before the commit and depends on ${name}, ${why}: its effect would survive a rollback.`,
    fix: BEFORE_FIX,
  };
}
