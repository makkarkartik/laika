import type { TaskKind } from "./types.js";

const QUESTION = /^(what|why|how|where|who|when|which|explain|is |are |does |do |can you explain|summarize)\b/i;
const MULTI = /\b(implement|refactor|migrate|overhaul|redesign|introduce|build out)\b/i;
const EDIT = /\b(add|fix|update|change|edit|delete|remove|rename|write|create|patch|replace)\b/i;

export function classifyTask(text: string): TaskKind {
  const trimmed = text.trim();
  if (MULTI.test(trimmed) || (trimmed.length > 500 && EDIT.test(trimmed))) return "multi-step";
  if (QUESTION.test(trimmed) && !EDIT.test(trimmed) && trimmed.length < 320) return "question";
  if (EDIT.test(trimmed)) return "edit";
  return trimmed.length > 400 ? "multi-step" : "question";
}
