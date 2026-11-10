import "server-only";
import { wsConfigured } from "@/lib/ws/db";
import type { OAuthScope } from "@/lib/security/types";
import type { Tool } from "../tool";
import { academyTools } from "./academy";
import { pipelineTools } from "./pipeline";
import { summaryTools } from "./summaries";
import { weddingTools } from "./wedding";

/** Every tool, for the overview on /beheer/profiel. */
export function allTools(): Tool[] {
  return [...academyTools, ...(wsConfigured() ? [...weddingTools, ...summaryTools, ...pipelineTools] : [])];
}

/** The tools this connection may use: write tools only with the write scope. */
export function availableTools(scope: OAuthScope[]): Tool[] {
  return allTools().filter((t) => scope.includes(t.scope));
}
