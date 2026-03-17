import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  normalizeText,
  renderCitation,
  type BatchResult,
  type ReferenceInput,
  type SourceFailureClass,
  type ValidationResult,
  type ValidationStatus
} from "@citecheck/core";
import {
  applyPolicyOverrides,
  evaluatePolicy,
  getPolicyPreset,
  type BatchPolicyInput,
  type ExitDecision,
  type ExitPolicy,
  type PolicyOverrides,
  type PolicyPresetName
} from "@citecheck/policy";
import {
  buildRuntimeFromConfig,
  defaultRuntimeFactoryConfig,
  summarizeEffectiveRuntimeConfig,
  type FixtureMode,
  SourceReplayRegistry,
  type RuntimeFactoryConfig,
  type SourceReplayEntry
} from "@citecheck/runtime";

const execFileAsync = promisify(execFile);
const SUPPORTED_EXTENSIONS = [".bib", ".tex", ".md", ".txt", ".docx"] as const;
const EXTENSION_PRIORITY: Record<SupportedExtension, number> = {
  ".bib": 500,
  ".tex": 400,
  ".md": 300,
  ".docx": 200,
  ".txt": 100
};
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "artifacts"]);
const REFERENCE_HEADERS = ["references", "bibliography", "works cited"];
const FILE_HINTS = ["reference", "references", "bibliography", "paper", "manuscript", "draft", "supplement"];

type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];
type DetectedFormat = "bib" | "tex" | "md" | "txt" | "docx";
type RepairOutputFormat = "json" | "bibtex" | "numbered";

interface PolicyFileConfig extends PolicyOverrides {
  preset?: PolicyPresetName;
  name?: string;
  rules?: ExitPolicy["rules"];
}

export interface CandidateFile {
  path: string;
  extension: SupportedExtension;
  score: number;
  reason: string;
}

interface ExtractedReferenceData {
  detectedFormat: DetectedFormat;
  referenceSectionFound: boolean;
  referenceSectionSource?: string;
  rawEntries: string[];
  extractionWarnings: string[];
}

export interface RepairEntry {
  entryIndex: number;
  original: string;
  parsedKind: ReferenceInput["kind"];
  status: ValidationStatus;
  confidence: ValidationResult["confidence"];
  issues: ValidationResult["issues"];
  sourceOutcomes: ValidationResult["trace"][number]["sourceOutcomes"];
  corrected: string;
  outputFormat: "bibtex" | "numbered";
}

export interface RepairPaperJsonResult {
  selectedFile: string;
  selectionReason: string;
  candidateFiles: CandidateFile[];
  detectedFormat: DetectedFormat;
  referenceSectionFound: boolean;
  referenceSectionSource?: string;
  referencesExtracted: number;
  entries: RepairEntry[];
  proposedOutput: string;
  warnings: string[];
  maskedEffectiveConfig: Record<string, unknown>;
  summary: BatchResult["summary"];
  sourceHealth: BatchPolicyInput["sourceHealth"];
  failureSummary: BatchPolicyInput["failureSummary"];
  policyResult: ExitDecision["policyResult"];
  exitCode: number;
  selectedFileOutputFormat: "bibtex" | "numbered";
}

export interface RepairPaperOptions extends PolicyOverrides {
  useLiveConnectors?: boolean;
  fixtureMode?: FixtureMode;
  fixtureManifestPath?: string;
  configPath?: string;
  policy?: PolicyPresetName;
  policyFilePath?: string;
}

export function parseReferenceInputs(content: string): ReferenceInput[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("@")) {
    return parseBibtexEntries(trimmed);
  }
  if (/^TY\s+-/m.test(trimmed)) {
    return parseRisEntries(trimmed);
  }
  if (/^PMID-\s+/m.test(trimmed) || /^TI\s+-/m.test(trimmed)) {
    return parseMedlineEntries(trimmed);
  }
  return splitReferenceBlocks(trimmed).map((chunk) => ({ kind: "raw_citation", raw: chunk }));
}

