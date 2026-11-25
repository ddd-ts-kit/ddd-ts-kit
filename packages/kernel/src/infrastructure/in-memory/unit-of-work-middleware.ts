import type { BusMiddleware } from '../../application/messaging/bus-middleware';
import type { UnitOfWork } from '../../application/ports/unit-of-work';
import { unitOfWorkStage } from '../domain-events/unit-of-work-stage';
import { UnscopedUnitOfWorkError } from '../domain-events/unscoped-unit-of-work-error';

/**
 * Runs every command inside one unit of work. Queries are left alone: they do not write. The
 * domain events its saves recorded are dispatched once the handler has returned, before the
 * commit: the unit of work does it, the one every adapter builds on `unitOfWorkOver`, and one
 * that does not is refused before the handler runs (`UnscopedUnitOfWorkError`). A command sent
 * from inside a unit of work joins it.
 */
export function unitOfWorkMiddleware(unitOfWork: Pick<UnitOfWork, 'run'>): BusMiddleware {
  return (_message, next, info) => (info.kind === 'command' ? unitOfWork.run(() => scoped(next)) : next());
}

async function scoped<T>(next: () => Promise<T>): Promise<T> {
  const stage = unitOfWorkStage();

  if (stage !== 'open' && stage !== 'before-commit') {
    throw new UnscopedUnitOfWorkError();
  }

  return next();
}
