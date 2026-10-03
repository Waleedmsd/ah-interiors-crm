export const defaultTimeZone = 'Europe/London';
export function businessDate(
  now: number | Date = Date.now(),
  zone = defaultTimeZone,
  offset = 0,
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((v) => v.type === type)!.value;
  const date = new Date(
    get('year') + '-' + get('month') + '-' + get('day') + 'T12:00:00Z',
  );
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
