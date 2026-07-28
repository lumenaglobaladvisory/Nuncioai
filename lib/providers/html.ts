const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&ndash;": "-",
  "&mdash;": "-",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
};

/** Strips tags/style/script blocks and decodes common HTML entities, for providers that only give us an HTML body. */
export function stripHtml(html: string): string {
  const withoutTags = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? m);
  return decoded.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** True if a string that's supposed to be plain text actually still contains markup (some senders generate broken text/plain parts). */
export function looksLikeMarkup(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}
