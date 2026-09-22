// The one tool sold in the public demo: a document converter that turns GFM
// Markdown tables into JSON. Pure, deterministic, dependency-free.
export const MAX_INPUT_CHARS = 64000;

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, '|').trim());
}
const isSeparator = line => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('-');

export function convertMarkdownTables(markdown) {
  if (typeof markdown !== 'string') throw new Error('markdown must be a string');
  if (markdown.length > MAX_INPUT_CHARS) throw new Error(`Input exceeds ${MAX_INPUT_CHARS} characters`);
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|') || !isSeparator(lines[i + 1])) continue;
    const columns = splitRow(lines[i]);
    if (columns.length !== splitRow(lines[i + 1]).length) continue;
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].includes('|') && !isSeparator(lines[j]); j++) {
      const cells = splitRow(lines[j]);
      rows.push(columns.map((_, k) => cells[k] ?? ''));
    }
    tables.push({ columns, rows });
    i = j - 1;
  }
  return { format: 'handsel.markdown-tables.v1', tableCount: tables.length, tables, sourceChars: markdown.length };
}
