import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type CandidateRecord,
  normalizeText,
  renderCitation,
  type BatchResult,
  type ReferenceInput,
  type SourceFailureClass,
  type ValidationResult,
  type ValidationStatus
} from "./lib/core/index.js";
import {
  applyPolicyOverrides,
  evaluatePolicy,
  getPolicyPreset,
  type BatchPolicyInput,
  type ExitDecision,
  type ExitPolicy,
  type PolicyOverrides,
  type PolicyPresetName
} from "./lib/policy/index.js";
import {
  buildRuntimeFromConfig,
  defaultRuntimeFactoryConfig,
  summarizeEffectiveRuntimeConfig,
  type FixtureMode,
  SourceReplayRegistry,
  type RuntimeFactoryConfig,
  type SourceReplayEntry
} from "./lib/runtime/index.js";

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
const TITLE_STOP_WORDS = new Set(["with", "from", "that", "this", "into", "using"]);
const TEX_CITE_COMMANDS = "cite|citep|citet|citealt|citealp|citeauthor|citeyear|parencite|textcite|autocite|nocite";

type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];
type DetectedFormat = "bib" | "tex" | "md" | "txt" | "docx";
type RepairOutputFormat = "json" | "bibtex" | "numbered" | "enw";
type RepairMode = "review" | "replacement";
type WriteMode = "preview" | "sidecar" | "replace";
type ReviewStatus = "matched" | "changed" | "ambiguous" | "unresolved" | "unsafe_for_replacement";
type ReplacementEligibility = "safe" | "review_only" | "blocked";
type ReplacementStatus = "ready" | "partial" | "blocked";
type ManifestationDecision = "journal_article" | "conference_paper" | "preprint" | "unknown" | "no_match";
type CurationCategory =
  | "identifier_conflict"
  | "manifestation_conflict"
  | "missing_strong_identifier"
  | "author_format_cleanup"
  | "type_venue_cleanup"
  | "key_consistency_cleanup"
  | "manual_lookup_required";
type CurationPriority = "high" | "medium" | "low";

const MANIFESTATION_POLICY = "journal > conference > arXiv";

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
  originalKey?: string;
  suggestedKey: string;
  parsedKind: ReferenceInput["kind"];
  status: ValidationStatus;
  reviewStatus: ReviewStatus;
  changed: boolean;
  matchedWorkConfidence: number;
  manifestationDecision: ManifestationDecision;
  manifestationConflict: boolean;
  strongIdentifierMatched: boolean;
  replacementEligibility: ReplacementEligibility;
  replacementBlockers: string[];
  confidence: ValidationResult["confidence"];
  issues: ValidationResult["issues"];
  sourceOutcomes: ValidationResult["trace"][number]["sourceOutcomes"];
  bibliographyLintFindings: string[];
  fieldDiffs: RepairFieldDiff[];
  corrected: string;
  correctedEnw?: string;
  replacementBibtex?: string;
  outputFormat: "bibtex" | "numbered";
}

export interface RepairFieldDiff {
  field: string;
  original?: string;
  suggested?: string;
}

export interface RepairKeyMapping {
  entryIndex: number;
  originalKey?: string;
  suggestedKey: string;
  changed: boolean;
}

export interface DuplicateKeyInfo {
  key: string;
  entryIndexes: number[];
  resolvedKeys: string[];
}

export interface UnsafeEntry {
  entryIndex: number;
  originalKey?: string;
  suggestedKey: string;
  reviewStatus: ReviewStatus;
  replacementEligibility: ReplacementEligibility;
  reasons: string[];
}

export interface BibliographyFinding {
  entryIndex: number;
  citationKey?: string;
  severity: "warning" | "error";
  code: string;
  detail: string;
}

export interface CurationWorkItem {
  entryIndex: number;
  citationKey?: string;
  category: CurationCategory;
  priority: CurationPriority;
  reason: string;
  suggestedAction: string;
  candidateSummary?: string;
}

export interface RepairPaperJsonResult {
  mode: RepairMode;
  manifestationPolicy: string;
  selectedFile: string;
  selectionReason: string;
  candidateFiles: CandidateFile[];
  detectedFormat: DetectedFormat;
  referenceSectionFound: boolean;
  referenceSectionSource?: string;
  referencesExtracted: number;
  entries: RepairEntry[];
  proposedOutput: string;
  replacementStatus: ReplacementStatus;
  keyMapping: RepairKeyMapping[];
  duplicateKeys: DuplicateKeyInfo[];
  brokenCitationsRisk: RepairKeyMapping[];
  citationRewriteRequired: RepairKeyMapping[];
  unsafeEntries: UnsafeEntry[];
  bibliographyFindings: BibliographyFinding[];
  curationWorklist: CurationWorkItem[];
  verificationDegraded: boolean;
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
  mode?: RepairMode;
  useLiveConnectors?: boolean;
  fixtureMode?: FixtureMode;
  fixtureManifestPath?: string;
  configPath?: string;
  policy?: PolicyPresetName;
  policyFilePath?: string;
}

export interface ScanWorkspaceResult {
  targetPath: string;
  supportedFileFound: boolean;
  selectedFile?: string;
  selectionReason?: string;
  candidateFiles: CandidateFile[];
}

export interface AnalyzeReferencesResult {
  mode: RepairMode;
  documentSelection: {
    targetPath: string;
    selectedFile: string;
    selectionReason: string;
    candidateFiles: CandidateFile[];
  };
  referenceExtraction: {
    detectedFormat: DetectedFormat;
    referenceSectionFound: boolean;
    referenceSectionSource?: string;
    referencesExtracted: number;
    warnings: string[];
  };
  bibliographyLint: {
    findings: BibliographyFinding[];
  };
  matchingSummary: {
    manifestationPolicy: string;
    verificationDegraded: boolean;
    summary: BatchResult["summary"];
    sourceHealth: BatchPolicyInput["sourceHealth"];
    failureSummary: BatchPolicyInput["failureSummary"];
  };
  reviewSummary: {
    entries: RepairEntry[];
    curationWorklist: CurationWorkItem[];
    unsafeEntries: UnsafeEntry[];
    policyResult: ExitDecision["policyResult"];
    exitCode: number;
  };
  executionSummary: {
    maskedEffectiveConfig: Record<string, unknown>;
    selectedFileOutputFormat: "bibtex" | "numbered";
  };
}

export interface RewritePatch {
  targetFile: string;
  patchKind: "replace_bib_file" | "replace_reference_block" | "write_sidecar_bib" | "emit_report";
  previewText: string;
  applicable: boolean;
  reason?: string;
}

export interface PlanReferenceRewriteOptions extends RepairPaperOptions {
  writeMode?: WriteMode;
}

export interface PlanReferenceRewriteResult {
  analysis: AnalyzeReferencesResult;
  replacementPlan: {
    status: ReplacementStatus;
    safeEntries: RepairEntry[];
    unsafeEntries: UnsafeEntry[];
    keyMapping: RepairKeyMapping[];
    duplicateKeys: DuplicateKeyInfo[];
    citationRewriteRequired: RepairKeyMapping[];
    proposedOutput: string;
    patches: RewritePatch[];
  };
  writePlan: {
    writeMode: WriteMode;
    patches: RewritePatch[];
  };
}

export interface ApplyReferenceRewriteOptions extends PlanReferenceRewriteOptions {
  removeUnresolved?: boolean;
}

export interface CitationKeyRewrite {
  file: string;
  replacements: Array<{ oldKey: string; newKey: string }>;
}

export interface CitationRemoval {
  file: string;
  removedKeys: string[];
  removedNumbers: number[];
  renumberMap: Array<{ oldNumber: number; newNumber: number }>;
}

