/**
 * Convert standard Markdown (as produced by LLMs) to Telegram-compatible HTML.
 *
 * Telegram HTML supports: <b>, <i>, <s>, <code>, <pre>, <a href="">,
 * <blockquote>, <tg-spoiler>. Everything else is stripped or kept as text.
 *
 * This is a regex-based converter optimized for LLM output patterns.
 * For edge cases it can't handle, the caller falls back to plain text.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function markdownToTelegramHtml(markdown: string): string {
  let text = markdown;

  // 1. Extract code blocks FIRST to protect their contents from further processing
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
    codeBlocks.push(`<pre><code${langAttr}>${escapeHtml(code.trimEnd())}</code></pre>`);
    return `\x00CODEBLOCK_${idx}\x00`;
  });

  // 2. Extract inline code to protect from further processing
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINE_${idx}\x00`;
  });

  // 3. Now escape HTML entities in the remaining text
  text = escapeHtml(text);

  // 4. Headings: ## Header → bold text
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // 5. Bold + italic: ***text*** → bold italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>");

  // 6. Bold: **text** → <b>
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

  // 7. Italic: *text* → <i> (but not inside words like file*name)
  text = text.replace(/(?<!\w)\*([^\s*](?:[^*]*[^\s*])?)\*(?!\w)/g, "<i>$1</i>");

  // 8. Strikethrough: ~~text~~ → <s>
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // 9. Links: [text](url) → <a href="url">text</a>
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, linkText, url) =>
      `<a href="${url.replace(/&amp;/g, "&")}">${linkText}</a>`
  );

  // 10. Unordered lists: - item or * item → • item
  text = text.replace(/^[\s]*[-*]\s+/gm, "• ");

  // 11. Ordered lists: 1. item → 1. item (keep as-is, they look fine)

  // 12. Blockquotes: > text → blockquote
  // Collect consecutive > lines into one blockquote
  text = text.replace(
    /(?:^&gt;\s?(.*)$\n?)+/gm,
    (match) => {
      const lines = match
        .split("\n")
        .filter((l) => l.startsWith("&gt;"))
        .map((l) => l.replace(/^&gt;\s?/, ""))
        .join("\n");
      return `<blockquote>${lines}</blockquote>\n`;
    }
  );

  // 13. Horizontal rules: --- or *** → simple line
  text = text.replace(/^(---|\*\*\*|___)$/gm, "───────────────");

  // 14. Restore code blocks and inline codes
  text = text.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_match, idx) => codeBlocks[Number(idx)]!);
  text = text.replace(/\x00INLINE_(\d+)\x00/g, (_match, idx) => inlineCodes[Number(idx)]!);

  // 15. Clean up excessive blank lines (max 2 consecutive)
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
