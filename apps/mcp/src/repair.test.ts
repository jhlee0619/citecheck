import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parseReferenceInputs, repairPaper, renderRepairPaperResult } from "./index.js";

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
    expect(payload.selectedFile).toBe(bibPath);
    expect(payload.detectedFormat).toBe("bib");
    expect(payload.referencesExtracted).toBe(1);
    expect(payload.selectedFileOutputFormat).toBe("bibtex");
    expect(payload.entries[0]?.outputFormat).toBe("bibtex");
    expect(payload.entries[0]?.corrected).toContain("@article");
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
});