export interface ApplyReferenceRewriteResult {
  applied: boolean;
  writeMode: Exclude<WriteMode, "preview">;
  targetFilesWritten: string[];
  replacementStatus: ReplacementStatus;
  patches: RewritePatch[];
  citationKeyRewrites: CitationKeyRewrite[];
  citationRemovals: CitationRemoval[];
  removedEntries: Array<{ entryIndex: number; key?: string; reason: string }>;
}

interface OriginalBibEntry {
  raw: string;
  entryType?: string;
  key?: string;
  fields: Record<string, string>;
}

interface RepairDraft {
  entryIndex: number;
  input: ReferenceInput;
  result: ValidationResult;
  outputFormat: "bibtex" | "numbered";
  originalBib?: OriginalBibEntry;
  reviewStatus: ReviewStatus;
  matchedWorkConfidence: number;
  manifestationDecision: ManifestationDecision;
  manifestationConflict: boolean;
  strongIdentifierMatched: boolean;
  replacementEligibility: ReplacementEligibility;
  replacementBlockers: string[];
  bibliographyLintFindings: string[];
  fieldDiffs: RepairFieldDiff[];
  corrected: string;
  correctedEnw?: string;
  replacementBibtex?: string;
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
  const mode = options.mode ?? "review";
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
  const originalBibEntries =
    extracted.detectedFormat === "bib" && extracted.rawEntries.length === inputs.length
      ? extracted.rawEntries.map((entry) => parseOriginalBibEntry(entry))
      : [];
  const drafts = batch.results.map((result, index) =>
    buildRepairDraft(index, inputs[index]!, result, selectedFileOutputFormat, originalBibEntries[index])
  );
  const keyResolution = assignSuggestedKeys(drafts);
  const entries = drafts.map((draft, index) => finalizeRepairEntry(draft, keyResolution.resolvedKeys[index]!, mode));
  const unsafeEntries = entries
    .filter((entry) => entry.replacementEligibility !== "safe")
    .map((entry) => ({
      entryIndex: entry.entryIndex,
      originalKey: entry.originalKey,
      suggestedKey: entry.suggestedKey,
      reviewStatus: entry.reviewStatus,
      replacementEligibility: entry.replacementEligibility,
      reasons: entry.replacementBlockers
    }));
  const keyMapping = entries.map((entry) => ({
    entryIndex: entry.entryIndex,
    originalKey: entry.originalKey,
    suggestedKey: entry.suggestedKey,
    changed: entry.originalKey !== undefined && entry.originalKey !== entry.suggestedKey
  }));
  const changedKeys = keyMapping.filter((mapping) => mapping.changed);
  const replacementStatus = determineReplacementStatus(mode, unsafeEntries, keyResolution.duplicateKeys);
  const proposedOutput = buildProposedOutput(entries, mode, replacementStatus, selectedFileOutputFormat);
  const bibliographyFindings = buildBibliographyFindings(entries, keyResolution.duplicateKeys);
  const curationWorklist = buildCurationWorklist(entries, bibliographyFindings);
  const verificationDegraded = isVerificationDegraded(policyInput.failureSummary);

