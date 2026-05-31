import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentAnswer, AgentContextBundle, MeetingNotesContext } from "@context-pilot/core";
import { parseMeetingNotes, parseRequirementExtraction } from "../json";
import { buildAnswerPrompt } from "../prompts/answer";
import { buildMeetingNotesPrompt } from "../prompts/meeting-notes";
import { buildRequirementsPrompt } from "../prompts/requirements";
import { buildSummarizePrompt } from "../prompts/summarize";
import type { AiProvider, MeetingNotesResult, RequirementExtractionResult, ThreadSummaryResult } from "../provider";

export type CodexCliProviderConfig = {
  command: string;
  cwd?: string;
  timeoutMs: number;
  model?: string;
};

export class CodexCliProvider implements AiProvider {
  readonly kind = "CODEX_CLI" as const;
  readonly model: string;

  constructor(private readonly config: CodexCliProviderConfig) {
    this.model = config.model ?? "codex-cli";
  }

  async summarizeThread(input: AgentContextBundle): Promise<ThreadSummaryResult> {
    const summary = await this.runCodex(buildSummarizePrompt(input));
    return {
      summary,
      evidenceMessageIds: input.messages.map((message) => message.id),
      model: this.model,
    };
  }

  async extractRequirements(input: AgentContextBundle): Promise<RequirementExtractionResult> {
    const text = await this.runCodex(buildRequirementsPrompt(input));
    const parsed = parseRequirementExtraction(text);
    return {
      requirements: parsed.requirements,
      model: this.model,
    };
  }

  async answerQuestion(input: AgentContextBundle & { question: string }): Promise<AgentAnswer> {
    const answer = await this.runCodex(buildAnswerPrompt(input));
    return {
      answer,
      evidenceMessageIds: input.messages.map((message) => message.id),
      model: this.model,
    };
  }

  async summarizeMeeting(input: MeetingNotesContext): Promise<MeetingNotesResult> {
    const text = await this.runCodex(buildMeetingNotesPrompt(input));
    const parsed = parseMeetingNotes(text);
    return { ...parsed, model: this.model };
  }

  private async runCodex(prompt: string): Promise<string> {
    const outputDir = await mkdtemp(path.join(tmpdir(), "context-pilot-codex-"));
    const outputPath = path.join(outputDir, "last-message.txt");
    try {
      return await new Promise<string>((resolve, reject) => {
        const args = [
          "exec",
          "--config",
          'approval_policy="never"',
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "--ephemeral",
          "--output-last-message",
          outputPath,
        ];
        if (this.config.cwd) {
          args.push("--cd", this.config.cwd);
        }
        if (this.config.model) {
          args.push("--model", this.config.model);
        }

        const child = spawn(this.config.command, args, {
          cwd: this.config.cwd || process.cwd(),
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`Codex CLI timed out after ${this.config.timeoutMs}ms.`));
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

        child.on("close", async (code) => {
          clearTimeout(timeout);
          if (code !== 0) {
            reject(new Error(`Codex CLI exited with ${code}: ${stderr}`));
            return;
          }

          try {
            const lastMessage = await readFile(outputPath, "utf8");
            resolve(lastMessage.trim() || stdout.trim());
          } catch {
            resolve(stdout.trim());
          }
        });

        child.stdin.end(prompt);
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  }
}
