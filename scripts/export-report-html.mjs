// Exports every reports/*/REPORT.md as a single self-contained HTML file.
//
//   npm run report:html
//
// The output has no external references at all: each figure is inlined as a
// base64 data URI, so one file can be archived, emailed or opened offline in
// ten years with no repo, no server and no network. Print it from the browser
// for a PDF.
//
// The <picture>/<source>/<img> markup in the source document is preserved --
// only the URLs are rewritten -- so light/dark switching keeps working exactly
// as it does on GitHub, without a line of extra CSS.
//
// This is a convenience export, not the record: REPORT.md, charts/ and data/
// are the committed sources, and this file is regenerated from them.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPORTS = join(ROOT, 'reports')

// Chart chrome and ink from the same reference palette the figures use, so the
// page and the plots read as one document in both modes.
const CSS = `
:root {
  color-scheme: light dark;
  --surface: #fcfcfb;
  --page: #f9f9f7;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --accent: #2a78d6;
  --border: rgba(11, 11, 11, 0.1);
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #1a1a19;
    --page: #0d0d0d;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --accent: #3987e5;
    --border: rgba(255, 255, 255, 0.1);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 48px 24px 96px;
  background: var(--page);
  color: var(--ink);
  font: 16px/1.65 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
main {
  max-width: 940px;
  margin: 0 auto;
  padding: 56px 64px 72px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}
h1, h2, h3 { line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; }
h1 { font-size: 30px; margin: 0 0 24px; }
h2 {
  font-size: 21px;
  margin: 44px 0 14px;
  padding-top: 20px;
  border-top: 1px solid var(--grid);
}
h3 { font-size: 17px; margin: 28px 0 10px; }
p, li { color: var(--ink-2); }
strong { color: var(--ink); font-weight: 600; }
a { color: var(--accent); }
hr { border: 0; border-top: 1px solid var(--grid); margin: 32px 0; }
code {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 0.88em;
  background: var(--page);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
}
pre {
  background: var(--page);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 18px;
  overflow-x: auto;
}
pre code { background: none; border: 0; padding: 0; font-size: 13px; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 20px 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
th, td {
  text-align: left;
  padding: 7px 12px;
  border-bottom: 1px solid var(--grid);
}
th { color: var(--ink); font-weight: 600; white-space: nowrap; }
td { color: var(--ink-2); }
tbody tr:last-child td { border-bottom: 0; }
picture, img { display: block; max-width: 100%; height: auto; margin: 24px auto; }
blockquote {
  margin: 20px 0;
  padding: 4px 0 4px 18px;
  border-left: 2px solid var(--grid);
  color: var(--muted);
}
footer {
  max-width: 940px;
  margin: 20px auto 0;
  padding: 0 64px;
  color: var(--muted);
  font-size: 12.5px;
}
@media print {
  body { padding: 0; background: #fff; }
  main { border: 0; border-radius: 0; padding: 0; max-width: none; }
  h2 { break-after: avoid; }
  table, picture, img, pre { break-inside: avoid; }
}
@media (max-width: 700px) {
  body { padding: 16px 8px 48px; }
  main { padding: 28px 20px 40px; }
  footer { padding: 0 20px; }
}
`

// Rewrites every local asset URL to a data URI. Anything still pointing at the
// filesystem after this would break the moment the file is moved, so a miss is
// a hard error rather than a silently broken image.
function inlineAssets(html, reportDir) {
  return html.replace(
    /(src|srcset)="(?!data:|https?:)([^"]+)"/g,
    (match, attribute, url) => {
      const file = join(reportDir, decodeURIComponent(url))
      if (!existsSync(file)) {
        throw new Error(`referenced asset not found: ${url}`)
      }
      const type = url.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
      const base64 = readFileSync(file).toString('base64')
      return `${attribute}="data:${type};base64,${base64}"`
    }
  )
}

function exportReport(slug) {
  const reportDir = join(REPORTS, slug)
  const source = join(reportDir, 'REPORT.md')
  if (!existsSync(source)) return null

  const markdown = readFileSync(source, 'utf8')
  const heading = markdown.match(/^#\s+(.+)$/m)
  const title = heading ? heading[1].trim() : slug
  const body = inlineAssets(marked.parse(markdown, { gfm: true }), reportDir)

  const html =
    '<!doctype html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${title}</title>\n` +
    `<style>${CSS}</style>\n` +
    '</head>\n<body>\n<main>\n' +
    body +
    '</main>\n<footer>Self-contained export of ' +
    `reports/${slug}/REPORT.md — regenerate with <code>npm run report:html</code>.</footer>\n` +
    '</body>\n</html>\n'

  const out = join(reportDir, 'REPORT.html')
  writeFileSync(out, html)
  return { slug, out, bytes: Buffer.byteLength(html) }
}

const slugs = readdirSync(REPORTS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const exported = slugs.map(exportReport).filter(Boolean)

if (exported.length === 0) {
  console.error('no reports/*/REPORT.md found')
  process.exit(1)
}
for (const { slug, bytes } of exported) {
  console.log(
    `wrote reports/${slug}/REPORT.html  (${Math.round(bytes / 1024)} KB, self-contained)`
  )
}
