import { eq } from 'drizzle-orm';
import { database } from '../db';
import { settings } from '../db/schema';
import { defaultTimeZone } from '../../lib/business-date';
export async function businessOptions() {
  const [row] = await database()
    .select()
    .from(settings)
    .where(eq(settings.key, 'business'));
  const value = (row?.value ?? {}) as Record<string, unknown>;
  return {
    timeZone: String(value.timeZone ?? defaultTimeZone),
    salesChannels: Array.isArray(value.salesChannels)
      ? (value.salesChannels as string[])
      : ['Magento', 'Shopify', 'Amazon', 'eBay', 'WhatsApp'],
    supplierConfirmationDays: Number(value.supplierConfirmationDays ?? 3),
  };
}
