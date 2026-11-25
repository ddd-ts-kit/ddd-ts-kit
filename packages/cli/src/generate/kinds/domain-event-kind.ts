import { eventNames } from '../event-names';
import { TERM } from '../kind-options';
import { refuseStutteringEvent } from '../refuse-stuttering-event';
import { extendEventSourcedAggregate } from './extend-event-sourced-aggregate';
import { writeDomainEvent } from './write-domain-event';
import { defineKind } from '../define-kind';

export const domainEventKind = defineKind({
  name: 'domain-event',
  summary:
    'A domain event named <context>.<aggregate>.<fact>, and its spec; a fact that starts with the aggregate ("Order Confirmed" of Order) is refused, since the event is named after the aggregate already (--allow-name lets it through); for an event-sourced aggregate, its apply method and its stored form too.',
  scope: 'context',
  positionals: ['Aggregate', 'Fact'],
  options: { term: TERM },
  writesInModules: true,
  run: (scope, request) => {
    const names = eventNames(scope, request.args[1] ?? '', request.args[2] ?? '');

    refuseStutteringEvent(scope, names);
    writeDomainEvent(scope, names);
    extendEventSourcedAggregate(scope, names);
  },
});