export async function repairPaper(inputPath: string, options: RepairPaperOptions = {}): Promise<RepairPaperJsonResult> {
  const { config, effectiveConfig } = await loadRuntimeConfig(options);
  const policy = await loadPolicy(options);
  const runtime = buildRuntimeFromConfig(config);

  const selected = await selectPaperFile(inputPath);
  if (!selected) {
    throw new Error(`no supported paper-like file found under ${path.resolve(inputPath)}`);
  }

  const extracted = await extractReferenceData(selected.path, selected.extension);
  if (extracted.rawEntries.length === 0) {
    throw new Error(`no reference entries extracted from ${selected.path}`);
  }

  const inputs = extracted.rawEntries.flatMap((entry) => parseReferenceInputs(entry));
  const batch = await runtime.verifyReferenceList(inputs, { sourceFile: selected.path });
  const policyInput = buildBatchPolicyInput(batch);
  const decision = evaluatePolicy(policy, policyInput);
  const selectedFileOutputFormat = extracted.detectedFormat === "bib" ? "bibtex" : "numbered";
  const entries = batch.results.map((result, index) => buildRepairEntry(index, inputs[index]!, result, selectedFileOutputFormat));
  const proposedOutput = entries.map((entry) => entry.corrected).join(selectedFileOutputFormat === "bibtex" ? "\n\n" : "\n");

  return {
    selectedFile: selected.path,
    selectionReason: selected.reason,
    candidateFiles: selected.candidates,
    detectedFormat: extracted.detectedFormat,
    referenceSectionFound: extracted.referenceSectionFound,
    referenceSectionSource: extracted.referenceSectionSource,
    referencesExtracted: extracted.rawEntries.length,
    entries,
    proposedOutput,
    warnings: extracted.extractionWarnings,
    maskedEffectiveConfig: effectiveConfig,
    summary: batch.summary,
    sourceHealth: policyInput.sourceHealth,
    failureSummary: policyInput.failureSummary,
    policyResult: decision.policyResult,
    exitCode: decision.exitCode,
    selectedFileOutputFormat
  };
}

export function renderRepairPaperResult(payload: RepairPaperJsonResult, outputFormat: RepairOutputFormat = "json"): string {
  if (outputFormat === "json") {
    return JSON.stringify(payload, null, 2);
  }
  if (outputFormat === payload.selectedFileOutputFormat) {
    return payload.proposedOutput;
  }
  return payload.entries.map((entry) => convertRepairEntryOutput(entry, outputFormat)).join(outputFormat === "bibtex" ? "\n\n" : "\n");
}

function buildRepairEntry(
  entryIndex: number,
  input: ReferenceInput,
  result: ValidationResult,
  outputFormat: "bibtex" | "numbered"
): RepairEntry {
  return {
    entryIndex,
    original: input.raw,
    parsedKind: input.kind,
    status: result.status,
    confidence: result.confidence,
    issues: result.issues,
    sourceOutcomes: result.trace.flatMap((trace) => trace.sourceOutcomes),
    corrected: buildCorrectedEntry(result, outputFormat),
    outputFormat
  };
}

function buildCorrectedEntry(result: ValidationResult, outputFormat: "bibtex" | "numbered"): string {
  const candidate = result.preferredManifestation?.representative;
  if (!candidate) {
    return result.input.raw;
  }
  const rendered = renderCitation(candidate);
  return outputFormat === "bibtex" ? rendered.bibtex : rendered.numbered;
}

function convertRepairEntryOutput(entry: RepairEntry, outputFormat: "bibtex" | "numbered"): string {
  if (outputFormat === entry.outputFormat) {
    return entry.corrected;
  }
  return entry.original;
}

