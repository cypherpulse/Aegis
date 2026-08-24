import { ToolError, ValidationError } from "@aegis/shared";
import type { BlockchainProvider } from "@aegis/blockchain";
import { z } from "zod";

/** Everything a tool handler may touch. Read-only by construction. */
export interface ToolContext {
  provider: BlockchainProvider;
  /** Absolute path to the code fixture the code tools are jailed to (§14/§15). */
  codeRoot?: string;
}

export interface ToolDefinition<
  I extends z.ZodObject<z.ZodRawShape>,
  O extends z.ZodTypeAny,
> {
  name: string;
  description: string;
  /** Phase 1 tools are always read-only (spec §10, §22). */
  readonly readOnly: true;
  /** Sensitive tools trigger a human-in-the-loop approval gate before running. */
  sensitive: boolean;
  inputSchema: I;
  outputSchema: O;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O>>;
}

/**
 * Type-erased tool for heterogeneous storage/registration. `input` is `any`
 * because the concrete input type is recovered at the call site via the tool's
 * own `inputSchema` (which is validated before the handler runs).
 */
export interface AnyTool {
  name: string;
  description: string;
  readonly readOnly: true;
  sensitive: boolean;
  inputSchema: z.AnyZodObject;
  outputSchema: z.ZodTypeAny;
  handler: (input: never, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<
  I extends z.ZodObject<z.ZodRawShape>,
  O extends z.ZodTypeAny,
>(def: {
  name: string;
  description: string;
  sensitive?: boolean;
  inputSchema: I;
  outputSchema: O;
  handler: (input: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O>>;
}): ToolDefinition<I, O> {
  return {
    name: def.name,
    description: def.description,
    readOnly: true,
    sensitive: def.sensitive ?? false,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    handler: def.handler,
  };
}

export interface ToolCallResult {
  output: unknown;
  durationMs: number;
}

/**
 * Validate input, run the handler, validate output. Any failure is surfaced as
 * a typed error — arbitrary tool input never reaches a handler unvalidated, and
 * malformed handler output never propagates (spec §10, §21).
 */
export async function callTool(
  tool: AnyTool,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const parsedInput = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsedInput.success) {
    throw new ValidationError(`Invalid input for tool "${tool.name}"`, {
      tool: tool.name,
      issues: parsedInput.error.issues,
    });
  }

  const started = Date.now();
  let output: unknown;
  try {
    // Input is validated above; the concrete type is enforced by inputSchema.
    output = await tool.handler(parsedInput.data as never, ctx);
  } catch (err) {
    throw new ToolError(`Tool "${tool.name}" failed to execute`, {
      tool: tool.name,
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  const parsedOutput = tool.outputSchema.safeParse(output);
  if (!parsedOutput.success) {
    throw new ToolError(`Tool "${tool.name}" returned malformed output`, {
      tool: tool.name,
      issues: parsedOutput.error.issues,
    });
  }

  return { output: parsedOutput.data, durationMs: Date.now() - started };
}

export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: AnyTool[]): void {
    for (const t of tools) this.register(t);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): AnyTool {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolError(`Unknown tool: ${name}`, { tool: name });
    return tool;
  }

  list(): AnyTool[] {
    return [...this.tools.values()];
  }
}
