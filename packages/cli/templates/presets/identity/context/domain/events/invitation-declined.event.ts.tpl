import { NamedDomainEvent } from '@ddd-ts-kit/kernel';

/** The person an invitation was addressed to declined it. */
export class InvitationDeclined extends NamedDomainEvent('{{context.kebab}}.invitation.declined') {
  constructor(
    aggregateId: string,
    occurredAt: Date,
    readonly facts: {
      readonly organisationId: string;
    },
  ) {
    super(aggregateId, occurredAt);
  }
}
