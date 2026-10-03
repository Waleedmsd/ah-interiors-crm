export function slotRange(value: string): [number, number] | null {
  const label = value.trim().toUpperCase();
  if (['AM', 'MORNING'].includes(label)) return [0, 720];
  if (['PM', 'AFTERNOON'].includes(label)) return [720, 1440];
  if (['ALL DAY', 'ANY TIME'].includes(label)) return [0, 1440];
  const m = label.match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  const a = h1 * 60 + m1,
    b = h2 * 60 + m2;
  return b > a ? [a, b] : null;
}
export function slotsOverlap(a: string, b: string) {
  const x = slotRange(a),
    y = slotRange(b);
  return !x || !y || (x[0] < y[1] && y[0] < x[1]);
}
