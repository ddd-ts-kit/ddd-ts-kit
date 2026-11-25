import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
import type { Calendar } from '@/contexts/scheduling/calendars/domain/aggregates/calendar.aggregate';
import { CalendarRepository } from '@/contexts/scheduling/calendars/domain/repositories/calendar.repository';
import { SCHEDULING_SCHEMA } from '@/contexts/scheduling/shared/infrastructure/persistence/scheduling.schema';
import { CalendarMapper } from '@/contexts/scheduling/calendars/infrastructure/persistence/calendar.mapper';
import type { CalendarRow } from '@/contexts/scheduling/calendars/infrastructure/persistence/calendar-row.schema';

/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
const TABLE = { schema: SCHEDULING_SCHEMA, table: 'calendars' };

@Repository(CalendarRepository)
export class KnexCalendarRepository implements CalendarRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Calendar | undefined> {
    const row = await tenantTable<CalendarRow>(this.database, this.scope, TABLE).where({ id }).first();

    return row === undefined ? undefined : CalendarMapper.toDomain(row);
  }

  async save(saved: Calendar): Promise<void> {
    await saveTenantAggregate(this.database, TABLE, {
      aggregate: saved,
      row: CalendarMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
