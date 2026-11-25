import { aggregateMapper, type AuditStamp } from '@ddd-ts-kit/kernel';
import { Organisation } from '{{alias.context}}/domain/aggregates/organisation.aggregate{{alias.ext}}';
import { OrganisationName } from '{{alias.context}}/domain/value-objects/organisation-name.vo{{alias.ext}}';
import type { organisations } from '{{alias.context}}/infrastructure/persistence/{{context.kebab}}.schema{{alias.ext}}';

type OrganisationRow = typeof organisations.$inferSelect;

export type OrganisationColumns = Omit<OrganisationRow, 'version' | keyof AuditStamp>;

export const OrganisationMapper = aggregateMapper({
  toDomain(row: OrganisationRow): Organisation {
    return Organisation.rehydrate(row.id, {
      name: OrganisationName.create(row.name),
      openedBy: row.openedBy,
      openedAt: row.openedAt,
    });
  },

  toRow(saved: Organisation): OrganisationColumns {
    const state = saved.toState();

    return { id: saved.id, name: state.name.value, openedBy: state.openedBy, openedAt: state.openedAt };
  },
});
