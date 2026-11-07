import { z } from "zod/v4";
import type { User } from "@/lib/data";
import type { OAuthScope } from "@/lib/security/types";

/** One MCP tool: a zod input schema, the scope it needs and what it does. */
export interface ToolContext {
  user: User;
  scope: OAuthScope[];
  clientName: string;
}

export interface Tool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  scope: OAuthScope;
  input: S;
  /** Read tools are idempotent; write tools say whether they can destroy or e-mail. */
  destructive?: boolean;
  openWorld?: boolean;
  run(args: z.output<S>, ctx: ToolContext): Promise<unknown>;
}

export const defineTool = <S extends z.ZodObject>(tool: Tool<S>) => tool as unknown as Tool;

/** A mistake the caller can fix (shown to the model as a tool error, not a protocol error). */
export class ToolError extends Error {}

export { z };