  return {
    mode,
    manifestationPolicy: MANIFESTATION_POLICY,
    selectedFile: selected.path,
    selectionReason: selected.reason,
    candidateFiles: selected.candidates,
    detectedFormat: extracted.detectedFormat,
    referenceSectionFound: extracted.referenceSectionFound,
    referenceSectionSource: extracted.referenceSectionSource,
    referencesExtracted: extracted.rawEntries.length,
    entries,
    proposedOutput,
    replacementStatus,
    keyMapping,
    duplicateKeys: keyResolution.duplicateKeys,
    brokenCitationsRisk: changedKeys,
    citationRewriteRequired: changedKeys,
    unsafeEntries,
    bibliographyFindings,
    curationWorklist,
    verificationDegraded,
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

export async function scanWorkspace(targetPath: string): Promise<ScanWorkspaceResult> {
  const selected = await selectPaperFile(targetPath);
  return {
    targetPath: path.resolve(targetPath),
    supportedFileFound: Boolean(selected),
    selectedFile: selected?.path,
    selectionReason: selected?.reason,
    candidateFiles: selected?.candidates ?? []
  };
}

export async function analyzeReferences(inputPath: string, options: RepairPaperOptions = {}): Promise<AnalyzeReferencesResult> {
  const payload = await repairPaper(inputPath, {
    ...options,
    mode: options.mode ?? "review"
  });
  return toAnalyzeReferencesResult(inputPath, payload);
}

export async function planReferenceRewrite(
  inputPath: string,
  options: PlanReferenceRewriteOptions = {}
): Promise<PlanReferenceRewriteResult> {
  const writeMode = options.writeMode ?? "preview";
  const payload = await repairPaper(inputPath, {
    ...options,
    mode: "replacement"
  });
  const analysis = toAnalyzeReferencesResult(inputPath, payload);
  const patches = buildRewritePatches(payload, writeMode);
  return {
    analysis,
    replacementPlan: {
      status: payload.replacementStatus,
      safeEntries: payload.entries.filter((entry) => entry.replacementEligibility === "safe"),
      unsafeEntries: payload.unsafeEntries,
      keyMapping: payload.keyMapping,
      duplicateKeys: payload.duplicateKeys,
      citationRewriteRequired: payload.citationRewriteRequired,
      proposedOutput: payload.proposedOutput,
      patches
    },
    writePlan: {
      writeMode,
      patches
    }
  };
}

export async function applyReferenceRewrite(
  inputPath: string,
  options: ApplyReferenceRewriteOptions = {}
): Promise<ApplyReferenceRewriteResult> {
  const writeMode = options.writeMode === "replace" ? "replace" : "sidecar";
  const removeUnresolved = options.removeUnresolved ?? false;
  const plan = await planReferenceRewrite(inputPath, {
    ...options,
    writeMode
  });

  const allEntries = plan.analysis.reviewSummary.entries;
  const unresolvedStatuses = new Set(["unresolved", "not_checked"]);
  const entriesToRemove = removeUnresolved
    ? allEntries.filter((e) => unresolvedStatuses.has(e.status))
    : [];
  const removedKeys = new Set(entriesToRemove.map((e) => e.originalKey ?? e.suggestedKey));
  const removedIndexes = new Set(entriesToRemove.map((e) => e.entryIndex));
  const removedEntries = entriesToRemove.map((e) => ({
    entryIndex: e.entryIndex,
    key: e.originalKey ?? e.suggestedKey,
    reason: `status: ${e.status}`
  }));

  const applicablePatches = plan.writePlan.patches.filter((patch) => patch.applicable);
  if (removeUnresolved && removedIndexes.size > 0) {
    for (const patch of applicablePatches) {
      patch.previewText = filterPatchContent(
        patch.previewText,
        removedIndexes,
        plan.analysis.executionSummary.selectedFileOutputFormat
      );
    }
  }
  for (const patch of applicablePatches) {
    if (patch.patchKind === "replace_bib_file" || patch.patchKind === "write_sidecar_bib") {
      await writeFile(patch.targetFile, patch.previewText, "utf8");
    }
  }

  const citationKeyRewrites: CitationKeyRewrite[] = [];
  const citationRemovals: CitationRemoval[] = [];
  const changedKeys = plan.replacementPlan.keyMapping.filter((m) => m.changed && m.originalKey);
  const selectedFile = plan.analysis.documentSelection.selectedFile;
  const detectedFormat = plan.analysis.referenceExtraction.detectedFormat;

  if (applicablePatches.length > 0) {
    if ((detectedFormat === "bib" || detectedFormat === "tex") && (changedKeys.length > 0 || removedKeys.size > 0)) {
      const citingFiles = await findCitingFiles(selectedFile);
      for (const texFile of citingFiles) {
        if (changedKeys.length > 0) {
          const rewrites = await rewriteCitationKeys(texFile, changedKeys);
          if (rewrites.length > 0) {
            citationKeyRewrites.push({ file: texFile, replacements: rewrites });
          }
        }
        if (removedKeys.size > 0) {
          const removal = await removeTexCitations(texFile, removedKeys);
          if (removal) {
            citationRemovals.push(removal);
          }
        }
      }
    }

    if ((detectedFormat === "md" || detectedFormat === "txt") && removedIndexes.size > 0) {
      const paperFile = plan.analysis.documentSelection.selectedFile;
      const removal = await removeNumberedCitations(paperFile, removedIndexes, allEntries.length);
      if (removal) {
        citationRemovals.push(removal);
      }
    }
  }

  return {
    applied: applicablePatches.length > 0,
    writeMode,
    targetFilesWritten: [
      ...applicablePatches.map((patch) => patch.targetFile),
      ...citationKeyRewrites.map((r) => r.file),
      ...citationRemovals.map((r) => r.file)
    ],
    replacementStatus: plan.replacementPlan.status,
    patches: plan.writePlan.patches,
    citationKeyRewrites,
    citationRemovals,
    removedEntries
  };
}

function filterPatchContent(content: string, removedIndexes: Set<number>, format: "bibtex" | "numbered"): string {
  if (format === "bibtex") {
    const entries = content.split(/\n(?=@)/);
    return entries.filter((_, i) => !removedIndexes.has(i)).join("\n");
  }
  const lines = content.split("\n");
  const kept = lines.filter((_, i) => !removedIndexes.has(i));
  return renumberLines(kept);
}

function renumberLines(lines: string[]): string {
  let num = 1;
  return lines.map((line) => {
    const renumbered = line.replace(/^\s*(\[\d+\]|\d+\.)\s*/, () => `${num}. `);
    if (renumbered !== line) {
      num++;
    }
    return renumbered;
  }).join("\n");
}

async function removeTexCitations(texFile: string, removedKeys: Set<string>): Promise<CitationRemoval | undefined> {
  let content: string;
  try {
    content = await readFile(texFile, "utf8");
  } catch {
    return undefined;
  }

  const removedList = [...removedKeys];
  let updated = content;

  const citePattern = new RegExp(`\\\\(?:${TEX_CITE_COMMANDS})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g");

  updated = updated.replace(citePattern, (match, keysStr: string) => {
    const keys = keysStr.split(",").map((k: string) => k.trim());
    const remaining = keys.filter((k: string) => !removedKeys.has(k));
    if (remaining.length === 0) {
      return "";
    }
    if (remaining.length === keys.length) {
      return match;
    }
    return match.replace(keysStr, remaining.join(", "));
  });

  updated = updated.replace(/ {2,}/g, " ").replace(/ ([.,;])/g, "$1");

  if (updated === content) {
    return undefined;
  }
  await writeFile(texFile, updated, "utf8");
  return { file: texFile, removedKeys: removedList, removedNumbers: [], renumberMap: [] };
}

async function removeNumberedCitations(
  paperFile: string,
  removedIndexes: Set<number>,
  totalEntries: number
): Promise<CitationRemoval | undefined> {
  let content: string;
  try {
    content = await readFile(paperFile, "utf8");
  } catch {
    return undefined;
  }

  const removedNumbers = [...removedIndexes].map((i) => i + 1);
  const renumberLookup = new Map<number, number>();
  const renumberMap: Array<{ oldNumber: number; newNumber: number }> = [];
  let newNum = 1;
  for (let old = 1; old <= totalEntries; old++) {
    if (removedIndexes.has(old - 1)) {
      continue;
    }
    if (old !== newNum) {
      renumberLookup.set(old, newNum);
      renumberMap.push({ oldNumber: old, newNumber: newNum });
    }
    newNum++;
  }

  let updated = content;

  const bracketPattern = /\[(\d+(?:\s*[,;–-]\s*\d+)*)\]/g;
  updated = updated.replace(bracketPattern, (match, inner: string) => {
    const nums = inner.split(/\s*[,;]\s*/).flatMap((part: string) => {
      const range = part.match(/^(\d+)\s*[–-]\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        const result: number[] = [];
        for (let i = start; i <= end; i++) {
          result.push(i);
        }
        return result;
      }
      const n = Number(part.trim());
      return Number.isNaN(n) ? [] : [n];
    });

    const remaining = nums.filter((n: number) => !removedIndexes.has(n - 1));
    if (remaining.length === 0) {
      return "";
    }

    const remapped = remaining.map((n: number) => renumberLookup.get(n) ?? n)
      .sort((a: number, b: number) => a - b);

    return `[${formatNumberList(remapped)}]`;
  });

  updated = updated.replace(/ {2,}/g, " ").replace(/ ([.,;])/g, "$1");

  if (updated === content) {
    return undefined;
  }
  await writeFile(paperFile, updated, "utf8");
  return { file: paperFile, removedKeys: [], removedNumbers, renumberMap };
}

function formatNumberList(nums: number[]): string {
  if (nums.length === 0) {
    return "";
  }
  const ranges: string[] = [];
  let start = nums[0]!;
  let end = start;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === end + 1) {
      end = nums[i]!;
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`);
      start = nums[i]!;
      end = start;
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`);
  return ranges.join(", ");
}

async function findCitingFiles(bibFile: string): Promise<string[]> {
  const bibDir = path.dirname(bibFile);
  const bibName = path.basename(bibFile, ".bib");
  const citing: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(bibDir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.endsWith(".tex")) {
      continue;
    }
    const texPath = path.join(bibDir, entry);
    try {
      const content = await readFile(texPath, "utf8");
      if (
        content.includes(`\\bibliography{${bibName}}`) ||
        content.includes(`\\addbibresource{${bibName}.bib}`) ||
        content.includes(`\\addbibresource{${bibName}}`)
      ) {
        citing.push(texPath);
      }
    } catch {
      continue;
    }
  }
  return citing;
}

async function rewriteCitationKeys(
  texFile: string,
  changedKeys: RepairKeyMapping[]
): Promise<Array<{ oldKey: string; newKey: string }>> {
  let content: string;
  try {
    content = await readFile(texFile, "utf8");
  } catch {
    return [];
  }
  const applied: Array<{ oldKey: string; newKey: string }> = [];
  let updated = content;
  for (const mapping of changedKeys) {
    if (!mapping.originalKey) {
      continue;
    }
    const escaped = mapping.originalKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<=\\\\(?:${TEX_CITE_COMMANDS})(?:\\[[^\\]]*\\])*\\{[^}]*)\\b${escaped}\\b`, "g");
    const before = updated;
    updated = updated.replace(pattern, mapping.suggestedKey);
    if (updated !== before) {
      applied.push({ oldKey: mapping.originalKey, newKey: mapping.suggestedKey });
    }
  }
  if (applied.length > 0) {
    await writeFile(texFile, updated, "utf8");
  }
  return applied;
}

function toAnalyzeReferencesResult(inputPath: string, payload: RepairPaperJsonResult): AnalyzeReferencesResult {
  return {
    mode: payload.mode,
    documentSelection: {
      targetPath: path.resolve(inputPath),
      selectedFile: payload.selectedFile,
      selectionReason: payload.selectionReason,
      candidateFiles: payload.candidateFiles
    },
    referenceExtraction: {
      detectedFormat: payload.detectedFormat,
      referenceSectionFound: payload.referenceSectionFound,
      referenceSectionSource: payload.referenceSectionSource,
      referencesExtracted: payload.referencesExtracted,
      warnings: payload.warnings
    },
    bibliographyLint: {
      findings: payload.bibliographyFindings
    },
    matchingSummary: {
      manifestationPolicy: payload.manifestationPolicy,
      verificationDegraded: payload.verificationDegraded,
      summary: payload.summary,
      sourceHealth: payload.sourceHealth,
      failureSummary: payload.failureSummary
    },
    reviewSummary: {
      entries: payload.entries,
      curationWorklist: payload.curationWorklist,
      unsafeEntries: payload.unsafeEntries,
      policyResult: payload.policyResult,
      exitCode: payload.exitCode
    },
    executionSummary: {
      maskedEffectiveConfig: payload.maskedEffectiveConfig,
      selectedFileOutputFormat: payload.selectedFileOutputFormat
    }
  };
}

