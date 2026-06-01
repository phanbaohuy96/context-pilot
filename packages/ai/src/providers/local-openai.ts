import type {
  AgentAnswer,
  AgentContextBundle,
  MeetingNotesContext,
  TranscriptCorrectionContext,
  TranslationContext,
} from "@context-pilot/core";
import { buildAnswerPrompt } from "../prompts/answer";
import { buildMeetingNotesPrompt } from "../prompts/meeting-notes";
import { buildRequirementsPrompt } from "../prompts/requirements";
import { buildSummarizePrompt } from "../prompts/summarize";
import { buildTranscriptCorrectionPrompt } from "../prompts/transcript-correction";
import { buildTranslatePrompt } from "../prompts/translate";
import { parseMeetingNotes, parseRequirementExtraction, parseTranscriptCorrection, parseTranslation } from "../json";
import type {
  AiProvider,
  MeetingNotesResult,
  RequirementExtractionResult,
  ThreadSummaryResult,
  TranscriptCorrectionResult,
  TranslationResult,
} from "../provider";

export type LocalOpenAiProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

export class LocalOpenAiProvider implements AiProvider {
  readonly kind = "LOCAL_OPENAI" as const;
  readonly model: string;

  constructor(private readonly config: LocalOpenAiProviderConfig) {
    this.model = config.model;
  }

  async summarizeThread(input: AgentContextBundle): Promise<ThreadSummaryResult> {
    const summary = await this.complete(buildSummarizePrompt(input));
    return {
      summary,
      evidenceMessageIds: input.messages.map((message) => message.id),
      model: this.model,
    };
  }

  async extractRequirements(input: AgentContextBundle): Promise<RequirementExtractionResult> {
    const text = await this.complete(buildRequirementsPrompt(input), { json: true });
    const parsed = parseRequirementExtraction(text);
    return {
      requirements: parsed.requirements,
      model: this.model,
    };
  }

  async answerQuestion(input: AgentContextBundle & { question: string }): Promise<AgentAnswer> {
    const answer = await this.complete(buildAnswerPrompt(input));
    return {
      answer,
      evidenceMessageIds: input.messages.map((message) => message.id),
      model: this.model,
    };
  }

  async summarizeMeeting(input: MeetingNotesContext): Promise<MeetingNotesResult> {
    const text = await this.complete(buildMeetingNotesPrompt(input), { json: true });
    const parsed = parseMeetingNotes(text);
    return { ...parsed, model: this.model };
  }

  async correctTranscript(input: TranscriptCorrectionContext): Promise<TranscriptCorrectionResult> {
    const text = await this.complete(buildTranscriptCorrectionPrompt(input), { json: true });
    return { ...parseTranscriptCorrection(text), model: this.model };
  }

  async translateText(input: TranslationContext): Promise<TranslationResult> {
    const text = await this.complete(buildTranslatePrompt(input), { json: true });
    return { ...parseTranslation(text), model: this.model };
  }

  private async complete(prompt: string, options: { json?: boolean } = {}): Promise<string> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: options.json ? { type: "json_object" } : undefined,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Local AI request failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Local AI response did not include message content.");
    }

    return content.trim();
  }
}
