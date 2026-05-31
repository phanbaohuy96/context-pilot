import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { createAiProvider } from "./factory";

describe("createAiProvider", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("constructs CODEX_CLI providers from CODEX_CLI_* config and runs non-interactively", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { end: (input: string) => void };
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = {
        end: () => {
          process.nextTick(() => {
            child.stdout.emit("data", "codex answer");
            child.emit("close", 0);
          });
        },
      };
      child.kill = vi.fn();
      return child;
    });

    const provider = createAiProvider("CODEX_CLI", {
      CODEX_CLI_COMMAND: "codex-dev",
      CODEX_CLI_WORKDIR: "/work/context-pilot",
      CODEX_CLI_MODEL: "gpt-5",
      CODEX_CLI_TIMEOUT_MS: "30000",
    });

    const answer = await provider.answerQuestion({
      question: "What happened?",
      messages: [],
    });

    expect(provider.kind).toBe("CODEX_CLI");
    expect(provider.model).toBe("gpt-5");
    expect(answer.answer).toBe("codex answer");
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0][0]).toBe("codex-dev");
    expect(spawnMock.mock.calls[0][1]).toEqual(expect.arrayContaining([
      "exec",
      "--config",
      'approval_policy="never"',
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "--output-last-message",
      "--cd",
      "/work/context-pilot",
      "--model",
      "gpt-5",
    ]));
    expect(spawnMock.mock.calls[0][2]).toMatchObject({
      cwd: "/work/context-pilot",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(spawnMock.mock.calls[0][1]).not.toContain("--ask-for-approval");
  });
});
