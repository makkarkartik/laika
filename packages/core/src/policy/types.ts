export type ToolClass = "read" | "edit" | "execute" | "network" | "mcp";
export type RiskTier = "safe" | "low" | "high" | "destructive";
export type Autonomy = "manual" | "guarded" | "autonomous";

export type Policy = {
  autonomy: Autonomy;
  allowCommands: string[];
  denyCommands: string[];
  denyPaths: string[];
  protectedWrite: string[];
};

export type PolicyDecision =
  | { action: "allow"; ruleId: string; tier: RiskTier }
  | { action: "ask"; ruleId: string; tier: RiskTier }
  | { action: "deny"; ruleId: string; tier: RiskTier; reason: string };

export type ApprovalRequest = {
  id: string;
  tool: string;
  summary: string;
  tier: RiskTier;
  ruleId: string;
};
