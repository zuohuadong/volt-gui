import { describe, expect, it } from "vitest";

import {
  applySlashCandidate,
  commandDraftQuery,
  isHostCommandLine,
  normalizeCommands,
  parseCommandLine,
  slashCandidates,
  type HostCommand,
} from "./slash-commands";

const commands: HostCommand[] = normalizeCommands([
  { name: "compact", description: "Compact the conversation" },
  { name: "permission", description: "Change permissions", input: { hint: "<preset>", attachments: true } },
  { name: "plan", description: "Enter plan mode", input: "[on|off]" },
  { name: "Plan", description: "duplicate must be dropped" },
  { name: "", description: "invalid" },
  { name: "bad name", description: "invalid" },
  { name: "my_command", description: "official names allow underscores" },
  null,
  "nope",
]);

describe("normalizeCommands", () => {
  it("keeps valid unique names and drops malformed rows", () => {
    expect(commands.map((command) => command.name)).toEqual([
      "compact",
      // 官方命令名语法允许下划线（`dsh-commands` 的 `COMMAND_NAME`）。
      "my_command",
      "permission",
      "plan",
    ]);
    expect(commands.find((command) => command.name === "plan")?.input).toBe("[on|off]");
  });

  it("treats a non-array catalog as empty instead of throwing", () => {
    expect(normalizeCommands(undefined)).toEqual([]);
    expect(normalizeCommands({ commands: [] })).toEqual([]);
  });
});

describe("commandDraftQuery", () => {
  it("opens only for a single-line draft that starts with a slash", () => {
    expect(commandDraftQuery("/pl")).toEqual({ query: "pl" });
    expect(commandDraftQuery("/")).toEqual({ query: "" });
    expect(commandDraftQuery("/plan ")).toBeNull();
    expect(commandDraftQuery("/plan\nnext")).toBeNull();
    expect(commandDraftQuery("see /plan")).toBeNull();
    expect(commandDraftQuery("")).toBeNull();
  });
});

describe("parseCommandLine", () => {
  it("splits the name from the arguments", () => {
    expect(parseCommandLine("/plan")).toEqual({ name: "plan", args: "" });
    expect(parseCommandLine("  /PLAN off ")).toEqual({ name: "plan", args: "off" });
    expect(parseCommandLine("/permission read-only")).toEqual({ name: "permission", args: "read-only" });
  });

  it("rejects text that is not a command line", () => {
    expect(parseCommandLine("plan")).toBeNull();
    expect(parseCommandLine("/1plan")).toBeNull();
    expect(parseCommandLine(`/${"a".repeat(80)}`)).toBeNull();
  });
});

describe("isHostCommandLine", () => {
  it("accepts known commands and leaves unknown slashes as prompts", () => {
    expect(isHostCommandLine("/plan off", commands)).toBe(true);
    expect(isHostCommandLine("/permission", commands)).toBe(true);
    expect(isHostCommandLine("/unknown", commands)).toBe(false);
    expect(isHostCommandLine("plain text", commands)).toBe(false);
  });

  it("does not intercept when the catalog has not loaded yet", () => {
    expect(isHostCommandLine("/plan", [])).toBe(false);
  });
});

describe("slashCandidates", () => {
  const skills = [{ name: "office-docx", description: "Write Word documents" }, { name: "plan", description: "shadowed by host" }];

  it("lists host commands first and lets them shadow same-named skills", () => {
    const result = slashCandidates(commands, skills, "");
    expect(result.map((item) => item.name)).toEqual(["compact", "my_command", "permission", "plan", "office-docx"]);
    expect(result.filter((item) => item.name === "plan")).toHaveLength(1);
    expect(result.find((item) => item.name === "plan")?.kind).toBe("host-command");
  });

  it("filters by name or description and ranks prefix matches first", () => {
    expect(slashCandidates(commands, skills, "pl").map((item) => item.name)).toEqual(["plan"]);
    expect(slashCandidates(commands, skills, "documents").map((item) => item.name)).toEqual(["office-docx"]);
    const ranked = slashCandidates([{ name: "replan" }, { name: "plan" }], [], "plan");
    expect(ranked.map((item) => item.name)).toEqual(["plan", "replan"]);
  });

  it("keeps a trailing space only for commands that take input", () => {
    const [permission, plan] = ["permission", "plan"].map((name) => slashCandidates(commands, [], name)[0]!);
    expect(applySlashCandidate(permission)).toBe("/permission ");
    expect(applySlashCandidate(plan)).toBe("/plan ");
    expect(applySlashCandidate(slashCandidates(commands, [], "compact")[0]!)).toBe("/compact");
  });
});