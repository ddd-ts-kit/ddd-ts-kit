import { NamedDomainEvent } from '@ddd-ts-kit/kernel';

export class {{event.pascal}} extends NamedDomainEvent('{{event.name}}') {
  // TODO(domain): add the facts a reaction needs to know about "{{event.words}}" beyond its aggregate and its instant, as readonly parameters of a constructor that hands those two to the base (value objects or primitives, never the aggregate itself): `constructor(aggregateId: string, occurredAt: Date, readonly <fact>: <Type>) { super(aggregateId, occurredAt); }`. Delete this line when the event says nothing more.
}
