import type { Clock, ExecutionScope } from '@ddd-ts-kit/kernel';
import { Repository } from '@ddd-ts-kit/kernel/declarations';
import { KnexContext, saveTenantAggregate, tenantTable } from '@ddd-ts-kit/knex';
import type { Reminder } from '@/contexts/notification/domain/aggregates/reminder.aggregate';
import { ReminderRepository } from '@/contexts/notification/domain/repositories/reminder.repository';
import { NOTIFICATION_SCHEMA } from '@/contexts/notification/infrastructure/persistence/notification.schema';
import { ReminderMapper } from '@/contexts/notification/infrastructure/persistence/reminder.mapper';
import type { ReminderRow } from '@/contexts/notification/infrastructure/persistence/reminder-row.schema';
import { ReminderStatus } from '@/contexts/notification/domain/vocabularies/reminder-status.vocabulary';

/** Tenant data: every statement reaches it through `tenantTable` or `saveTenantAggregate`, confined to the tenant of the work. */
const TABLE = { schema: NOTIFICATION_SCHEMA, table: 'reminders' };

@Repository(ReminderRepository)
export class KnexReminderRepository implements ReminderRepository {
  constructor(
    private readonly database: KnexContext,
    private readonly scope: ExecutionScope,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Reminder | undefined> {
    const row = await tenantTable<ReminderRow>(this.database, this.scope, TABLE).where({ id }).first();

    return row === undefined ? undefined : ReminderMapper.toDomain(row);
  }

  async findByAppointment(appointmentId: string): Promise<Reminder | undefined> {
    const row = await tenantTable<ReminderRow>(this.database, this.scope, TABLE)
      .where({ appointment_id: appointmentId })
      .first();

    return row === undefined ? undefined : ReminderMapper.toDomain(row);
  }

  async findDue(asOf: Date): Promise<readonly Reminder[]> {
    const rows = await tenantTable<ReminderRow>(this.database, this.scope, TABLE)
      .where({ status: ReminderStatus.Planned })
      .where('due_at', '<=', asOf)
      .where('starts_at', '>', asOf)
      .orderBy('due_at')
      .orderBy('id');

    return rows.map((row) => ReminderMapper.toDomain(row));
  }

  async save(saved: Reminder): Promise<void> {
    await saveTenantAggregate(this.database, TABLE, {
      aggregate: saved,
      row: ReminderMapper.toRow(saved),
      scope: this.scope,
      clock: this.clock,
    });
  }
}
