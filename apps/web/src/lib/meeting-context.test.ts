import { describe, expect, it, vi } from "vitest";
import { meetingContextDraftFromFormData, meetingContextDraftFromJson } from "./meeting-context";

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    constructor(readonly input: { data: Uint8Array }) {}
    async getText(): Promise<{ text: string }> {
      return { text: `PDF bytes: ${this.input.data.byteLength}` };
    }
    async destroy(): Promise<void> {}
  },
}));

describe("meeting context extraction", () => {
  it("combines pasted context and a UTF-8 text file", async () => {
    const formData = new FormData();
    formData.set("contextText", "Discuss launch readiness.");
    formData.set("contextFile", new File(["Agenda\n- QA\n- rollout"], "agenda.md", { type: "text/markdown" }));

    await expect(meetingContextDraftFromFormData(formData)).resolves.toMatchObject({
      sourceText: "Discuss launch readiness.\n\nAgenda\n- QA\n- rollout",
      sourceFileName: "agenda.md",
      sourceMimeType: "text/markdown",
    });
  });

  it("rejects unsupported binary-looking files", async () => {
    const formData = new FormData();
    formData.set("contextFile", new File([new Uint8Array([0, 1, 2])], "agenda.bin", { type: "" }));

    await expect(meetingContextDraftFromFormData(formData)).rejects.toThrow("PDF or UTF-8 text");
  });

  it("uses the filename extension when an allowed text file uploads as octet-stream", async () => {
    const formData = new FormData();
    formData.set("contextFile", new File(["Agenda\n- QA"], "agenda.md", { type: "application/octet-stream" }));

    await expect(meetingContextDraftFromFormData(formData)).resolves.toMatchObject({
      sourceText: "Agenda\n- QA",
      sourceFileName: "agenda.md",
      sourceMimeType: "text/markdown",
    });
  });

  it("extracts PDF text through the server-only parser dependency", async () => {
    const formData = new FormData();
    formData.set("contextFile", new File([new Uint8Array([1, 2, 3, 4])], "agenda.pdf", { type: "application/pdf" }));

    await expect(meetingContextDraftFromFormData(formData)).resolves.toMatchObject({
      sourceText: "PDF bytes: 4",
      sourceFileName: "agenda.pdf",
      sourceMimeType: "application/pdf",
    });
  });

  it("accepts JSON text context without a file", async () => {
    await expect(meetingContextDraftFromJson({ contextText: "Agenda: pricing" })).resolves.toEqual({
      sourceText: "Agenda: pricing",
    });
  });
});
