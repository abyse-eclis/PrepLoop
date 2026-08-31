/**
 * Minimal RFC 4180 CSV writer.
 *
 * Exports are meant to be opened in a spreadsheet, so two things matter beyond
 * plain joining: Thai text needs a UTF-8 BOM for Excel to decode it, and cells
 * that a spreadsheet would evaluate as formulas must be neutralised.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_LEAD = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Byte order mark — without it Excel reads Thai CSV as mojibake. */
export const CSV_BOM = "﻿";

/**
 * Render one cell. Strings that a spreadsheet would treat as a formula get a
 * leading apostrophe (Excel shows the text, not the result); a string that is
 * just a negative number is left alone so numeric columns stay numeric.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";

  let text = String(value);
  if (
    typeof value === "string" &&
    FORMULA_LEAD.test(text) &&
    !PLAIN_NUMBER.test(text)
  ) {
    text = `'${text}`;
  }

  return NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build a CSV document from a header row and data rows (CRLF line endings). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

/** CSV document prefixed with the BOM, ready to be served as a file. */
export function toCsvFile(headers: string[], rows: unknown[][]): string {
  return CSV_BOM + toCsv(headers, rows);
}
