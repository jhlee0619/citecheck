#!/usr/bin/env node
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import {
  analyzeReferences,
  applyReferenceRewrite,
  planReferenceRewrite,
  repairPaper,
  renderRepairPaperResult,
  scanWorkspace
} from "./index.js";

const SERVER_NAME = "citecheck-mcp";
const SERVER_VERSION = "0.1.12";

const repairPaperSchema = {
  target_path: z.string().describe("Path to the paper file or project folder to inspect."),
  mode: z.enum(["review", "replacement"]).optional().default("review").describe("Review findings first or attempt replacement-safe output."),
  output_format: z.enum(["json", "bibtex", "numbered", "markdown", "enw"]).optional().default("json").describe("Preferred citecheck output format."),
  policy: z.enum(["default", "strict", "lenient"]).optional().describe("Batch policy preset."),
  fixture_mode: z.enum(["off", "prefer", "only"]).optional().describe("Fixture replay mode."),
  fixture_manifest: z.string().optional().describe("Optional fixture manifest path.")
};

const scanWorkspaceSchema = {
  target_path: z.string().describe("Path to the project folder or paper file to inspect.")
};

const analyzeReferencesSchema = {
  ...repairPaperSchema,
  mode: z.enum(["review", "replacement"]).optional().default("review").describe("Analysis mode, usually review.")
};

const planReferenceRewriteSchema = {
  target_path: z.string().describe("Path to the paper file or project folder to inspect."),
  policy: z.enum(["default", "strict", "lenient"]).optional().describe("Batch policy preset."),
  fixture_mode: z.enum(["off", "prefer", "only"]).optional().describe("Fixture replay mode."),
  fixture_manifest: z.string().optional().describe("Optional fixture manifest path."),
  write_mode: z.enum(["preview", "sidecar", "replace"]).optional().default("preview").describe("How the rewrite should be prepared.")
};

const applyReferenceRewriteSchema = {
  target_path: z.string().describe("Path to the paper file or project folder to inspect."),
  policy: z.enum(["default", "strict", "lenient"]).optional().describe("Batch policy preset."),
  fixture_mode: z.enum(["off", "prefer", "only"]).optional().describe("Fixture replay mode."),
  fixture_manifest: z.string().optional().describe("Optional fixture manifest path."),
  write_mode: z.enum(["sidecar", "replace"]).optional().default("sidecar").describe("How to apply the rewrite plan."),
  remove_unresolved: z.boolean().optional().default(false).describe("Remove unresolved/not_checked entries and their citations from paper files.")
};

type RepairPaperToolArgs = z.output<z.ZodObject<typeof repairPaperSchema>>;
type ScanWorkspaceToolArgs = z.output<z.ZodObject<typeof scanWorkspaceSchema>>;
type AnalyzeReferencesToolArgs = z.output<z.ZodObject<typeof analyzeReferencesSchema>>;
type PlanReferenceRewriteToolArgs = z.output<z.ZodObject<typeof planReferenceRewriteSchema>>;
type ApplyReferenceRewriteToolArgs = z.output<z.ZodObject<typeof applyReferenceRewriteSchema>>;

interface ToolTextResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export async function callRepairPaperTool(args: RepairPaperToolArgs): Promise<ToolTextResult> {
  try {
    const payload = await repairPaper(args.target_path, {
      mode: args.mode,
      useLiveConnectors: true,
      policy: args.policy,
      fixtureMode: args.fixture_mode,
      fixtureManifestPath: args.fixture_manifest
    });

    return {
      content: [
        {
          type: "text",
          text: renderRepairPaperResult(payload, args.output_format)
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      content: [
        {
          type: "text",
          text: message
        }
      ],
      isError: true
    };
  }
}

export async function callScanWorkspaceTool(args: ScanWorkspaceToolArgs): Promise<ToolTextResult> {
  try {
    const payload = await scanWorkspace(args.target_path);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      content: [{ type: "text", text: message }],
      isError: true
    };
  }
}

export async function callAnalyzeReferencesTool(args: AnalyzeReferencesToolArgs): Promise<ToolTextResult> {
  try {
    const payload = await analyzeReferences(args.target_path, {
      mode: args.mode,
      useLiveConnectors: true,
      policy: args.policy,
      fixtureMode: args.fixture_mode,
      fixtureManifestPath: args.fixture_manifest
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      content: [{ type: "text", text: message }],
      isError: true
    };
  }
}

export async function callPlanReferenceRewriteTool(args: PlanReferenceRewriteToolArgs): Promise<ToolTextResult> {
  try {
    const payload = await planReferenceRewrite(args.target_path, {
      useLiveConnectors: true,
      policy: args.policy,
      fixtureMode: args.fixture_mode,
      fixtureManifestPath: args.fixture_manifest,
      writeMode: args.write_mode
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      content: [{ type: "text", text: message }],
      isError: true
    };
  }
}

export async function callApplyReferenceRewriteTool(args: ApplyReferenceRewriteToolArgs): Promise<ToolTextResult> {
  try {
    const payload = await applyReferenceRewrite(args.target_path, {
      useLiveConnectors: true,
      policy: args.policy,
      fixtureMode: args.fixture_mode,
      fixtureManifestPath: args.fixture_manifest,
      writeMode: args.write_mode,
      removeUnresolved: args.remove_unresolved
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      content: [{ type: "text", text: message }],
      isError: true
    };
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    "scan_workspace",
    {
      title: "Scan Workspace",
      description: "Scan a workspace or file path and return the most paper-like candidate files.",
      inputSchema: scanWorkspaceSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (args) => callScanWorkspaceTool(args)
  );

  server.registerTool(
    "analyze_references",
    {
      title: "Analyze References",
      description: "Extract references, lint bibliography quality, validate against external sources, and return a structured review result.",
      inputSchema: analyzeReferencesSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (args) => callAnalyzeReferencesTool(args)
  );

  server.registerTool(
    "plan_reference_rewrite",
    {
      title: "Plan Reference Rewrite",
      description: "Build a replacement plan, patch previews, and key rewrite risks without modifying files.",
      inputSchema: planReferenceRewriteSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (args) => callPlanReferenceRewriteTool(args)
  );

  server.registerTool(
    "apply_reference_rewrite",
    {
      title: "Apply Reference Rewrite",
      description: "Apply a prepared reference rewrite as a sidecar bibliography or in-place bibliography replacement.",
      inputSchema: applyReferenceRewriteSchema,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true
      }
    },
    async (args) => callApplyReferenceRewriteTool(args)
  );

  server.registerTool(
    "repair_paper",
    {
      title: "Repair Paper References",
      description: "Find a paper-like file, extract its references, validate them, and return corrected output. Works best with .bib files or numbered reference lists. For unstructured plain text (e.g. PDF copy-paste), preprocess by adding sequential numbering (1., 2., ...) and rejoining hyphenated line breaks before passing.",
      inputSchema: repairPaperSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true
      }
    },
    async (args) => callRepairPaperTool(args)
  );

  server.registerTool(
    "citecheck_version",
    {
      title: "Citecheck MCP Version",
      description: "Return basic citecheck MCP server metadata.",
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              name: SERVER_NAME,
              version: SERVER_VERSION
            },
            null,
            2
          )
        }
      ]
    })
  );

  return server;
}

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
