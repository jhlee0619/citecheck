import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  callAnalyzeReferencesTool,
  callApplyReferenceRewriteTool,
  callPlanReferenceRewriteTool,
  callRepairPaperTool,
  callScanWorkspaceTool
} from "./mcp.js";

describe("citecheck mcp", () => {
  it("returns workspace scan results through the MCP tool helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-mcp-scan-"));
    const filePath = path.join(tempDir, "paper.md");
    await writeFile(filePath, "# Draft");

    const result = await callScanWorkspaceTool({
      target_path: tempDir
    });

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text) as {
      selectedFile: string;
      supportedFileFound: boolean;
    };
    expect(payload.supportedFileFound).toBe(true);
    expect(payload.selectedFile).toBe(filePath);
  });

  it("returns the repair-paper json payload through the MCP tool helper", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-mcp-"));
    const filePath = path.join(tempDir, "paper.md");
    const fixtureManifestPath = path.join(tempDir, "fixtures.json");
    await writeFile(
      filePath,
      ["# Draft", "", "## References", "", "Smith J. Deep imaging biomarkers in glioma. 2024. doi:10.1000/xyz123."].join("\n")
    );
    await writeFile(
      fixtureManifestPath,
      JSON.stringify(
        {
          entries: [
            {
              key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
              source: "pubmed",
              body: JSON.stringify({
                esearchresult: { idlist: ["12345678"] }
              })
            },
            {
              key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
              source: "pubmed",
              body: JSON.stringify({
                result: {
                  uids: ["12345678"],
                  "12345678": {
                    uid: "12345678",
                    title: "Deep imaging biomarkers in glioma",
                    fulljournalname: "Neuroradiology",
                    pubdate: "2024 Jan",
                    authors: [{ name: "Smith J" }, { name: "Doe A" }],
                    articleids: [{ idtype: "doi", value: "10.1000/xyz123" }]
                  }
                }
              })
            },
            {
              key: "https://api.crossref.org/works",
              source: "crossref",
              body: JSON.stringify({ message: { items: [] } })
            },
            {
              key: "https://export.arxiv.org/api/query",
              source: "arxiv",
              body: `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`
            }
          ]
        },
        null,
        2
      )
    );

    const result = await callRepairPaperTool({
      target_path: filePath,
      output_format: "json",
      fixture_mode: "only",
      fixture_manifest: fixtureManifestPath
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
  }, 10000);

  it("returns structured analysis, rewrite plan, and apply results through MCP helpers", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-mcp-plan-"));
    const bibPath = path.join(tempDir, "references.bib");
    const sidecarPath = path.join(tempDir, "references.citecheck.fixed.bib");
    const fixtureManifestPath = path.join(tempDir, "fixtures.json");
    await writeFile(
      bibPath,
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}`
    );
    await writeFile(
      fixtureManifestPath,
      JSON.stringify(
        {
          entries: [
            {
              key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
              source: "pubmed",
              body: JSON.stringify({
                esearchresult: { idlist: ["12345678"] }
              })
            },
            {
              key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
              source: "pubmed",
              body: JSON.stringify({
                result: {
                  uids: ["12345678"],
                  "12345678": {
                    uid: "12345678",
                    title: "Deep imaging biomarkers in glioma",
                    fulljournalname: "Neuroradiology",
                    pubdate: "2024 Jan",
                    authors: [{ name: "Smith J" }, { name: "Doe A" }],
                    articleids: [{ idtype: "doi", value: "10.1000/xyz123" }]
                  }
                }
              })
            },
            {
              key: "https://api.crossref.org/works",
              source: "crossref",
              body: JSON.stringify({ message: { items: [] } })
            },
            {
              key: "https://export.arxiv.org/api/query",
              source: "arxiv",
              body: `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`
            }
          ]
        },
        null,
        2
      )
    );

    const analysisResult = await callAnalyzeReferencesTool({
      target_path: bibPath,
      mode: "review",
      output_format: "json",
      fixture_mode: "only",
      fixture_manifest: fixtureManifestPath
    });
    const analysisPayload = JSON.parse(analysisResult.content[0]!.text) as {
      documentSelection: { selectedFile: string };
    };
    expect(analysisPayload.documentSelection.selectedFile).toBe(bibPath);

    const planResult = await callPlanReferenceRewriteTool({
      target_path: bibPath,
      write_mode: "sidecar",
      fixture_mode: "only",
      fixture_manifest: fixtureManifestPath
    });
    const planPayload = JSON.parse(planResult.content[0]!.text) as {
      replacementPlan: { status: string };
      writePlan: { patches: Array<{ patchKind: string }> };
    };
    expect(planPayload.replacementPlan.status).toBe("ready");
    expect(planPayload.writePlan.patches[0]?.patchKind).toBe("write_sidecar_bib");

    const applyResult = await callApplyReferenceRewriteTool({
      target_path: bibPath,
      write_mode: "sidecar",
      fixture_mode: "only",
      fixture_manifest: fixtureManifestPath
    });
    const applyPayload = JSON.parse(applyResult.content[0]!.text) as {
      applied: boolean;
      targetFilesWritten: string[];
    };
    expect(applyPayload.applied).toBe(true);
    expect(applyPayload.targetFilesWritten).toContain(sidecarPath);
  }, 10000);
});
