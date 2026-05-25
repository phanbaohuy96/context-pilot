import sanitizeHtml from "sanitize-html";

const allowedTags = ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "a", "blockquote", "code"];

export function sanitizeTeamsHtml(html: string | null | undefined): string {
  if (!html) {
    return "";
  }

  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "name", "target"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

export function teamsHtmlToText(html: string | null | undefined): string {
  const safeHtml = sanitizeTeamsHtml(html);
  return safeHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
