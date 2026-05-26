import { spawn } from "node:child_process";
import type { AgentAnswer, AgentContextBundle, MeetingNotesContext } from "@teams-observer/core";
import { buildAnswerPrompt } from "../prompts/answer";
import { buildMeetingNotesPrompt } from "../prompts/meeting-notes";
import { buildRequirementsPrompt } from "../prompts/requirements";
import { buildSummarizePrompt } from "../prompts/summarize";
import { parseMeetingNotes, parseRequirementExtraction } from "../json";
import type { AiProvider, MeetingNotesResult, RequirementExtractionResult, ThreadSummaryResult } from "../provider";

export type ClaudeCodeCliProviderConfig = {
  command: string;
  cwd?: string;
  timeoutMs: number;
  model?: string;
};

export class ClaudeCodeCliProvider implements AiProvider {
  readonly kind = "CLAUDE_CODE_CLI" as const;
  readonly model: string;

  constructor(private readonly config: ClaudeCodeCliProviderConfig) {
    this.model = config.model ?? "local-claude-code-cli";
  }

  async summarizeThread(input: AgentContextBundle): Promise<ThreadSummaryResult> {
    const summary = await this.runClaude(buildSummarizePrompt(input));
    return {
      summary,
      evidenceMessageIds: input.messages.map((message) => message.id),
      model: this.model,
    };
  }

  async extractRequirements(input: AgentContextBundle): Promise<RequirementExtractionResult> {
    const text = await this.runClaude(buildRequirementsPrompt(input));
    const parsed = parseRequirementExtraction(text);
    return {
      requirements: parsed.requirements,
      model: this.model,
    };
  }

  async answerQuestion(input: AgentContextBundle & { question: string }): Promise<AgentAnswer> {
    const answer = await this.runClaude(buildAnswerPrompt(input));
    return {
      answer,
      evidenceMessageIds: input.messages.map((message) => message.id),
      model: this.model,
    };
  }

  async summarizeMeeting(input: MeetingNotesContext): Promise<MeetingNotesResult> {
    const text = await this.runClaude(buildMeetingNotesPrompt(input));
    const parsed = parseMeetingNotes(text);
    return { ...parsed, model: this.model };
  }

  private runClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.command, ["-p", prompt], {
        cwd: this.config.cwd || process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Claude Code CLI timed out after ${this.config.timeoutMs}ms.`));
      }, this.config.timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Claude Code CLI exited with ${code}: ${stderr}`));
          return;
        }

        resolve(stdout.trim());
      });
    });
  }
}
