import { aggregateMapper } from '@ddd-ts-kit/kernel';
import { Member } from '{{alias.context}}/domain/aggregates/member.aggregate{{alias.ext}}';
import type { MemberColumns, MemberRow } from '{{alias.context}}/infrastructure/persistence/member-row.schema{{alias.ext}}';

export const MemberMapper = aggregateMapper({
  toDomain(row: MemberRow): Member {
    return Member.rehydrate(row.id, {
      organisationId: row.organisation_id,
      accountId: row.account_id,
      role: row.role,
      joinedAt: row.joined_at,
      removedAt: row.removed_at ?? undefined,
    });
  },

  toRow(saved: Member): MemberColumns {
    const state = saved.toState();

    return {
      id: saved.id,
      organisation_id: state.organisationId,
      account_id: state.accountId,
      role: state.role,
      joined_at: state.joinedAt,
      removed_at: state.removedAt ?? null,
    };
  },
});