export function renderRepairPaperResult(payload: RepairPaperJsonResult, outputFormat: RepairOutputFormat = "json"): string {
  if (outputFormat === "json") {
    return JSON.stringify(payload, null, 2);
  }
  if (payload.mode === "replacement" && payload.replacementStatus === "blocked") {
    return `replacement output is ${payload.replacementStatus}; inspect the JSON result for blockers`;
  }
  if (outputFormat === payload.selectedFileOutputFormat) {
    return payload.proposedOutput;
  }
  const separator = outputFormat === "bibtex" ? "\n\n" : outputFormat === "enw" ? "\n\n" : "\n";
  return payload.entries.map((entry) => convertRepairEntryOutput(entry, outputFormat)).join(separator);
}

function buildCorrectedEntry(result: ValidationResult, outputFormat: "bibtex" | "numbered"): string {
  const candidate = result.preferredManifestation?.representative;
  if (!candidate) {
    return result.input.raw;
  }
  const rendered = renderCitation(candidate);
  return outputFormat === "bibtex" ? rendered.bibtex : rendered.numbered;
}

function convertRepairEntryOutput(entry: RepairEntry, outputFormat: "bibtex" | "numbered" | "enw"): string {
  if (outputFormat === "enw") {
    return entry.correctedEnw ?? entry.original;
  }
  if (outputFormat === "bibtex" && entry.replacementBibtex) {
    return entry.replacementBibtex;
  }
  if (outputFormat === entry.outputFormat) {
    return entry.corrected;
  }
  return entry.original;
}

function buildRepairDraft(
  entryIndex: number,
  input: ReferenceInput,
  result: ValidationResult,
  outputFormat: "bibtex" | "numbered",
  originalBib?: OriginalBibEntry
): RepairDraft {
  const candidate = result.preferredManifestation?.representative;
  const rendered = candidate ? renderCitation(candidate) : undefined;
  const corrected = rendered
    ? (outputFormat === "bibtex" ? rendered.bibtex : rendered.numbered)
    : result.input.raw;
  const correctedEnw = rendered?.enw;
  const fieldDiffs = buildFieldDiffs(input, result, originalBib);
  const bibliographyLintFindings = buildBibliographyLintFindings(input, originalBib);
  const manifestationDecision = deriveManifestationDecision(result, originalBib);
  const manifestationConflict = detectManifestationConflict(result, originalBib, manifestationDecision);
  const matchedWorkConfidence = deriveMatchedWorkConfidence(result);
  const strongIdentifierMatched = hasStrongIdentifierMatch(result);
  const safety = assessReplacementSafety(input, result, fieldDiffs, originalBib, {
    bibliographyLintFindings,
    manifestationDecision,
    manifestationConflict,
    matchedWorkConfidence,
    strongIdentifierMatched
  });
  const reviewStatus = deriveReviewStatus(result, safety.replacementEligibility, fieldDiffs);
  return {
    entryIndex,
    input,
    result,
    outputFormat,
    originalBib,
    reviewStatus,
    matchedWorkConfidence,
    manifestationDecision,
    manifestationConflict,
    strongIdentifierMatched,
    replacementEligibility: safety.replacementEligibility,
    replacementBlockers: safety.replacementBlockers,
    bibliographyLintFindings,
    fieldDiffs,
    corrected,
    correctedEnw,
    replacementBibtex: buildReplacementBibtex(result, originalBib)
  };
}

function finalizeRepairEntry(draft: RepairDraft, suggestedKey: string, mode: RepairMode): RepairEntry {
  const replacementBibtex =
    draft.replacementBibtex && draft.replacementEligibility === "safe"
      ? replaceBibtexKey(draft.replacementBibtex, suggestedKey)
      : draft.replacementBibtex;
  return {
    entryIndex: draft.entryIndex,
    original: draft.input.raw,
    originalKey: draft.originalBib?.key,
    suggestedKey,
    parsedKind: draft.input.kind,
    status: draft.result.status,
    reviewStatus: draft.reviewStatus,
    changed: draft.fieldDiffs.length > 0 || draft.originalBib?.key !== suggestedKey,
    matchedWorkConfidence: draft.matchedWorkConfidence,
    manifestationDecision: draft.manifestationDecision,
    manifestationConflict: draft.manifestationConflict,
    strongIdentifierMatched: draft.strongIdentifierMatched,
    replacementEligibility: draft.replacementEligibility,
    replacementBlockers: draft.replacementBlockers,
    confidence: draft.result.confidence,
    issues: draft.result.issues,
    sourceOutcomes: draft.result.trace.flatMap((trace) => trace.sourceOutcomes),
    bibliographyLintFindings: draft.bibliographyLintFindings,
    fieldDiffs: draft.fieldDiffs,
    corrected: mode === "replacement" && replacementBibtex ? replacementBibtex : draft.corrected,
    correctedEnw: draft.correctedEnw,
    replacementBibtex,
    outputFormat: draft.outputFormat
  };
}

function buildProposedOutput(
  entries: RepairEntry[],
  mode: RepairMode,
  replacementStatus: ReplacementStatus,
  outputFormat: "bibtex" | "numbered"
): string {
  if (mode === "replacement" && replacementStatus === "blocked") {
    return "";
  }
  return entries
    .filter((entry) => mode !== "replacement" || replacementStatus === "ready" || entry.replacementEligibility === "safe")
    .map((entry) => (mode === "replacement" && entry.replacementBibtex ? entry.replacementBibtex : entry.corrected))
    .join(outputFormat === "bibtex" ? "\n\n" : "\n");
}

function determineReplacementStatus(
  mode: RepairMode,
  unsafeEntries: UnsafeEntry[],
  duplicateKeys: DuplicateKeyInfo[]
): ReplacementStatus {
  if (duplicateKeys.length > 0 || unsafeEntries.some((entry) => entry.replacementEligibility === "blocked")) {
    return "blocked";
  }
  if (mode === "review" || unsafeEntries.length > 0) {
    return "partial";
  }
  return "ready";
}

function buildRewritePatches(payload: RepairPaperJsonResult, writeMode: WriteMode): RewritePatch[] {
  const sidecarPath = buildSidecarPath(payload.selectedFile);
  if (writeMode === "preview") {
    return [
      {
        targetFile: payload.selectedFileOutputFormat === "bibtex" ? payload.selectedFile : sidecarPath,
        patchKind: payload.selectedFileOutputFormat === "bibtex" ? "replace_bib_file" : "write_sidecar_bib",
        previewText: payload.proposedOutput,
        applicable: payload.replacementStatus !== "blocked",
        reason:
          payload.replacementStatus === "blocked"
            ? "replacement is blocked; inspect unsafe entries before applying changes"
            : undefined
      }
    ];
  }

  if (writeMode === "replace") {
    const canReplaceInPlace = payload.detectedFormat === "bib" && payload.replacementStatus === "ready";
    return [
      {
        targetFile: payload.selectedFile,
        patchKind: "replace_bib_file",
        previewText: payload.proposedOutput,
        applicable: canReplaceInPlace,
        reason: canReplaceInPlace
          ? undefined
          : payload.detectedFormat !== "bib"
            ? "in-place replacement is only supported for bibliography files"
            : "in-place replacement requires a fully ready replacement plan"
      }
    ];
  }

  return [
    {
      targetFile: sidecarPath,
      patchKind: "write_sidecar_bib",
      previewText: payload.proposedOutput,
      applicable: payload.replacementStatus !== "blocked" && payload.proposedOutput.length > 0,
      reason:
        payload.replacementStatus === "blocked"
          ? "replacement is blocked; no sidecar bibliography was generated"
          : undefined
    }
  ];
}

