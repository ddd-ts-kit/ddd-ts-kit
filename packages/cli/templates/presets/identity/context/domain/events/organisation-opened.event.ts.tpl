import { NamedDomainEvent } from '@ddd-ts-kit/kernel';

/** An organisation was opened, its opener its first owner. */
export class OrganisationOpened extends NamedDomainEvent('{{context.kebab}}.organisation.opened') {
  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly facts: {
      readonly name: string;
      readonly openedBy: string;
    },
  ) {
    super(aggregateId, occurredAt);
  }
}
