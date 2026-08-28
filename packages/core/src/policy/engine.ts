import { commandFromArgs, pathFromArgs, toolMeta } from "../tools/catalog.js";
import { commandMatches, globMatch } from "./glob.js";
import { classifyCommand } from "./shell.js";
import type { Policy, PolicyDecision, RiskTier } from "./types.js";

export function evaluateToolCall(policy: Policy, name: string, args: unknown): PolicyDecision {
  const meta = toolMeta(name);
  const relPath = pathFromArgs(name, args);

  if (relPath && policy.denyPaths.some((pattern) => globMatch(pattern, relPath))) {
    return { action: "deny", ruleId: "deny-path", tier: "high", reason: `${relPath} is a denied path` };
  }
  if (meta.mutates && relPath && policy.protectedWrite.some((pattern) => globMatch(pattern, relPath))) {
    return {
      action: "deny",
      ruleId: "protected-write",
      tier: "destructive",
      reason: `${relPath} is protected and cannot be written`,
    };
  }

  let tier: RiskTier = meta.class === "read" ? "safe" : meta.class === "edit" ? "low" : "high";
  const command = name === "terminal" ? commandFromArgs(args) : undefined;
  if (command !== undefined) {
    if (policy.denyCommands.some((pattern) => commandMatches(pattern, command))) {
      return { action: "deny", ruleId: "deny-command", tier: "destructive", reason: "Command matches a deny rule" };
    }
    const classified = classifyCommand(command);
    tier = classified.tier === "safe" ? "low" : classified.tier;
    if (classified.tier !== "destructive" && policy.allowCommands.some((pattern) => commandMatches(pattern, command))) {
      tier = "safe";
    }
    if (classified.segments.some((seg) => policy.denyCommands.some((pattern) => commandMatches(pattern, seg.raw)))) {
      return { action: "deny", ruleId: "deny-command-segment", tier: "destructive", reason: "A pipeline segment is denied" };
    }
  }

  if (tier === "destructive") {
    return { action: "ask", ruleId: "destructive", tier };
  }

  if (policy.autonomy === "manual") {
    return { action: "ask", ruleId: "manual", tier };
  }
  if (policy.autonomy === "guarded") {
    if (tier === "safe") return { action: "allow", ruleId: "guarded-safe", tier };
    return { action: "ask", ruleId: "guarded-prompt", tier };
  }
  return { action: "allow", ruleId: "autonomous", tier };
}