async function selectPaperFile(inputPath: string): Promise<{ path: string; extension: SupportedExtension; reason: string; candidates: CandidateFile[] } | undefined> {
  const absolutePath = path.resolve(inputPath);
  const stats = await readPathType(absolutePath);
  if (stats === "file") {
    const extension = normalizeSupportedExtension(path.extname(absolutePath));
    if (!extension) {
      throw new Error(`unsupported file format for ${absolutePath}`);
    }
    const candidate = await scoreCandidateFile(absolutePath, extension);
    return {
      path: absolutePath,
      extension,
      reason: candidate.reason,
      candidates: [candidate]
    };
  }

  const candidates = await collectCandidateFiles(absolutePath);
  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((left, right) => (right.score === left.score ? left.path.localeCompare(right.path) : right.score - left.score));
  const selected = candidates[0]!;
  return {
    path: selected.path,
    extension: selected.extension,
    reason: selected.reason,
    candidates
  };
}

async function readPathType(targetPath: string): Promise<"file" | "directory"> {
  const { stat } = await import("node:fs/promises");
  const stats = await stat(targetPath);
  return stats.isDirectory() ? "directory" : "file";
}

async function collectCandidateFiles(rootPath: string): Promise<CandidateFile[]> {
  const candidates: CandidateFile[] = [];
  const directories = [rootPath];
  while (directories.length > 0) {
    const current = directories.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          directories.push(absolute);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const extension = normalizeSupportedExtension(path.extname(entry.name));
      if (!extension) {
        continue;
      }
      candidates.push(await scoreCandidateFile(absolute, extension));
    }
  }
  return candidates;
}

function normalizeSupportedExtension(value: string): SupportedExtension | undefined {
  return SUPPORTED_EXTENSIONS.find((extension) => extension === value.toLowerCase());
}

async function scoreCandidateFile(filePath: string, extension: SupportedExtension): Promise<CandidateFile> {
  const baseName = path.basename(filePath).toLowerCase();
  let score = EXTENSION_PRIORITY[extension];
  const reasons = [`extension ${extension}`];

  for (const hint of FILE_HINTS) {
    if (baseName.includes(hint)) {
      score += 20;
      reasons.push(`filename contains ${hint}`);
    }
  }

  const content = extension === ".docx" ? await readDocxText(filePath).catch(() => "") : await readFile(filePath, "utf8").catch(() => "");
  if (content.length > 0) {
    score += 5;
  }
  if (extension === ".bib") {
    const matches = content.match(/@\w+\s*\{/g) ?? [];
    score += matches.length * 5;
    if (matches.length > 0) {
      reasons.push(`contains ${matches.length} bib entries`);
    }
  } else {
    const lowered = content.toLowerCase();
    if (REFERENCE_HEADERS.some((header) => lowered.includes(header))) {
      score += 30;
      reasons.push("contains references header");
    }
    if (extension === ".tex" && (/\\begin\{thebibliography\}/.test(content) || /\\bibliography\{/.test(content) || /\\addbibresource\{/.test(content))) {
      score += 40;
      reasons.push("contains latex bibliography markers");
    }
  }

  return {
    path: filePath,
    extension,
    score,
    reason: reasons.join(", ")
  };
}

async function extractReferenceData(filePath: string, extension: SupportedExtension): Promise<ExtractedReferenceData> {
  if (extension === ".bib") {
    const content = await readFile(filePath, "utf8");
    return {
      detectedFormat: "bib",
      referenceSectionFound: true,
      referenceSectionSource: filePath,
      rawEntries: splitBibtexEntries(content),
      extractionWarnings: []
    };
  }

  if (extension === ".tex") {
    return await extractTexReferenceData(filePath);
  }

  if (extension === ".md" || extension === ".txt") {
    const content = await readFile(filePath, "utf8");
    const section = extractReferenceSection(content);
    return {
      detectedFormat: extension === ".md" ? "md" : "txt",
      referenceSectionFound: section !== undefined,
      referenceSectionSource: section ? `${filePath}#references` : undefined,
      rawEntries: splitReferenceBlocks(section ?? content),
      extractionWarnings: section ? [] : ["references header not found; used full file content"]
    };
  }

  const docxText = await readDocxText(filePath);
  const section = extractReferenceSection(docxText);
  return {
    detectedFormat: "docx",
    referenceSectionFound: section !== undefined,
    referenceSectionSource: section ? `${filePath}#references` : undefined,
    rawEntries: splitReferenceBlocks(section ?? docxText),
    extractionWarnings: section ? [] : ["references header not found; used full document text"]
  };
}

async function extractTexReferenceData(filePath: string): Promise<ExtractedReferenceData> {
  const content = await readFile(filePath, "utf8");
  const bibResource = content.match(/\\(?:bibliography|addbibresource)\{([^}]+)\}/);
  if (bibResource?.[1]) {
    const bibPaths = bibResource[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.endsWith(".bib") ? item : `${item}.bib`));
    for (const bibPath of bibPaths) {
      const resolved = path.resolve(path.dirname(filePath), bibPath);
      try {
        const bibContent = await readFile(resolved, "utf8");
        return {
          detectedFormat: "tex",
          referenceSectionFound: true,
          referenceSectionSource: resolved,
          rawEntries: splitBibtexEntries(bibContent),
          extractionWarnings: []
        };
      } catch {
        continue;
      }
    }
  }

  const theBibliography = content.match(/\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}/);
  if (theBibliography?.[0]) {
    return {
      detectedFormat: "tex",
      referenceSectionFound: true,
      referenceSectionSource: `${filePath}#thebibliography`,
      rawEntries: splitLatexBibliography(theBibliography[0]),
      extractionWarnings: []
    };
  }

  const section = extractReferenceSection(content);
  return {
    detectedFormat: "tex",
    referenceSectionFound: section !== undefined,
    referenceSectionSource: section ? `${filePath}#references` : undefined,
    rawEntries: splitReferenceBlocks(section ?? content),
    extractionWarnings: section ? [] : ["latex bibliography markers not found; used full file content"]
  };
}

