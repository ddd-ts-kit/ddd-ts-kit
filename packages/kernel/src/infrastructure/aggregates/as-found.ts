import type { DomainEvent } from '../../domain/domain-event';

/** An aggregate as a unit of work found it, and the events its saves took since: what a rollback gives back. */
export interface AsFound {
  readonly version: number;
  readonly appended: number;
  readonly taken: DomainEvent[];
}
