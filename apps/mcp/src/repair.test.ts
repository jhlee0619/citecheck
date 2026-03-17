import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  analyzeReferences,
  applyReferenceRewrite,
  parseReferenceInputs,
  planReferenceRewrite,
  repairPaper,
  renderRepairPaperResult,
  scanWorkspace
} from "./index.js";

const execFileAsync = promisify(execFile);

async function createDocx(filePath: string, paragraphs: string[]): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-docx-"));
  const wordDir = path.join(tempDir, "word");
  const relsDir = path.join(tempDir, "_rels");
  await mkdir(wordDir, { recursive: true });
  await mkdir(relsDir, { recursive: true });
  await writeFile(
    path.join(tempDir, "[Content_Types].xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`
  );
  await writeFile(
    path.join(relsDir, ".rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );
  const body = paragraphs
    .map(
      (paragraph) =>
        `<w:p><w:r><w:t>${paragraph
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
    )
    .join("");
  await writeFile(
    path.join(wordDir, "document.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${body}</w:body>
    </w:document>`
  );
  await execFileAsync("zip", ["-qr", filePath, "."], { cwd: tempDir });
}

describe("repairPaper", () => {
  it("falls back to raw citations for malformed bibtex input", () => {
    const inputs = parseReferenceInputs(`@article{bad,\n  title = {Broken entry}\n  author = {Smith J}`);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.kind).toBe("raw_citation");
  });

  it("repairs a bib file and emits agent-friendly json", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-repair-bib-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(bibPath);

    expect(payload.exitCode).toBe(0);
    expect(payload.mode).toBe("review");
    expect(payload.selectedFile).toBe(bibPath);
    expect(payload.detectedFormat).toBe("bib");
    expect(payload.referencesExtracted).toBe(1);
    expect(payload.selectedFileOutputFormat).toBe("bibtex");
    expect(payload.entries[0]?.outputFormat).toBe("bibtex");
    expect(payload.entries[0]?.corrected).toContain("@article");
    expect(payload.keyMapping[0]?.originalKey).toBe("demo");
    expect(payload.manifestationPolicy).toBe("journal > conference > arXiv");
    expect(payload.entries[0]?.strongIdentifierMatched).toBe(true);
    expect(payload.verificationDegraded).toBe(false);
  });

  it("reports key remapping and replacement output in replacement mode", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-replacement-bib-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  volume = {12},\n  pages = {1-10},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(bibPath, { mode: "replacement" });

    expect(payload.mode).toBe("replacement");
    expect(payload.replacementStatus).toBe("ready");
    expect(payload.keyMapping[0]?.changed).toBe(true);
    expect(payload.entries[0]?.replacementBibtex).toContain("@article{smith2024deep,");
    expect(payload.entries[0]?.replacementBibtex).toContain("volume = {12}");
    expect(payload.entries[0]?.replacementBibtex).toContain("pages = {1-10}");
  });

  it("blocks replacement when original key year mismatches the entry year", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-key-year-mismatch-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@article{smith2023deep,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(bibPath, { mode: "replacement" });

    expect(payload.replacementStatus).toBe("blocked");
    expect(payload.unsafeEntries[0]?.reasons[0]).toContain("existing key year 2023 does not match entry year 2024");
  });

  it("detects duplicate generated keys and blocks replacement", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-duplicate-key-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@article{demoa,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}\n\n@article{demob,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(bibPath, { mode: "replacement" });

    expect(payload.duplicateKeys).toHaveLength(1);
    expect(payload.duplicateKeys[0]?.key).toBe("smith2024deep");
    expect(payload.replacementStatus).toBe("blocked");
  });

  it("keeps manifestation conflicts in review-only state instead of auto-replacing", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-manifestation-conflict-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@inproceedings{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  booktitle = {NeurIPS},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(bibPath, { mode: "replacement" });

    expect(payload.replacementStatus).toBe("partial");
    expect(payload.entries[0]?.replacementEligibility).toBe("review_only");
    expect(payload.entries[0]?.manifestationConflict).toBe(true);
    expect(payload.curationWorklist.some((item) => item.category === "manifestation_conflict")).toBe(true);
  });

  it("surfaces bibliography lint findings and curation work items", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-bib-lint-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@inproceedings{smith2023deep,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and others},\n  year = {2024},\n  booktitle = {arXiv preprint arXiv:2401.12345},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(bibPath);

    expect(payload.bibliographyFindings.some((finding) => finding.code === "key_year_mismatch")).toBe(true);
    expect(payload.bibliographyFindings.some((finding) => finding.code === "type_venue_mismatch")).toBe(true);
    expect(payload.bibliographyFindings.some((finding) => finding.code === "author_format_cleanup")).toBe(true);
    expect(payload.curationWorklist.some((item) => item.category === "key_consistency_cleanup")).toBe(true);
    expect(payload.curationWorklist.some((item) => item.category === "author_format_cleanup")).toBe(true);
    expect(payload.entries[0]?.bibliographyLintFindings.length).toBeGreaterThan(0);
  });

  it("chooses a bib file over a markdown file in a directory scan", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-repair-dir-"));
    await writeFile(
      path.join(tempDir, "paper.md"),
      ["# Draft", "## References", "Smith J. Deep imaging biomarkers in glioma. 2024. doi:10.1000/xyz123."].join("\n\n")
    );
    const bibPath = path.join(tempDir, "paper.references.bib");
    await writeFile(
      bibPath,
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(tempDir);

    expect(payload.exitCode).toBe(0);
    expect(payload.selectedFile).toBe(bibPath);
    expect(payload.candidateFiles.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores hidden files during automatic project scanning", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-hidden-scan-"));
    await writeFile(
      path.join(tempDir, ".paper.md"),
      ["# Draft", "", "## References", "", "Hidden J. Hidden reference. 2024. doi:10.1000/hidden."].join("\n")
    );
    const visiblePath = path.join(tempDir, "paper.md");
    await writeFile(
      visiblePath,
      ["# Draft", "", "## References", "", "Smith J. Deep imaging biomarkers in glioma. 2024. doi:10.1000/xyz123."].join("\n")
    );

    const payload = await repairPaper(tempDir);

    expect(payload.selectedFile).toBe(visiblePath);
    expect(payload.candidateFiles.some((candidate) => path.basename(candidate.path).startsWith("."))).toBe(false);
  });

  it("extracts a references section from markdown and emits numbered output", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-repair-md-"));
    const filePath = path.join(tempDir, "paper.md");
    await writeFile(
      filePath,
      [
        "# Draft",
        "",
        "Body text",
        "",
        "## References",
        "",
        "1. Smith J. Deep imaging biomarkers in glioma. 2024. doi:10.1000/xyz123."
      ].join("\n")
    );

    const payload = await repairPaper(filePath);

    expect(payload.exitCode).toBe(0);
    expect(payload.detectedFormat).toBe("md");
    expect(payload.referenceSectionFound).toBe(true);
    expect(payload.referencesExtracted).toBe(1);
    expect(payload.selectedFileOutputFormat).toBe("numbered");
    expect(payload.proposedOutput).toContain("doi:10.1000/xyz123");
    expect(renderRepairPaperResult(payload, "numbered")).toContain("Deep imaging biomarkers in glioma");
  });

  it("follows latex bibliography references into an external bib file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-repair-tex-"));
    const texPath = path.join(tempDir, "paper.tex");
    await writeFile(texPath, "\\section*{References}\n\\bibliography{refs}");
    await writeFile(
      path.join(tempDir, "refs.bib"),
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}`
    );

    const payload = await repairPaper(texPath);

    expect(payload.exitCode).toBe(0);
    expect(payload.detectedFormat).toBe("tex");
    expect(payload.referenceSectionSource).toContain("refs.bib");
    expect(payload.entries[0]?.outputFormat).toBe("numbered");
  });

  it("extracts references from docx files", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-repair-docx-"));
    const docxPath = path.join(tempDir, "manuscript.docx");
    await createDocx(docxPath, [
      "Draft title",
      "Body paragraph",
      "References",
      "Smith J. Deep imaging biomarkers in glioma. 2024. doi:10.1000/xyz123."
    ]);

    const payload = await repairPaper(docxPath);

    expect(payload.exitCode).toBe(0);
    expect(payload.detectedFormat).toBe("docx");
    expect(payload.referenceSectionFound).toBe(true);
    expect(payload.referencesExtracted).toBe(1);
  });

  it("returns exit code 2 under strict policy violations", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-repair-policy-"));
    const filePath = path.join(tempDir, "paper.md");
    await writeFile(filePath, ["# Draft", "", "## References", "", "Unresolvable citation"].join("\n"));

    const payload = await repairPaper(filePath, { policy: "strict" });

    expect(payload.exitCode).toBe(2);
    expect(payload.policyResult.passed).toBe(false);
  });

  it("scans a workspace and returns candidate selection metadata", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-scan-workspace-"));
    const bibPath = path.join(tempDir, "paper.references.bib");
    await writeFile(bibPath, `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  year = {2024}\n}`);
    await writeFile(path.join(tempDir, "notes.md"), "# Notes");

    const result = await scanWorkspace(tempDir);

    expect(result.supportedFileFound).toBe(true);
    expect(result.selectedFile).toBe(bibPath);
    expect(result.candidateFiles.length).toBeGreaterThanOrEqual(1);
  });

  it("returns a structured analysis result", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-analyze-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  doi = {10.1000/xyz123}\n}`
    );

    const result = await analyzeReferences(bibPath);

    expect(result.documentSelection.selectedFile).toBe(bibPath);
    expect(result.referenceExtraction.referencesExtracted).toBe(1);
    expect(result.matchingSummary.manifestationPolicy).toBe("journal > conference > arXiv");
    expect(result.reviewSummary.entries).toHaveLength(1);
  });

  it("builds a rewrite plan with sidecar patches", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-plan-rewrite-"));
    const bibPath = path.join(tempDir, "references.bib");
    await writeFile(
      bibPath,
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  volume = {12},\n  pages = {1-10},\n  doi = {10.1000/xyz123}\n}`
    );

    const result = await planReferenceRewrite(bibPath, { writeMode: "sidecar" });

    expect(result.replacementPlan.status).toBe("ready");
    expect(result.writePlan.patches[0]?.patchKind).toBe("write_sidecar_bib");
    expect(result.writePlan.patches[0]?.applicable).toBe(true);
  });

  it("applies a sidecar bibliography rewrite", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "citecheck-apply-rewrite-"));
    const bibPath = path.join(tempDir, "references.bib");
    const sidecarPath = path.join(tempDir, "references.citecheck.fixed.bib");
    await writeFile(
      bibPath,
      `@article{demo,\n  title = {Deep imaging biomarkers in glioma},\n  author = {Smith J and Doe A},\n  year = {2024},\n  journal = {Neuroradiology},\n  volume = {12},\n  pages = {1-10},\n  doi = {10.1000/xyz123}\n}`
    );

    const result = await applyReferenceRewrite(bibPath, { writeMode: "sidecar" });

    expect(result.applied).toBe(true);
    expect(result.targetFilesWritten).toContain(sidecarPath);
    const written = await readFile(sidecarPath, "utf8");
    expect(written).toContain("@article{smith2024deep,");
  });
});
