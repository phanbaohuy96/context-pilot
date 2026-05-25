import { describe, expect, it } from "vitest";
import { sanitizeTeamsHtml, teamsHtmlToText } from "./sanitize";

describe("Teams sanitization", () => {
  it("removes script content and keeps readable text", () => {
    const html = "<p>Hello <strong>team</strong></p><script>alert('x')</script>";

    expect(sanitizeTeamsHtml(html)).not.toContain("script");
    expect(teamsHtmlToText(html)).toContain("Hello team");
  });
});
