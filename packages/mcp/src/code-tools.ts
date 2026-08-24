import { readFile as fsReadFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { ToolError } from "@aegis/shared";
import { z } from "zod";
import { defineTool, type AnyTool, type ToolContext } from "./tool.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"]);
const MAX_FILES = 200;
const MAX_READ_BYTES = 64 * 1024;

function codeRoot(ctx: ToolContext): string {
  if (!ctx.codeRoot) {
    throw new ToolError("Code root is not configured", {});
  }
  return resolve(ctx.codeRoot);
}

/** Resolve a caller-supplied relative path inside the jail; reject traversal. */
function resolveInRoot(root: string, rel: string): string {
  if (rel.includes("\0")) throw new ToolError("Invalid path", { rel });
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new ToolError("Path escapes the code root", { rel });
  }
  return abs;
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  if (out.length >= MAX_FILES) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (out.length >= MAX_FILES) return;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(root, join(dir, e.name), out);
    } else if (e.isFile()) {
      out.push(relative(root, join(dir, e.name)).split(sep).join("/"));
    }
  }
}

const listTool = defineTool({
  name: "listRelevantFiles",
  description: "List files in the code fixture (jailed, read-only).",
  inputSchema: z.object({
    subdir: z.string().optional(),
    limit: z.number().int().positive().max(MAX_FILES).optional(),
  }),
  outputSchema: z.object({ files: z.array(z.string()) }),
  handler: async (input, ctx) => {
    const root = codeRoot(ctx);
    const start = input.subdir ? resolveInRoot(root, input.subdir) : root;
    const files: string[] = [];
    await walk(root, start, files);
    return { files: files.slice(0, input.limit ?? MAX_FILES) };
  },
});

const readTool = defineTool({
  name: "readFile",
  description: "Read a file from the code fixture (jailed, bounded).",
  inputSchema: z.object({
    path: z.string().min(1),
    maxBytes: z.number().int().positive().max(MAX_READ_BYTES).optional(),
  }),
  outputSchema: z.object({
    path: z.string(),
    content: z.string(),
    truncated: z.boolean(),
  }),
  handler: async (input, ctx) => {
    const root = codeRoot(ctx);
    const abs = resolveInRoot(root, input.path);
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) {
      throw new ToolError("File not found", { path: input.path });
    }
    const cap = input.maxBytes ?? MAX_READ_BYTES;
    const buf = await fsReadFile(abs);
    const truncated = buf.byteLength > cap;
    return {
      path: relative(root, abs).split(sep).join("/"),
      content: buf.subarray(0, cap).toString("utf8"),
      truncated,
    };
  },
});

const searchTool = defineTool({
  name: "searchCode",
  description: "Search the code fixture for a substring (case-insensitive).",
  inputSchema: z.object({
    query: z.string().min(1),
    limit: z.number().int().positive().max(100).optional(),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({ file: z.string(), line: z.number(), text: z.string() }),
    ),
  }),
  handler: async (input, ctx) => {
    const root = codeRoot(ctx);
    const files: string[] = [];
    await walk(root, root, files);
    const needle = input.query.toLowerCase();
    const limit = input.limit ?? 50;
    const matches: { file: string; line: number; text: string }[] = [];
    for (const f of files) {
      if (matches.length >= limit) break;
      const abs = join(root, f);
      const info = await stat(abs).catch(() => null);
      if (!info || info.size > MAX_READ_BYTES) continue;
      const content = await fsReadFile(abs, "utf8").catch(() => "");
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < limit; i++) {
        if (lines[i]!.toLowerCase().includes(needle)) {
          matches.push({ file: f, line: i + 1, text: lines[i]!.trim().slice(0, 300) });
        }
      }
    }
    return { matches };
  },
});

const changesTool = defineTool({
  name: "inspectRecentChanges",
  description: "Read the fixture's recent-change log (CHANGELOG.md) if present.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    changelog: z.string().nullable(),
    latestEntry: z.string().nullable(),
  }),
  handler: async (_input, ctx) => {
    const root = codeRoot(ctx);
    const abs = join(root, "CHANGELOG.md");
    const info = await stat(abs).catch(() => null);
    if (!info || !info.isFile()) return { changelog: null, latestEntry: null };
    const content = (await fsReadFile(abs, "utf8")).slice(0, MAX_READ_BYTES);
    const sections = content.split(/\n(?=## )/);
    return { changelog: content, latestEntry: sections[1]?.trim() ?? null };
  },
});

export const codeTools: AnyTool[] = [listTool, readTool, searchTool, changesTool];
