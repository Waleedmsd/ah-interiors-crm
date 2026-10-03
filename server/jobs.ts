import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { database } from './db';
import {
  jobs,
  notifications,
  users,
  workspaces,
  centralTasks,
  serviceCases,
  flooringLeads,
  supplierOrders,
} from './db/schema';
import { businessDate } from '../lib/business-date';
import { businessOptions } from './services/business-options';
import { supplierFlags } from '../lib/supplier-workflow';
export async function runJobs() {
  const rules = await businessOptions();
  const today = businessDate(Date.now(), rules.timeZone);
  const localTime =
    today +
    'T' +
    new Intl.DateTimeFormat('en-GB', {
      timeZone: rules.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
  const db = database();
  let completed = 0;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10202)`);
    const recipients = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.active, true), eq(users.role, 'Management')));
    const [ledger] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, 'ah-interiors'));
    for (const order of ledger?.data.operations.cases ?? [])
      for (const task of order.tasks ?? []) {
        if (task.dueAt > Date.now()) continue;
        for (const staff of recipients)
          await tx
            .insert(notifications)
            .values({
              id: randomUUID(),
              recipientId: staff.id,
              type: 'followup-due',
              entity: 'order',
              entityId: order.id,
              title: task.title,
              message: task.nextAction,
              dedupeKey: `${staff.id}:${order.id}:${task.id}:${task.dueAt}`,
            })
            .onConflictDoNothing();
      }
    for (const [entity, table, key] of [
      ['tasks', centralTasks, 'dueDate'],
      ['service-cases', serviceCases, 'nextChaseDate'],
      ['flooring', flooringLeads, 'nextChaseDate'],
    ] as const) {
      const records = await tx.select().from(table);
      for (const record of records) {
        if (
          ['Completed', 'Cancelled', 'Resolved', 'Closed', 'Lost'].includes(
            record.status,
          )
        )
          continue;
        const date = String(record.details[key] ?? '');
        const reminder =
          entity === 'tasks' ? String(record.details.reminderDate ?? '') : '';
        const due =
          reminder && reminder <= localTime
            ? reminder
            : date && date <= today
              ? date
              : '';
        if (!due) continue;
        const targets = record.assignedUserId
          ? [{ id: record.assignedUserId }]
          : recipients;
        for (const person of targets)
          await tx
            .insert(notifications)
            .values({
              id: randomUUID(),
              recipientId: person.id,
              type: 'followup-due',
              entity,
              entityId: record.id,
              title: record.number + ' · follow-up due',
              message: record.title,
              dedupeKey:
                person.id + ':' + entity + ':' + record.id + ':due:' + due,
            })
            .onConflictDoNothing();
      }
    }
    for (const record of await tx.select().from(supplierOrders)) {
      const flags = supplierFlags(
        record,
        rules.supplierConfirmationDays,
        Date.now(),
        rules.timeZone,
      );
      for (const [flag, due] of Object.entries(flags))
        if (due)
          await tx
            .insert(notifications)
            .values({
              id: randomUUID(),
              recipientId: record.ownerId,
              type: 'supplier-followup',
              entity: 'supplier-order',
              entityId: record.id,
              title: record.number + ' · ' + flag.replace(/([A-Z])/g, ' $1'),
              message: 'Review the supplier order and update the next action.',
              dedupeKey:
                record.ownerId +
                ':' +
                record.id +
                ':' +
                flag +
                ':' +
                record.version,
            })
            .onConflictDoNothing();
    }
    const pending = await tx
      .select()
      .from(jobs)
      .where(and(isNull(jobs.completedAt), lte(jobs.runAt, new Date())))
      .for('update', { skipLocked: true })
      .limit(50);
    for (const job of pending) {
      if (job.type !== 'notification') {
        await tx
          .update(jobs)
          .set({
            attempts: job.attempts + 1,
            lastError: 'Unsupported job type',
            runAt: new Date(Date.now() + 3600000),
          })
          .where(eq(jobs.id, job.id));
        continue;
      }
      const payload = job.payload as {
        recipientId: string;
        title: string;
        message: string;
      };
      if (!payload.recipientId || !payload.title || !payload.message) {
        await tx
          .update(jobs)
          .set({ lastError: 'Invalid payload', completedAt: new Date() })
          .where(eq(jobs.id, job.id));
        continue;
      }
      await tx
        .insert(notifications)
        .values({
          id: randomUUID(),
          ...payload,
          type: 'internal',
          dedupeKey: job.id,
        })
        .onConflictDoNothing();
      await tx
        .update(jobs)
        .set({ completedAt: new Date(), attempts: job.attempts + 1 })
        .where(eq(jobs.id, job.id));
      completed++;
    }
  });
  return { completed };
}
