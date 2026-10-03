import { randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '../db';
import { communicationDrafts, auditLogs } from '../db/schema';
import { recordChoices, recordAccess } from './records';
import { AppError, type Staff } from '../permissions';
export async function listDrafts(staff: Staff) {
  const records = await recordChoices(staff);
  const map = new Map(records.map((v) => [v.entity + ':' + v.id, v]));
  const rows = await database()
    .select()
    .from(communicationDrafts)
    .orderBy(desc(communicationDrafts.updatedAt));
  return rows.flatMap((v) => {
    const record = map.get(v.entity + ':' + v.entityId);
    return record ? [{ ...v, recordName: record.name, href: record.href }] : [];
  });
}
export async function saveDraft(staff: Staff, raw: unknown, id?: string) {
  const input = z
    .object({
      version: z.number().int().nonnegative(),
      entity: z.string().min(1),
      entityId: z.string().min(1),
      to: z.email().max(254),
      subject: z.string().trim().min(1).max(500),
      body: z.string().trim().min(1).max(30000),
    })
    .strict()
    .parse(raw);
  await recordAccess(staff, input.entity, input.entityId);
  return database().transaction(async (tx) => {
    const [prior] = id
      ? await tx
          .select()
          .from(communicationDrafts)
          .where(eq(communicationDrafts.id, id))
          .for('update')
      : [];
    if (id && !prior) throw new AppError(404, 'NOT_FOUND', 'Draft not found.');
    if (prior) {
      await recordAccess(staff, prior.entity, prior.entityId);
      if (prior.version !== input.version)
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'The draft changed. Reload before editing.',
        );
    }
    const recordId = id ?? randomUUID();
    const [saved] = await tx
      .insert(communicationDrafts)
      .values({ ...input, id: recordId, version: 1, updatedBy: staff.id })
      .onConflictDoUpdate({
        target: communicationDrafts.id,
        set: {
          ...input,
          version: input.version + 1,
          updatedBy: staff.id,
          updatedAt: new Date(),
        },
      })
      .returning();
    await tx
      .insert(auditLogs)
      .values({
        userId: staff.id,
        entity: input.entity,
        entityId: input.entityId,
        action: 'message-draft-saved',
        after: { draftId: recordId, subject: input.subject },
      });
    return saved;
  });
}
