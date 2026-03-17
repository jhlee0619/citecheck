#!/usr/bin/env node
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { repairPaper, renderRepairPaperResult } from "./index.js";

const SERVER_NAME = "citecheck-mcp";
const SERVER_VERSION = "0.1.0";

const repairPaperSchema = {
  target_path: z.string().describe("Path to the paper file or project folder to inspect."),
  output_format: z.enum(["json", "bibtex", "numbered"]).optional().default("json").describe("Preferred citecheck output format."),
  policy: z.enum(["default", "strict", "lenient"]).optional().describe("Batch policy preset."),
  fixture_mode: z.enum(["off", "prefer", "only"]).optional().describe("Fixture replay mode."),
  fixture_manifest: z.string().optional().describe("Optional fixture manifest path.")
};

type RepairPaperToolArgs = z.output<z.ZodObject<typeof repairPaperSchema>>;

interface ToolTextResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export async function callRepairPaperTool(args: RepairPaperToolArgs): Promise<ToolTextResult> {
  try {
    const payload = await repairPaper(args.target_path, {
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

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  server.registerTool(
    "repair_paper",
    {
      title: "Repair Paper References",
      description: "Find a paper-like file, extract its references, validate them, and return corrected output.",
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
