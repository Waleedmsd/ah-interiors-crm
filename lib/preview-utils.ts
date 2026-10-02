export function toCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const raw = String(value);
    const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return (
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
  );
}

export function downloadCsv(
  name: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const url = URL.createObjectURL(
    new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
