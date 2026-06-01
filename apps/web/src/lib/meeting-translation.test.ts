import { describe, expect, it } from "vitest";
import { looksLikeVietnamese } from "./meeting-translation";

describe("looksLikeVietnamese", () => {
  it("accepts clean Vietnamese (Latin alphabet with diacritics)", () => {
    expect(looksLikeVietnamese("Tốt. Cảm ơn mọi người, chúng ta sẽ nói chuyện sớm.")).toBe(true);
    expect(looksLikeVietnamese("Xin chào, đây là bản dịch tiếng Việt.")).toBe(true);
  });

  it("rejects output that code-switched into Chinese (the qwen failure mode)", () => {
    // Real qwen2.5 output: starts Vietnamese, drifts into Han characters mid-sentence.
    expect(
      looksLikeVietnamese("Tôi sẽ đi kiểm tra con gái四岁，并且看看她是否已经得到了她需要的。"),
    ).toBe(false);
  });

  it("rejects Japanese kana and Korean hangul too", () => {
    expect(looksLikeVietnamese("これは日本語です")).toBe(false);
    expect(looksLikeVietnamese("안녕하세요")).toBe(false);
  });
});