function buildSidecarPath(selectedFile: string): string {
  const directory = path.dirname(selectedFile);
  const extension = path.extname(selectedFile);
  const stem = path.basename(selectedFile, extension);
  return path.join(directory, `${stem}.citecheck.fixed.bib`);
}

function buildBibliographyFindings(entries: RepairEntry[], duplicateKeys: DuplicateKeyInfo[]): BibliographyFinding[] {
  const findings = entries.flatMap((entry) =>
    entry.bibliographyLintFindings.map((detail) => ({
      entryIndex: entry.entryIndex,
      citationKey: entry.originalKey,
      severity: detail.includes("missing") || detail.includes("shortened") ? "warning" : "error",
      code: classifyBibliographyFindingCode(detail),
      detail
    }))
  );
  for (const duplicate of duplicateKeys) {
    for (const entryIndex of duplicate.entryIndexes) {
      findings.push({
        entryIndex,
        citationKey: entries[entryIndex]?.originalKey,
        severity: "error",
        code: "duplicate_key",
        detail: `generated citation key ${duplicate.key} collides with another entry`
      });
    }
  }
  return findings;
}

function classifyBibliographyFindingCode(detail: string): string {
  if (detail.includes("key year")) {
    return "key_year_mismatch";
  }
  if (detail.includes("entry type and venue")) {
    return "type_venue_mismatch";
  }
  if (detail.includes("author list uses")) {
    return "author_format_cleanup";
  }
  if (detail.includes("missing a strong identifier")) {
    return "missing_strong_identifier";
  }
  if (detail.includes("missing venue metadata")) {
    return "missing_venue_metadata";
  }
  return "bibliography_lint";
}

function buildCurationWorklist(entries: RepairEntry[], findings: BibliographyFinding[]): CurationWorkItem[] {
  const byEntry = new Map<number, BibliographyFinding[]>();
  for (const finding of findings) {
    const list = byEntry.get(finding.entryIndex) ?? [];
    list.push(finding);
    byEntry.set(finding.entryIndex, list);
  }

  return entries.flatMap((entry) => {
    const items: CurationWorkItem[] = [];
    const entryFindings = byEntry.get(entry.entryIndex) ?? [];
    const candidateSummary = summarizeCandidate(entry);

    if (entry.replacementBlockers.some((reason) => reason.includes("identifier mismatch"))) {
      items.push({
        entryIndex: entry.entryIndex,
        citationKey: entry.originalKey,
        category: "identifier_conflict",
        priority: "high",
        reason: "existing identifiers conflict with the selected external candidate",
        suggestedAction: "manually verify DOI/PMID/arXiv id and update the bibliography entry before rerunning citecheck",
        candidateSummary
      });
    }
    if (entry.manifestationConflict) {
      items.push({
        entryIndex: entry.entryIndex,
        citationKey: entry.originalKey,
        category: "manifestation_conflict",
        priority: "high",
        reason: `current entry uses a different manifestation than the selected ${entry.manifestationDecision}`,
        suggestedAction: "choose a canonical version of the work and align title, venue, year, and identifiers to that version",
        candidateSummary
      });
    }
    if (entryFindings.some((finding) => finding.code === "missing_strong_identifier")) {
      items.push({
        entryIndex: entry.entryIndex,
        citationKey: entry.originalKey,
        category: "missing_strong_identifier",
        priority: "medium",
        reason: "the entry has no strong identifier for stable matching",
        suggestedAction: "add DOI, PMID, PMCID, or arXiv id if one exists",
        candidateSummary
      });
    }
    if (entryFindings.some((finding) => finding.code === "author_format_cleanup")) {
      items.push({
        entryIndex: entry.entryIndex,
        citationKey: entry.originalKey,
        category: "author_format_cleanup",
        priority: "medium",
        reason: "author field uses shortened placeholders that weaken matching",
        suggestedAction: "expand the full author list or normalize author formatting",
        candidateSummary
      });
    }
    if (entryFindings.some((finding) => finding.code === "type_venue_mismatch")) {
      items.push({
        entryIndex: entry.entryIndex,
        citationKey: entry.originalKey,
        category: "type_venue_cleanup",
        priority: "high",
        reason: "entry type and venue metadata disagree",
        suggestedAction: "normalize @article/@inproceedings and journal/booktitle to match the chosen manifestation",
        candidateSummary
      });
    }
    if (entryFindings.some((finding) => finding.code === "key_year_mismatch" || finding.code === "duplicate_key")) {
      items.push({
        entryIndex: entry.entryIndex,
        citationKey: entry.originalKey,
        category: "key_consistency_cleanup",
        priority: "medium",
        reason: "citation key is inconsistent with the entry metadata or another generated key",
        suggestedAction: "rename the citation key to a unique, year-consistent form and update LaTeX citations if needed",
        candidateSummary
      });
    }
    if (entry.reviewStatus === "unresolved" || entry.reviewStatus === "ambiguous") {
      items.push({
        entryIndex: entry.entryIndex,
        citationKey: entry.originalKey,
        category: "manual_lookup_required",
        priority: entry.reviewStatus === "unresolved" ? "high" : "medium",
        reason: entry.reviewStatus === "unresolved" ? "no stable external match was found" : "multiple plausible matches remain",
        suggestedAction: "manually confirm the canonical title, venue, year, and identifiers against the source paper",
        candidateSummary
      });
    }

    return deduplicateWorkItems(items);
  });
}

