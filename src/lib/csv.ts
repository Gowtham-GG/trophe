// CSV for the exports: RFC 4180 quoting, and a guard against spreadsheet formula injection
// (a food named "=HYPERLINK(…)" must stay text when the file is opened in Excel or Sheets).

export type Cell = string | number | null | undefined

function cell(v: Cell): string {
  if (v == null) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A header row and one line per row, CRLF line ends (what spreadsheets expect). */
export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
