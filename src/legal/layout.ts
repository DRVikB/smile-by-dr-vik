/** Shared HTML shell for the generated legal pages (static, no scripts). */
export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A placeholder the owner or their lawyer must resolve. Release builds refuse pages containing these. */
export const required = (label: string) => `<span data-required>[${escapeHtml(label)}]</span>`;

/** A configured value, or a marked placeholder when missing. */
export const valueOr = (value: string, label: string) => (value ? escapeHtml(value) : required(`${label} — OWNER DECISION REQUIRED`));

export function legalPage(title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)} · SmileCompose</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: light dark; --ivory: #FAF9F6; --stone: #E6DED4; --taupe: #A08F7E; --charcoal: #3C3C3C; --gold: #D4B583; --card: #fff; --note: #fff3d6; --muted: #8A7B6C; }
  @media (prefers-color-scheme: dark) {
    :root { --ivory: #141312; --stone: rgba(236, 226, 212, .14); --taupe: #B8AD9F; --charcoal: #F2EDE6; --gold: #C8A76E; --card: #1E1C1A; --note: rgba(200, 167, 110, .16); --muted: #B8AD9F; }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--ivory); color: var(--charcoal); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: max(28px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(40px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); }
  .wordmark { letter-spacing: .28em; font-size: 13px; color: var(--taupe); margin: 0 0 18px; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 32px; line-height: 1.15; margin: 0 0 6px; }
  h2 { font-size: 18px; margin: 32px 0 8px; }
  h3 { font-size: 16px; margin: 20px 0 6px; }
  p, li { margin: 0 0 10px; }
  ul { padding-left: 20px; }
  .meta { color: var(--taupe); font-size: 14px; margin-bottom: 26px; }
  .summary, .draft { border-radius: 16px; padding: 16px 18px; margin-bottom: 20px; }
  .summary { background: var(--card); border: 1px solid var(--stone); }
  .draft { background: var(--note); border: 1px solid var(--gold); font-weight: 500; }
  [data-required] { background: var(--note); border-bottom: 2px solid var(--gold); padding: 0 3px; }
  a { color: var(--charcoal); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 8px 0 12px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 6px; border-bottom: 1px solid var(--stone); }
</style>
</head>
<body>
<main>
<p class="wordmark">SMILECOMPOSE</p>
${body}
</main>
</body>
</html>
`;
}