function deduplicateWorkItems(items: CurationWorkItem[]): CurationWorkItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.entryIndex}:${item.category}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function summarizeCandidate(entry: RepairEntry): string | undefined {
  const titleDiff = entry.fieldDiffs.find((diff) => diff.field === "title")?.suggested;
  const venueDiff = entry.fieldDiffs.find((diff) => diff.field === "journal" || diff.field === "booktitle")?.suggested;
  const yearDiff = entry.fieldDiffs.find((diff) => diff.field === "year")?.suggested;
  const parts = [titleDiff, venueDiff, yearDiff].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function isVerificationDegraded(failureSummary: BatchPolicyInput["failureSummary"]): boolean {
  return failureSummary.some(
    (item) => item.failureClass === "rate_limit_failure" || item.failureClass === "payload_shape_failure"
  );
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
      if (isHiddenPathEntry(entry.name)) {
        continue;
      }
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

function isHiddenPathEntry(name: string): boolean {
  return name.startsWith(".");
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

  const authorYearEntries = splitByAuthorYearPattern(lines);
  if (authorYearEntries.length > 1) {
    return authorYearEntries;
  }

  return trimmed
    .split(/\n{2,}/)
    .map((chunk) => cleanReferenceMarker(chunk.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

function splitByAuthorYearPattern(lines: string[]): string[] {
  const joined = lines.map((l) => l.trimRight()).join("\n");
  const dehyphenated = joined.replace(/-\n(\S)/g, "$1");
  const flat = dehyphenated.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  const YEAR_DOT = /\b(19|20)\d{2}[a-z]?\.\s/g;
  const yearPositions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = YEAR_DOT.exec(flat)) !== null) {
    yearPositions.push(m.index);
  }
  if (yearPositions.length < 2) {
    return [];
  }

  const splitPoints: number[] = [];
  for (let i = 1; i < yearPositions.length; i++) {
    const searchStart = yearPositions[i - 1];
    const searchEnd = yearPositions[i];
    const between = flat.slice(searchStart, searchEnd);
    const lastPeriodSpace = between.lastIndexOf(". ");
    if (lastPeriodSpace !== -1) {
      splitPoints.push(searchStart + lastPeriodSpace + 2);
    }
  }

  if (splitPoints.length === 0) {
    return [];
  }

  const entries: string[] = [];
  let prev = 0;
  for (const sp of splitPoints) {
    const chunk = flat.slice(prev, sp).trim();
    if (chunk) {
      entries.push(chunk);
    }
    prev = sp;
  }
  const last = flat.slice(prev).trim();
  if (last) {
    entries.push(last);
  }
  return entries;
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
    journal: readBibtexField(entry, "journal") ?? readBibtexField(entry, "booktitle"),
    doi: readBibtexField(entry, "doi"),
    pmid: readBibtexField(entry, "pmid"),
    pmcid: readBibtexField(entry, "pmcid"),
    arxivId: readBibtexField(entry, "eprint")
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

function parseOriginalBibEntry(entry: string): OriginalBibEntry {
  const headerMatch = entry.match(/^@(\w+)\s*\{\s*([^,]+),/i);
  const fields = parseBibtexFieldMap(entry);
  return {
    raw: entry,
    entryType: headerMatch?.[1]?.toLowerCase(),
    key: headerMatch?.[2]?.trim(),
    fields
  };
}

function parseBibtexFieldMap(entry: string): Record<string, string> {
  const headerMatch = entry.match(/^@\w+\s*\{\s*[^,]+,/);
  if (!headerMatch) {
    return {};
  }
  const body = entry.slice(headerMatch[0].length, Math.max(headerMatch[0].length, entry.lastIndexOf("}")));
  const fields: Record<string, string> = {};
  let cursor = 0;
  while (cursor < body.length) {
    while (cursor < body.length && /[\s,]/.test(body[cursor]!)) {
      cursor += 1;
    }
    if (cursor >= body.length) {
      break;
    }
    const nameStart = cursor;
    while (cursor < body.length && /[\w-]/.test(body[cursor]!)) {
      cursor += 1;
    }
    const fieldName = body.slice(nameStart, cursor).trim().toLowerCase();
    while (cursor < body.length && /\s/.test(body[cursor]!)) {
      cursor += 1;
    }
    if (!fieldName || body[cursor] !== "=") {
      break;
    }
    cursor += 1;
    while (cursor < body.length && /\s/.test(body[cursor]!)) {
      cursor += 1;
    }
    const delimiter = body[cursor];
    if (delimiter === "{") {
      cursor += 1;
      let depth = 1;
      let value = "";
      while (cursor < body.length && depth > 0) {
        const current = body[cursor]!;
        if (current === "{") {
          depth += 1;
        } else if (current === "}") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }
        if (depth > 0) {
          value += current;
        }
        cursor += 1;
      }
      const normalized = normalizeFieldValue(value);
      if (normalized) {
        fields[fieldName] = normalized;
      }
      continue;
    }
    if (delimiter === "\"") {
      cursor += 1;
      let value = "";
      while (cursor < body.length) {
        const current = body[cursor]!;
        if (current === "\"" && body[cursor - 1] !== "\\") {
          cursor += 1;
          break;
        }
        value += current;
        cursor += 1;
      }
      const normalized = normalizeFieldValue(value);
      if (normalized) {
        fields[fieldName] = normalized;
      }
      continue;
    }
    const valueStart = cursor;
    while (cursor < body.length && body[cursor] !== ",") {
      cursor += 1;
    }
    const normalized = normalizeFieldValue(body.slice(valueStart, cursor));
    if (normalized) {
      fields[fieldName] = normalized;
    }
  }
  return fields;
}

function buildFieldDiffs(input: ReferenceInput, result: ValidationResult, originalBib?: OriginalBibEntry): RepairFieldDiff[] {
  const candidate = result.preferredManifestation?.representative;
  if (!candidate) {
    return [];
  }
  const originalFields = originalBib?.fields ?? {};
  const originalAuthor = originalFields.author ?? ("authors" in input ? input.authors?.join(" and ") : undefined);
  const originalTitle = originalFields.title ?? ("title" in input ? input.title : undefined);
  const originalYear = originalFields.year ?? ("year" in input && input.year ? String(input.year) : undefined);
  const originalJournal = originalFields.journal ?? originalFields.booktitle ?? ("journal" in input ? input.journal : undefined);
  const originalDoi = originalFields.doi ?? ("doi" in input ? input.doi : undefined);
  const originalType = originalBib?.entryType;
  const suggestedType = inferReplacementEntryType(candidate, originalBib);
  const suggestedVenue = inferVenueValue(candidate, originalBib, suggestedType);
  const comparisons: Array<RepairFieldDiff | undefined> = [
    createFieldDiff("key", originalBib?.key, buildSuggestedKeyBase(candidate)),
    createFieldDiff("entryType", originalType, suggestedType),
    createFieldDiff("title", originalTitle, candidate.title),
    createFieldDiff("author", originalAuthor, candidate.authors.join(" and ")),
    createFieldDiff("year", originalYear, candidate.year ? String(candidate.year) : undefined),
    createFieldDiff(suggestedType === "inproceedings" ? "booktitle" : "journal", originalJournal, suggestedVenue),
    createFieldDiff("doi", originalDoi, candidate.doi)
  ];
  return comparisons.filter((diff): diff is RepairFieldDiff => diff !== undefined);
}

function createFieldDiff(field: string, original: string | undefined, suggested: string | undefined): RepairFieldDiff | undefined {
  if ((original ?? "").trim() === (suggested ?? "").trim()) {
    return undefined;
  }
  return {
    field,
    original,
    suggested
  };
}

interface ReplacementSafetyContext {
  bibliographyLintFindings: string[];
  manifestationDecision: ManifestationDecision;
  manifestationConflict: boolean;
  matchedWorkConfidence: number;
  strongIdentifierMatched: boolean;
}

function assessReplacementSafety(
  input: ReferenceInput,
  result: ValidationResult,
  fieldDiffs: RepairFieldDiff[],
  originalBib: OriginalBibEntry | undefined,
  context: ReplacementSafetyContext
): Pick<RepairEntry, "replacementEligibility" | "replacementBlockers"> {
  const candidate = result.preferredManifestation?.representative;
  const blockers: string[] = [];
  const reviewOnlyReasons: string[] = [];
  if (!candidate) {
    return {
      replacementEligibility: "blocked",
      replacementBlockers: ["no credible candidate was found"]
    };
  }
  const comparison = result.comparisons.find((entry) => entry.candidateId === candidate.id);
  const identifierMismatchIssues = new Set(["doi_mismatch", "pmid_mismatch", "pmcid_mismatch", "arxiv_mismatch"]);
  if (result.issues.some((issue) => identifierMismatchIssues.has(issue.code))) {
    blockers.push("identifier mismatch between the original entry and the selected candidate");
  }
  if (result.issues.some((issue) => issue.code === "retraction_flagged")) {
    blockers.push("selected candidate is flagged as retracted");
  }
  const identifierMatches = comparison === undefined ? 0 : Object.values(comparison.identifierMatches).filter(Boolean).length;
  const likelyAmbiguous =
    comparison !== undefined &&
    comparison.titleSimilarity >= 0.9 &&
    (comparison.authorOverlap < 0.75 || comparison.yearMatch === false || comparison.journalMatch === false);
  if (context.bibliographyLintFindings.length > 0) {
    blockers.push(...context.bibliographyLintFindings);
  }
  if (context.manifestationConflict) {
    reviewOnlyReasons.push(
      `selected candidate resolves to ${context.manifestationDecision} while the current bibliography entry uses a different manifestation`
    );
  }
  if (blockers.length > 0) {
    return {
      replacementEligibility: "blocked",
      replacementBlockers: blockers
    };
  }
  if (reviewOnlyReasons.length > 0) {
    return {
      replacementEligibility: "review_only",
      replacementBlockers: reviewOnlyReasons
    };
  }
  if (context.strongIdentifierMatched && identifierMatches > 0 && context.matchedWorkConfidence >= 0.85) {
    return {
      replacementEligibility: "safe",
      replacementBlockers: []
    };
  }
  if (
    result.status === "verified_with_warnings" ||
    result.status === "needs_review" ||
    likelyAmbiguous ||
    fieldDiffs.length > 0 ||
    context.matchedWorkConfidence >= 0.6
  ) {
    return {
      replacementEligibility: "review_only",
      replacementBlockers:
        reviewOnlyReasons.length > 0
          ? reviewOnlyReasons
          : [
              context.strongIdentifierMatched
                ? "candidate requires manual review before replacement"
                : "candidate is missing a strong identifier match for safe replacement"
            ]
    };
  }
  return {
    replacementEligibility: "blocked",
    replacementBlockers: ["candidate does not meet replacement safety thresholds"]
  };
}

function deriveReviewStatus(
  result: ValidationResult,
  replacementEligibility: ReplacementEligibility,
  fieldDiffs: RepairFieldDiff[]
): ReviewStatus {
  if (!result.preferredManifestation) {
    return "unresolved";
  }
  if (replacementEligibility === "blocked") {
    return "unsafe_for_replacement";
  }
  if (replacementEligibility === "review_only") {
    return "ambiguous";
  }
  return fieldDiffs.length > 0 ? "changed" : "matched";
}

function assignSuggestedKeys(drafts: RepairDraft[]): {
  resolvedKeys: string[];
  duplicateKeys: DuplicateKeyInfo[];
} {
  const collisions = new Map<string, number[]>();
  for (const draft of drafts) {
    const candidate = draft.result.preferredManifestation?.representative;
    const baseKey = candidate ? buildSuggestedKeyBase(candidate) : draft.originalBib?.key ?? `entry${draft.entryIndex + 1}`;
    const list = collisions.get(baseKey) ?? [];
    list.push(draft.entryIndex);
    collisions.set(baseKey, list);
  }
  const duplicateKeys = [...collisions.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([key, entryIndexes]) => ({
      key,
      entryIndexes,
      resolvedKeys: entryIndexes.map((_, index) => `${key}${String.fromCharCode(97 + index)}`)
    }));
  const resolvedKeys = drafts.map((draft) => {
    const candidate = draft.result.preferredManifestation?.representative;
    const baseKey = candidate ? buildSuggestedKeyBase(candidate) : draft.originalBib?.key ?? `entry${draft.entryIndex + 1}`;
    const indexes = collisions.get(baseKey)!;
    if (indexes.length === 1) {
      return baseKey;
    }
    const suffixIndex = indexes.indexOf(draft.entryIndex);
    return `${baseKey}${String.fromCharCode(97 + suffixIndex)}`;
  });
  return {
    resolvedKeys,
    duplicateKeys
  };
}

function buildSuggestedKeyBase(candidate: CandidateRecord): string {
  const firstAuthor = candidate.authors[0] ?? "";
  const authorParts = firstAuthor.split(/\s+/).filter(Boolean);
  const authorToken =
    firstAuthor.includes(",")
      ? firstAuthor.split(",")[0]!.trim()
      : authorParts.length > 1 && authorParts.at(-1)?.length === 1
        ? authorParts[0]!
        : authorParts.at(-1) ?? "unknown";
  const author = authorToken.toLowerCase().replace(/[^a-z0-9]/g, "") || "unknown";
  const year = candidate.year ?? "nd";
  const titleToken =
    normalizeText(candidate.title)
      .split(" ")
      .find((token) => token.length > 3 && !TITLE_STOP_WORDS.has(token)) ?? "work";
  return `${author}${year}${titleToken}`;
}

function detectKeyYearMismatch(originalBib?: OriginalBibEntry): string | undefined {
  const keyYear = originalBib?.key?.match(/(19|20)\d{2}/)?.[0];
  const entryYear = originalBib?.fields.year?.match(/(19|20)\d{2}/)?.[0];
  if (keyYear && entryYear && keyYear !== entryYear) {
    return `existing key year ${keyYear} does not match entry year ${entryYear}`;
  }
  return undefined;
}

function detectTypeVenueMismatch(originalBib?: OriginalBibEntry): string | undefined {
  if (originalBib?.entryType !== "inproceedings") {
    return undefined;
  }
  const venue = (originalBib.fields.booktitle ?? originalBib.fields.journal ?? "").toLowerCase();
  if (venue.includes("arxiv preprint")) {
    return "entry type and venue are inconsistent: inproceedings uses an arXiv preprint venue";
  }
  return undefined;
}

function buildBibliographyLintFindings(input: ReferenceInput, originalBib?: OriginalBibEntry): string[] {
  const findings = [
    detectKeyYearMismatch(originalBib),
    detectTypeVenueMismatch(originalBib),
    detectAuthorFormatIssue(originalBib),
    detectMissingStrongIdentifier(input, originalBib),
    detectMissingVenueMetadata(originalBib)
  ].filter((finding): finding is string => finding !== undefined);
  return [...new Set(findings)];
}

function detectAuthorFormatIssue(originalBib?: OriginalBibEntry): string | undefined {
  const author = originalBib?.fields.author?.toLowerCase();
  if (!author) {
    return undefined;
  }
  if (author.includes(" and others") || author.includes(" et al") || author.includes(" others")) {
    return "author list uses a shortened placeholder such as 'others' or 'et al'";
  }
  return undefined;
}

function detectMissingStrongIdentifier(input: ReferenceInput, originalBib?: OriginalBibEntry): string | undefined {
  const fields = originalBib?.fields ?? {};
  const hasIdentifier =
    Boolean(fields.doi || fields.pmid || fields.pmcid || fields.eprint || ("doi" in input && input.doi) || ("pmid" in input && input.pmid) || ("pmcid" in input && input.pmcid) || ("arxivId" in input && input.arxivId));
  if (!hasIdentifier) {
    return "entry is missing a strong identifier such as DOI, PMID, PMCID, or arXiv id";
  }
  return undefined;
}

function detectMissingVenueMetadata(originalBib?: OriginalBibEntry): string | undefined {
  if (!originalBib) {
    return undefined;
  }
  const venue = originalBib.fields.journal ?? originalBib.fields.booktitle;
  if (!venue) {
    return "entry is missing venue metadata such as journal or booktitle";
  }
  return undefined;
}

function deriveMatchedWorkConfidence(result: ValidationResult): number {
  const candidate = result.preferredManifestation?.representative;
  const comparison = candidate ? result.comparisons.find((entry) => entry.candidateId === candidate.id) : undefined;
  if (!comparison) {
    return 0;
  }
  const identifierBoost = Object.values(comparison.identifierMatches).some(Boolean) ? 0.3 : 0;
  const titleWeight = comparison.titleSimilarity * 0.45;
  const authorWeight = comparison.authorOverlap * 0.3;
  const yearWeight = comparison.yearMatch === false ? 0 : comparison.yearMatch === true ? 0.15 : 0.08;
  const venueWeight = comparison.journalMatch === false ? 0 : comparison.journalMatch === true ? 0.1 : 0.05;
  return Math.min(1, Number.parseFloat((identifierBoost + titleWeight + authorWeight + yearWeight + venueWeight).toFixed(3)));
}

function hasStrongIdentifierMatch(result: ValidationResult): boolean {
  const candidate = result.preferredManifestation?.representative;
  const comparison = candidate ? result.comparisons.find((entry) => entry.candidateId === candidate.id) : undefined;
  if (!comparison) {
    return false;
  }
  return Boolean(
    comparison.identifierMatches.doi ||
      comparison.identifierMatches.pmid ||
      comparison.identifierMatches.pmcid ||
      comparison.identifierMatches.arxivId
  );
}

function deriveManifestationDecision(result: ValidationResult, originalBib?: OriginalBibEntry): ManifestationDecision {
  const candidateManifestation = result.preferredManifestation?.representative.manifestation;
  if (candidateManifestation) {
    return candidateManifestation;
  }
  const originalManifestation = detectOriginalManifestation(originalBib);
  return originalManifestation ?? "no_match";
}

function detectManifestationConflict(
  result: ValidationResult,
  originalBib: OriginalBibEntry | undefined,
  manifestationDecision: ManifestationDecision
): boolean {
  const originalManifestation = detectOriginalManifestation(originalBib);
  if (!originalManifestation || manifestationDecision === "no_match" || manifestationDecision === "unknown") {
    return false;
  }
  return originalManifestation !== manifestationDecision;
}

function detectOriginalManifestation(originalBib?: OriginalBibEntry): ManifestationDecision | undefined {
  if (!originalBib) {
    return undefined;
  }
  if (originalBib.entryType === "inproceedings") {
    const venue = (originalBib.fields.booktitle ?? originalBib.fields.journal ?? "").toLowerCase();
    if (venue.includes("arxiv preprint")) {
      return "preprint";
    }
    return "conference_paper";
  }
  if (originalBib.fields.eprint || (originalBib.fields.journal ?? "").toLowerCase().includes("arxiv preprint")) {
    return "preprint";
  }
  if (originalBib.entryType === "article" || originalBib.fields.journal) {
    return "journal_article";
  }
  return "unknown";
}

function buildReplacementBibtex(result: ValidationResult, originalBib?: OriginalBibEntry): string | undefined {
  const candidate = result.preferredManifestation?.representative;
  if (!candidate) {
    return undefined;
  }
  const entryType = inferReplacementEntryType(candidate, originalBib);
  const mergedFields = {
    ...(originalBib?.fields ?? {})
  };
  mergedFields.title = candidate.title;
  if (candidate.authors.length > 0) {
    mergedFields.author = candidate.authors.join(" and ");
  }
  if (candidate.year) {
    mergedFields.year = String(candidate.year);
  }
  const venueValue = inferVenueValue(candidate, originalBib, entryType);
  if (entryType === "inproceedings") {
    delete mergedFields.journal;
    if (venueValue) {
      mergedFields.booktitle = venueValue;
    }
  } else {
    delete mergedFields.booktitle;
    if (venueValue) {
      mergedFields.journal = venueValue;
    }
  }
  if (candidate.doi) {
    mergedFields.doi = candidate.doi;
  }
  if (candidate.pmid) {
    mergedFields.pmid = candidate.pmid;
  }
  if (candidate.pmcid) {
    mergedFields.pmcid = candidate.pmcid;
  }
  if (candidate.arxivId) {
    mergedFields.eprint = candidate.arxivId;
    mergedFields.archiveprefix = mergedFields.archiveprefix ?? "arXiv";
  }
  const key = originalBib?.key ?? buildSuggestedKeyBase(candidate);
  return renderBibtexEntry(entryType, key, mergedFields);
}

function inferReplacementEntryType(candidate: CandidateRecord, originalBib?: OriginalBibEntry): string {
  if (candidate.manifestation === "conference_paper") {
    return "inproceedings";
  }
  if (originalBib?.entryType === "inproceedings") {
    const venue = (originalBib.fields.booktitle ?? "").toLowerCase();
    if (!venue.includes("arxiv preprint")) {
      return "inproceedings";
    }
  }
  return "article";
}

function inferVenueValue(candidate: CandidateRecord, originalBib: OriginalBibEntry | undefined, entryType: string): string | undefined {
  if (entryType === "inproceedings") {
    return originalBib?.fields.booktitle ?? candidate.journal ?? originalBib?.fields.journal;
  }
  if (candidate.journal) {
    return candidate.journal;
  }
  if (candidate.manifestation === "preprint" && candidate.arxivId) {
    return `arXiv preprint arXiv:${candidate.arxivId}`;
  }
  return originalBib?.fields.journal ?? originalBib?.fields.booktitle;
}

function renderBibtexEntry(entryType: string, key: string, fields: Record<string, string>): string {
  const orderedFields = [
    "title",
    "author",
    "journal",
    "booktitle",
    "year",
    "volume",
    "number",
    "pages",
    "publisher",
    "doi",
    "pmid",
    "pmcid",
    "eprint",
    "archiveprefix",
    "url",
    "note"
  ];
  const seen = new Set<string>();
  const lines = orderedFields
    .filter((field) => {
      seen.add(field);
      return fields[field];
    })
    .map((field) => `  ${field} = {${fields[field]}}`);
  const remaining = Object.keys(fields)
    .filter((field) => !seen.has(field))
    .sort()
    .map((field) => `  ${field} = {${fields[field]}}`);
  return `@${entryType}{${key},\n${[...lines, ...remaining].join(",\n")}\n}`;
}

function replaceBibtexKey(entry: string, key: string): string {
  return entry.replace(/^@(\w+)\s*\{\s*[^,]+,/i, (_match, entryType: string) => `@${entryType}{${key},`);
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
    batchConcurrency: readNumberEnv("REFFORGE_BATCH_CONCURRENCY", config.batchConcurrency),
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
        retries: readNumberEnv("REFFORGE_PUBMED_RETRIES", config.sourceHttpPolicies.pubmed?.retries ?? config.httpMaxRetries),
        backoffMs: readNumberEnv("REFFORGE_PUBMED_BACKOFF_MS", config.sourceHttpPolicies.pubmed?.backoffMs ?? 500),
        minIntervalMs: readNumberEnv("REFFORGE_PUBMED_MIN_INTERVAL_MS", config.sourceHttpPolicies.pubmed?.minIntervalMs ?? 0)
      },
      crossref: {
        ...config.sourceHttpPolicies.crossref,
        timeoutMs: readNumberEnv("REFFORGE_CROSSREF_TIMEOUT_MS", config.sourceHttpPolicies.crossref?.timeoutMs ?? config.httpTimeoutMs),
        retries: readNumberEnv("REFFORGE_CROSSREF_RETRIES", config.sourceHttpPolicies.crossref?.retries ?? config.httpMaxRetries),
        backoffMs: readNumberEnv("REFFORGE_CROSSREF_BACKOFF_MS", config.sourceHttpPolicies.crossref?.backoffMs ?? 500),
        minIntervalMs: readNumberEnv("REFFORGE_CROSSREF_MIN_INTERVAL_MS", config.sourceHttpPolicies.crossref?.minIntervalMs ?? 0)
      },
      arxiv: {
        ...config.sourceHttpPolicies.arxiv,
        timeoutMs: readNumberEnv("REFFORGE_ARXIV_TIMEOUT_MS", config.sourceHttpPolicies.arxiv?.timeoutMs ?? config.httpTimeoutMs),
        retries: readNumberEnv("REFFORGE_ARXIV_RETRIES", config.sourceHttpPolicies.arxiv?.retries ?? config.httpMaxRetries),
        backoffMs: readNumberEnv("REFFORGE_ARXIV_BACKOFF_MS", config.sourceHttpPolicies.arxiv?.backoffMs ?? 500),
        minIntervalMs: readNumberEnv("REFFORGE_ARXIV_MIN_INTERVAL_MS", config.sourceHttpPolicies.arxiv?.minIntervalMs ?? 0)
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
        backoffMs: readNumberEnv(
          "REFFORGE_SEMANTIC_SCHOLAR_BACKOFF_MS",
          config.sourceHttpPolicies.semantic_scholar?.backoffMs ?? 500
        ),
        minIntervalMs: readNumberEnv(
          "REFFORGE_SEMANTIC_SCHOLAR_MIN_INTERVAL_MS",
          config.sourceHttpPolicies.semantic_scholar?.minIntervalMs ?? 0
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
