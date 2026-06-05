import { createAiProvider, promptVersion } from "@context-pilot/ai";
import type { PreparedMeetingContext } from "@context-pilot/core";
import { prisma, resolveTenantAiProviderConfig } from "@context-pilot/db";
import type { AiProviderKind } from "@prisma/client";

const MAX_CONTEXT_CHARS = 60000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values",
  "text/xml",
]);

export type MeetingContextDraft = {
  sourceText: string;
  sourceFileName?: string;
  sourceMimeType?: string;
};

export type MeetingContextPreparation = PreparedMeetingContext & {
  provider?: AiProviderKind;
  model?: string;
  promptVersion?: string;
};

export async function meetingContextDraftFromFormData(formData: FormData): Promise<MeetingContextDraft | undefined> {
  const text = stringValue(formData.get("contextText"));
  const file = formData.get("contextFile");
  const fileDraft = file instanceof File && file.size > 0 ? await extractMeetingContextFile(file) : undefined;
  const sourceText = [text, fileDraft?.sourceText].filter(Boolean).join("\n\n").trim();
  if (!sourceText) {
    return undefined;
  }

  return {
    sourceText: truncateContext(sourceText),
    sourceFileName: fileDraft?.sourceFileName,
    sourceMimeType: fileDraft?.sourceMimeType,
  };
}

export async function meetingContextDraftFromJson(input: { contextText?: string }): Promise<MeetingContextDraft | undefined> {
  const sourceText = input.contextText?.trim();
  return sourceText ? { sourceText: truncateContext(sourceText) } : undefined;
}

export async function prepareMeetingContext(input: {
  tenantId: string;
  title: string;
  draft?: MeetingContextDraft;
}): Promise<MeetingContextPreparation | undefined> {
  if (!input.draft?.sourceText.trim()) {
    return undefined;
  }
  try {
    const resolvedProvider = await resolveTenantAiProviderConfig(prisma, input.tenantId, "MEETING_NOTES");
    const provider = createAiProvider(resolvedProvider.providerKind, resolvedProvider.providerConfig);
    const prepared = await provider.prepareMeetingContext({
      title: input.title,
      contextText: input.draft.sourceText,
    });
    return {
      briefing: prepared.briefing,
      agendaItems: prepared.agendaItems,
      openQuestions: prepared.openQuestions,
      risks: prepared.risks,
      keywords: prepared.keywords,
      provider: provider.kind,
      model: prepared.model,
      promptVersion,
    };
  } catch (error) {
    console.error("meeting context preparation failed:", error);
    return {
      briefing: "",
      agendaItems: [],
      openQuestions: [],
      risks: [],
      keywords: [],
    };
  }
}

export async function createMeetingContext(input: {
  meetingSessionId: string;
  draft?: MeetingContextDraft;
  prepared?: MeetingContextPreparation;
}): Promise<void> {
  if (!input.draft?.sourceText.trim()) {
    return;
  }
  await prisma.meetingContext.create({
    data: {
      meetingSessionId: input.meetingSessionId,
      sourceText: input.draft.sourceText,
      sourceFileName: input.draft.sourceFileName,
      sourceMimeType: input.draft.sourceMimeType,
      briefing: input.prepared?.briefing ?? "",
      agendaItems: input.prepared?.agendaItems ?? [],
      openQuestions: input.prepared?.openQuestions ?? [],
      risks: input.prepared?.risks ?? [],
      keywords: input.prepared?.keywords ?? [],
      provider: input.prepared?.provider,
      model: input.prepared?.model,
      promptVersion: input.prepared?.promptVersion,
    },
  });
}

export function preparedContextFromRecord(context: {
  briefing: string;
  agendaItems: string[];
  openQuestions: string[];
  risks: string[];
  keywords: string[];
} | null | undefined): PreparedMeetingContext | undefined {
  if (!context) {
    return undefined;
  }
  if (!context.briefing && !context.agendaItems.length && !context.openQuestions.length && !context.risks.length && !context.keywords.length) {
    return undefined;
  }
  return {
    briefing: context.briefing,
    agendaItems: context.agendaItems,
    openQuestions: context.openQuestions,
    risks: context.risks,
    keywords: context.keywords,
  };
}

async function extractMeetingContextFile(file: File): Promise<MeetingContextDraft> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Agenda/context file must be 8 MB or smaller.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = normalizedUploadMimeType(file.type, file.name);
  const sourceText = mimeType === "application/pdf"
    ? await extractPdfText(bytes)
    : extractPlainText(bytes, mimeType);
  const normalized = truncateContext(sourceText);
  if (!normalized) {
    throw new Error("Agenda/context file did not contain extractable text.");
  }

  return {
    sourceText: normalized,
    sourceFileName: file.name,
    sourceMimeType: mimeType,
  };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return normalizeContextText(result.text);
  } finally {
    await parser.destroy();
  }
}

function extractPlainText(bytes: Uint8Array, mimeType: string): string {
  if (!TEXT_MIME_TYPES.has(mimeType) && !mimeType.startsWith("text/")) {
    throw new Error("Agenda/context file must be a PDF or UTF-8 text file.");
  }
  return normalizeContextText(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
}

function mimeTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".txt") || lower.endsWith(".log")) {
    return "text/plain";
  }
  if (lower.endsWith(".md")) {
    return "text/markdown";
  }
  if (lower.endsWith(".csv")) {
    return "text/csv";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".xml")) {
    return "application/xml";
  }
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function normalizedUploadMimeType(mimeType: string, fileName: string): string {
  if (!mimeType || mimeType === "application/octet-stream") {
    return mimeTypeFromName(fileName);
  }
  return mimeType;
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function truncateContext(value: string): string {
  return normalizeContextText(value).slice(0, MAX_CONTEXT_CHARS);
}

function normalizeContextText(value: string): string {
  return value.replaceAll(/\u0000/g, "").replaceAll(/[ \t]+\n/g, "\n").replaceAll(/\n{3,}/g, "\n\n").trim();
}
