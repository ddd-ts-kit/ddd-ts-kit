import { aggregateMapper } from '@ddd-ts-kit/kernel';
import { Person } from '@/contexts/identity/domain/aggregates/person.aggregate';
import { DisplayName } from '@/contexts/identity/domain/value-objects/display-name.vo';
import { Email } from '@/contexts/identity/domain/value-objects/email.vo';
import type { PersonColumns, PersonRow } from '@/contexts/identity/infrastructure/persistence/person-row.schema';

export const PersonMapper = aggregateMapper({
  toDomain(row: PersonRow): Person {
    return Person.rehydrate(row.id, {
      registeredAt: row.registered_at,
      displayName: DisplayName.create(row.display_name),
      email: Email.create(row.email),
    });
  },

  toRow(saved: Person): PersonColumns {
    const state = saved.toState();

    return {
      id: saved.id,
      registered_at: state.registeredAt,
      display_name: state.displayName.value,
      email: state.email.value,
    };
  },
});
