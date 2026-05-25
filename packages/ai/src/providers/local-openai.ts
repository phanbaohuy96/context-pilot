import type { AgentAnswer, AgentContextBundle } from "@teams-observer/core";
import { buildAnswerPrompt } from "../prompts/answer";
import { buildRequirementsPrompt } from "../prompts/requirements";
import { buildSummarizePrompt } from "../prompts/summarize";
import { parseRequirementExtraction } from "../json";
import type { AiProvider, RequirementExtractionResult, ThreadSummaryResult } from "../provider";

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
