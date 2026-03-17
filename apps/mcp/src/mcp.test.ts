import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callRepairPaperTool } from "./mcp.js";

describe("citecheck mcp", () => {
  it("returns the repair-paper json payload through the MCP tool helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-mcp-"));
    const filePath = path.join(tempDir, "paper.md");
    await writeFile(
      filePath,
      ["# Draft", "", "## References", "", "Smith J. Deep imaging biomarkers in glioma. 2024. doi:10.1000/xyz123."].join("\n")
    );

    const result = await callRepairPaperTool({
      target_path: filePath,
      output_format: "json"
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);

    const payload = JSON.parse(result.content[0]!.text) as {
      selectedFile: string;
      detectedFormat: string;
      referencesExtracted: number;
    };

    expect(payload.selectedFile).toBe(filePath);
    expect(payload.detectedFormat).toBe("md");
    expect(payload.referencesExtracted).toBe(1);
  });
});