function splitLatexBibliography(content: string): string[] {
  return content
    .split(/\\bibitem(?:\[[^\]]*\])?\{[^}]+\}/g)
    .map((item) => item.replace(/\\end\{thebibliography\}/g, "").trim())
    .filter(Boolean);
}

function extractReferenceSection(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  let start = -1;
  for (const [index, line] of lines.entries()) {
    const normalized = normalizeHeaderLine(line);
    if (REFERENCE_HEADERS.includes(normalized)) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) {
    return undefined;
  }

  const sectionLines: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (sectionLines.length > 0 && isLikelyNewSection(line)) {
      break;
    }
    sectionLines.push(line);
  }
  return sectionLines.join("\n").trim() || undefined;
}

function normalizeHeaderLine(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/^\\section\*?\{/, "")
    .replace(/\}$/, "")
    .replace(/[:\s]+$/g, "")
    .trim()
    .toLowerCase();
}

function isLikelyNewSection(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/^#+\s+[A-Z]/.test(trimmed)) {
    return true;
  }
  if (/^\\section\*?\{/.test(trimmed)) {
    return true;
  }
  return /^[A-Z][A-Za-z0-9\s]{1,40}:?$/.test(trimmed) && !looksLikeReferenceItem(trimmed);
}

function splitReferenceBlocks(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }
  const lines = trimmed.split(/\r?\n/).map((line) => line.trimRight());
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  if (nonEmptyLines.length > 1 && nonEmptyLines.every((line) => looksLikeReferenceItem(line))) {
    return nonEmptyLines.map((line) => cleanReferenceMarker(line));
  }
  if (lines.some((line) => /^\s*(\[\d+\]|\d+\.\s+|- |\* )/.test(line))) {
    const entries: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      if (/^\s*(\[\d+\]|\d+\.\s+|- |\* )/.test(line)) {
        if (current.length > 0) {
          entries.push(cleanReferenceMarker(current.join(" ").trim()));
        }
        current = [line];
      } else if (line.trim()) {
        current.push(line);
      } else if (current.length > 0) {
        entries.push(cleanReferenceMarker(current.join(" ").trim()));
        current = [];
      }
    }
    if (current.length > 0) {
      entries.push(cleanReferenceMarker(current.join(" ").trim()));
    }
    return entries.filter(Boolean);
  }

  return trimmed
    .split(/\n{2,}/)
    .map((chunk) => cleanReferenceMarker(chunk.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

function cleanReferenceMarker(value: string): string {
  return value.replace(/^(\[\d+\]|\d+\.)\s*/, "").trim();
}

function looksLikeReferenceItem(line: string): boolean {
  return /doi:|PMID|et al\.|[.;]\s*\d{4}/i.test(line);
}

async function readDocxText(filePath: string): Promise<string> {
  if (path.extname(filePath).toLowerCase() !== ".docx") {
    return "";
  }
  const { stdout } = await execFileAsync("unzip", ["-p", filePath, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  return extractDocxParagraphs(stdout).join("\n");
}

function extractDocxParagraphs(documentXml: string): string[] {
  const paragraphs = documentXml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((paragraph) => {
      const text = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((match) => decodeXml(match[1] ?? ""))
        .join("")
        .trim();
      return text;
    })
    .filter(Boolean);
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function parseBibtexEntries(content: string): ReferenceInput[] {
  const entries = splitBibtexEntries(content);
  if (entries.length === 0) {
    return [{ kind: "raw_citation", raw: content.trim() }];
  }
  return entries.map(parseBibtexEntry);
}

function parseRisEntries(content: string): ReferenceInput[] {
  return content
    .split(/\nER\s+-\s*\n?/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const structuredEntry = {
        kind: "structured_entry" as const,
        raw: entry,
        title: entry.match(/^TI\s+-\s+(.+)$/m)?.[1],
        authors: [...entry.matchAll(/^AU\s+-\s+(.+)$/gm)].map((match) => match[1]),
        year: entry.match(/^PY\s+-\s+(\d{4})/m)?.[1]
          ? Number.parseInt(entry.match(/^PY\s+-\s+(\d{4})/m)![1], 10)
          : undefined,
        journal: entry.match(/^JO\s+-\s+(.+)$/m)?.[1],
        doi: entry.match(/^DO\s+-\s+(.+)$/m)?.[1]
      };
      return hasStructuredEntryData(structuredEntry) ? structuredEntry : { kind: "raw_citation" as const, raw: entry };
    });
}

function parseMedlineEntries(content: string): ReferenceInput[] {
  return content
    .split(/\n\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const structuredEntry = {
        kind: "structured_entry" as const,
        raw: entry,
        title: entry.match(/^TI\s+-\s+(.+)$/m)?.[1],
        authors: [...entry.matchAll(/^FAU\s+-\s+(.+)$/gm)].map((match) => match[1]),
        year: entry.match(/^DP\s+-\s+(\d{4})/m)?.[1]
          ? Number.parseInt(entry.match(/^DP\s+-\s+(\d{4})/m)![1], 10)
          : undefined,
        journal: entry.match(/^JT\s+-\s+(.+)$/m)?.[1],
        pmid: entry.match(/^PMID-\s+(\d+)/m)?.[1],
        doi: entry.match(/^AID\s+-\s+(.+)\s+\[doi\]$/m)?.[1]
      };
      return hasStructuredEntryData(structuredEntry) ? structuredEntry : { kind: "raw_citation" as const, raw: entry };
    });
}

function splitBibtexEntries(content: string): string[] {
  const entries: string[] = [];
  let start = -1;
  let braceDepth = 0;
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const current = content[index];
    const previous = index > 0 ? content[index - 1] : "";
    if (current === "@" && braceDepth === 0 && !inQuotes) {
      if (start !== -1) {
        return [];
      }
      start = index;
      continue;
    }
    if (start === -1) {
      continue;
    }
    if (current === "\"" && previous !== "\\") {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) {
      continue;
    }
    if (current === "{") {
      braceDepth += 1;
      continue;
    }
    if (current === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        return [];
      }
      if (braceDepth === 0) {
        entries.push(content.slice(start, index + 1).trim());
        start = -1;
      }
    }
  }

  return start === -1 && braceDepth === 0 ? entries : [];
}

function parseBibtexEntry(entry: string): ReferenceInput {
  const structuredEntry = {
    kind: "structured_entry" as const,
    raw: entry,
    title: readBibtexField(entry, "title"),
    authors: splitBibtexAuthors(readBibtexField(entry, "author")),
    year: parseBibtexYear(readBibtexField(entry, "year")),
    journal: readBibtexField(entry, "journal"),
    doi: readBibtexField(entry, "doi")
  };
  return hasStructuredEntryData(structuredEntry) ? structuredEntry : { kind: "raw_citation", raw: entry };
}

function readBibtexField(entry: string, field: string): string | undefined {
  const matcher = new RegExp(`${field}\\s*=\\s*([{"])`, "i");
  const match = matcher.exec(entry);
  if (!match) {
    return undefined;
  }
  const delimiter = match[1];
  let cursor = match.index + match[0].length;
  if (delimiter === "{") {
    let depth = 1;
    let value = "";
    while (cursor < entry.length) {
      const current = entry[cursor];
      if (current === "{") {
        depth += 1;
      } else if (current === "}") {
        depth -= 1;
        if (depth === 0) {
          return normalizeFieldValue(value);
        }
      }
      if (depth > 0) {
        value += current;
      }
      cursor += 1;
    }
    return undefined;
  }

  let value = "";
  while (cursor < entry.length) {
    const current = entry[cursor];
    if (current === "\"" && entry[cursor - 1] !== "\\") {
      return normalizeFieldValue(value);
    }
    value += current;
    cursor += 1;
  }
  return undefined;
}

function normalizeFieldValue(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function splitBibtexAuthors(value: string | undefined): string[] | undefined {
  const authors = value?.split(/\sand\s/i).map((item) => item.trim()).filter(Boolean) ?? [];
  return authors.length > 0 ? authors : undefined;
}

function parseBibtexYear(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const year = value.match(/\d{4}/)?.[0];
  return year ? Number.parseInt(year, 10) : undefined;
}

function hasStructuredEntryData(
  entry: Pick<ReferenceInput & { kind: "structured_entry" }, "title" | "authors" | "year" | "journal" | "doi" | "pmid" | "pmcid" | "arxivId">
): boolean {
  return Boolean(
    entry.title ||
      (entry.authors && entry.authors.length > 0) ||
      entry.year ||
      entry.journal ||
      entry.doi ||
      entry.pmid ||
      entry.pmcid ||
      entry.arxivId
  );
}

async function loadRuntimeConfig(options: RepairPaperOptions): Promise<{
  config: RuntimeFactoryConfig;
  effectiveConfig: Record<string, unknown>;
}> {
  const config = applyEnvironment(defaultRuntimeFactoryConfig());
  if (options.configPath) {
    const loaded = JSON.parse(await readFile(options.configPath, "utf8")) as Partial<RuntimeFactoryConfig> & {
      fixtureManifestPath?: string;
    };
    Object.assign(config, loaded);
    if (loaded.fixtureManifestPath) {
      config.fixtureRegistry = await loadFixtureRegistry(loaded.fixtureManifestPath);
    }
  }
  if (options.useLiveConnectors) {
    config.useLiveConnectors = true;
  }
  if (options.fixtureMode) {
    config.fixtureMode = options.fixtureMode;
  }
  if (options.fixtureManifestPath) {
    config.fixtureRegistry = await loadFixtureRegistry(options.fixtureManifestPath);
  }
  return {
    config,
    effectiveConfig: summarizeEffectiveRuntimeConfig(config)
  };
}

async function loadPolicy(options: RepairPaperOptions): Promise<ExitPolicy> {
  let policy = getPolicyPreset(options.policy ?? "default");
  if (options.policyFilePath) {
    policy = await loadPolicyFile(options.policyFilePath, policy);
  }
  return applyPolicyOverrides(policy, {
    failOnFailureClasses: options.failOnFailureClasses,
    maxNotCheckedRatio: options.maxNotCheckedRatio,
    maxUnresolvedRatio: options.maxUnresolvedRatio,
    minVerifiedRatio: options.minVerifiedRatio,
    maxNeedsReviewRatio: options.maxNeedsReviewRatio
  });
}

function applyEnvironment(config: RuntimeFactoryConfig): RuntimeFactoryConfig {
  const semanticScholarApiKey = process.env.REFFORGE_SEMANTIC_SCHOLAR_API_KEY;
  return {
    ...config,
    useLiveConnectors: readBooleanEnv("REFFORGE_USE_LIVE_CONNECTORS", config.useLiveConnectors),
    enablePubmed: readBooleanEnv("REFFORGE_ENABLE_PUBMED", config.enablePubmed),
    enableCrossref: readBooleanEnv("REFFORGE_ENABLE_CROSSREF", config.enableCrossref),
    enableArxiv: readBooleanEnv("REFFORGE_ENABLE_ARXIV", config.enableArxiv),
    enableSemanticScholar: readBooleanEnv("REFFORGE_ENABLE_SEMANTIC_SCHOLAR", config.enableSemanticScholar),
    httpTimeoutMs: readNumberEnv("REFFORGE_HTTP_TIMEOUT_MS", config.httpTimeoutMs),
    httpMaxRetries: readNumberEnv("REFFORGE_HTTP_MAX_RETRIES", config.httpMaxRetries),
    userAgent: process.env.REFFORGE_USER_AGENT ?? config.userAgent,
    contactEmail: process.env.REFFORGE_CONTACT_EMAIL ?? config.contactEmail,
    fixtureMode: readFixtureModeEnv(config.fixtureMode),
    sourceHttpPolicies: {
      ...config.sourceHttpPolicies,
      pubmed: {
        ...config.sourceHttpPolicies.pubmed,
        timeoutMs: readNumberEnv("REFFORGE_PUBMED_TIMEOUT_MS", config.sourceHttpPolicies.pubmed?.timeoutMs ?? config.httpTimeoutMs),
        retries: readNumberEnv("REFFORGE_PUBMED_RETRIES", config.sourceHttpPolicies.pubmed?.retries ?? config.httpMaxRetries)
      },
      crossref: {
        ...config.sourceHttpPolicies.crossref,
        timeoutMs: readNumberEnv("REFFORGE_CROSSREF_TIMEOUT_MS", config.sourceHttpPolicies.crossref?.timeoutMs ?? config.httpTimeoutMs),
        retries: readNumberEnv("REFFORGE_CROSSREF_RETRIES", config.sourceHttpPolicies.crossref?.retries ?? config.httpMaxRetries)
      },
      arxiv: {
        ...config.sourceHttpPolicies.arxiv,
        timeoutMs: readNumberEnv("REFFORGE_ARXIV_TIMEOUT_MS", config.sourceHttpPolicies.arxiv?.timeoutMs ?? config.httpTimeoutMs),
        retries: readNumberEnv("REFFORGE_ARXIV_RETRIES", config.sourceHttpPolicies.arxiv?.retries ?? config.httpMaxRetries)
      },
      semantic_scholar: {
        ...config.sourceHttpPolicies.semantic_scholar,
        timeoutMs: readNumberEnv(
          "REFFORGE_SEMANTIC_SCHOLAR_TIMEOUT_MS",
          config.sourceHttpPolicies.semantic_scholar?.timeoutMs ?? config.httpTimeoutMs
        ),
        retries: readNumberEnv(
          "REFFORGE_SEMANTIC_SCHOLAR_RETRIES",
          config.sourceHttpPolicies.semantic_scholar?.retries ?? config.httpMaxRetries
        ),
        apiKey: semanticScholarApiKey ?? config.sourceHttpPolicies.semantic_scholar?.apiKey,
        apiKeyHeader: semanticScholarApiKey ? "x-api-key" : config.sourceHttpPolicies.semantic_scholar?.apiKeyHeader
      }
    }
  };
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return value === "true";
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readFixtureModeEnv(fallback: FixtureMode): FixtureMode {
  const value = process.env.REFFORGE_FIXTURE_MODE;
  if (value === "off" || value === "prefer" || value === "only") {
    return value;
  }
  return fallback;
}

async function loadPolicyFile(policyPath: string, fallback: ExitPolicy): Promise<ExitPolicy> {
  const loaded = JSON.parse(await readFile(path.resolve(policyPath), "utf8")) as PolicyFileConfig;
  if (loaded.rules) {
    return {
      name: loaded.name ?? loaded.preset ?? fallback.name,
      rules: loaded.rules
    };
  }
  const base = loaded.preset ? getPolicyPreset(loaded.preset) : fallback;
  return {
    ...applyPolicyOverrides(base, loaded),
    name: loaded.name ?? base.name
  };
}

async function loadFixtureRegistry(manifestPath: string): Promise<SourceReplayRegistry> {
  const manifestAbsolutePath = path.resolve(manifestPath);
  const manifestDirectory = path.dirname(manifestAbsolutePath);
  const manifest = JSON.parse(await readFile(manifestAbsolutePath, "utf8")) as {
    entries: Array<
      Omit<SourceReplayEntry, "body"> & {
        body?: string;
        bodyFile?: string;
      }
    >;
  };
  const entries = await Promise.all(
    manifest.entries.map(async (entry) => ({
      key: entry.key,
      source: entry.source,
      disagreementClass: entry.disagreementClass,
      rawResponseFile: entry.rawResponseFile,
      normalizedCandidateFile: entry.normalizedCandidateFile,
      body:
        entry.body ??
        (entry.bodyFile ? await readFile(path.resolve(manifestDirectory, entry.bodyFile), "utf8") : "")
    }))
  );
  return new SourceReplayRegistry(entries);
}

function buildBatchPolicyInput(batch: BatchResult): BatchPolicyInput {
  const counts = buildOutcomeCounts(batch);
  return {
    summary: batch.summary,
    sourceHealth: [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([source, bucket]) => ({
        source,
        matched: bucket.matched,
        empty: bucket.empty,
        failed: bucket.failed,
        enriched: bucket.enriched,
        skipped: bucket.skipped
      })),
    failureSummary: [...counts.entries()]
      .flatMap(([source, bucket]) =>
        [...bucket.failures.entries()].map(([key, count]) => {
          const [failureClass, failureReason] = key.split("::");
          return {
            source,
            failureClass,
            failureReason: failureReason || undefined,
            count
          };
        })
      )
      .sort((left, right) =>
        left.source === right.source
          ? `${left.failureClass}${left.failureReason ?? ""}`.localeCompare(`${right.failureClass}${right.failureReason ?? ""}`)
          : left.source.localeCompare(right.source)
      )
  };
}

function buildOutcomeCounts(batch: BatchResult): Map<
  string,
  {
    matched: number;
    empty: number;
    failed: number;
    enriched: number;
    skipped: number;
    failures: Map<string, number>;
  }
> {
  const counts = new Map<
    string,
    {
      matched: number;
      empty: number;
      failed: number;
      enriched: number;
      skipped: number;
      failures: Map<string, number>;
    }
  >();

  for (const result of batch.results) {
    for (const trace of result.trace) {
      for (const outcome of trace.sourceOutcomes) {
        const bucket =
          counts.get(outcome.source) ??
          {
            matched: 0,
            empty: 0,
            failed: 0,
            enriched: 0,
            skipped: 0,
            failures: new Map<string, number>()
          };
        bucket[outcome.status] += 1;
        if (outcome.failureClass) {
          const key = `${outcome.failureClass}::${outcome.failureReason ?? ""}`;
          bucket.failures.set(key, (bucket.failures.get(key) ?? 0) + 1);
        }
        counts.set(outcome.source, bucket);
      }
    }
  }

  return counts;
}

export function parseFailureClasses(value: string | undefined): SourceFailureClass[] | undefined {
  if (!value) {
    return undefined;
  }
  const allowed = new Set<SourceFailureClass>(["transport_failure", "auth_failure", "rate_limit_failure", "payload_shape_failure"]);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is SourceFailureClass => allowed.has(item as SourceFailureClass));
}
