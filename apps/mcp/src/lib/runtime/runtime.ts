import {
  buildEvidence,
  clusterCandidates,
  compareCandidate,
  createLocalCandidate,
  deriveIssues,
  deriveStatus,
  mergeClusterFields,
  normalizeReferenceInput,
  scoreComparison,
  selectPreferredManifestation
} from "../core/index.js";
import type {
  BatchResult,
  CandidateComparison,
  CandidateRecord,
  DecisionTrace,
  EvidenceRecord,
  ReferenceInput,
  SourceName,
  TriState,
  ValidationIssue,
  ValidationResult
} from "../core/index.js";
import { toConnectorError, type ReferenceConnector } from "../connectors/index.js";

export interface RuntimeOptions {
  connectors: ReferenceConnector[];
}

export interface VerifyReferenceListOptions {
  sourceFile?: string;
}

const PASS_PLANS: Array<{ sources: SourceName[]; reformulationReason?: string }> = [
  { sources: ["pubmed", "crossref", "arxiv", "semantic_scholar"] },
  { sources: ["pubmed", "crossref", "semantic_scholar"], reformulationReason: "normalized title with author/year anchors" },
  { sources: ["crossref", "semantic_scholar", "arxiv"], reformulationReason: "broadened search after low-evidence retrieval" }
];

export class CitecheckRuntime {
  private readonly connectors: Map<SourceName, ReferenceConnector>;

  public constructor(options: RuntimeOptions) {
    this.connectors = new Map(options.connectors.map((connector) => [connector.source, connector]));
  }

  public async verifyReference(input: ReferenceInput): Promise<ValidationResult> {
    const query = normalizeReferenceInput(input);
    const allCandidates: CandidateRecord[] = [];
    const trace: DecisionTrace[] = [];
    let retractionStatus: TriState = "not_checked";
    let erratumStatus: TriState = "not_checked";

    for (const [index, plan] of PASS_PLANS.entries()) {
      const pass = index + 1;
      const connectors = plan.sources.map((source) => this.connectors.get(source)).filter(Boolean) as ReferenceConnector[];
      const sourceOutcomes: DecisionTrace["sourceOutcomes"] = [];

      for (const connector of connectors) {
        try {
          const result = await connector.search(query);
          allCandidates.push(...result.candidates);
          retractionStatus = mergeTriState(retractionStatus, result.retractionStatus);
          erratumStatus = mergeTriState(erratumStatus, result.erratumStatus);
          const connectorRole = this.connectors.get(result.source)?.role;
          sourceOutcomes.push({
            source: result.source,
            status:
              result.candidates.length === 0
                ? "empty"
                : connectorRole === "enrichment"
                  ? "enriched"
                  : "matched",
            detail:
              result.candidates.length > 0
                ? `returned ${result.candidates.length} candidate(s)`
                : result.sourceWarnings?.join("; ") || "connector returned no candidates"
          });
        } catch (error) {
          const connectorError = toConnectorError(error, connector.source);
          sourceOutcomes.push({
            source: connector.source,
            status: "failed",
            failureClass: connectorError.failureClass,
            failureReason: connectorError.failureReason,
            retryable: connectorError.retryable,
            detail: connectorError.message
          });
        }
      }

      const uniqueCandidates = deduplicateCandidates(allCandidates);
      const promotableCandidates = uniqueCandidates.filter((candidate) => isPromotableCandidate(candidate, this.connectors));
      trace.push({
        pass,
        query: buildTraceQuery(query),
        queriedSources: connectors.map((connector) => connector.source),
        sourceOutcomes,
        candidateCount: promotableCandidates.length,
        reformulationReason: plan.reformulationReason,
        decision: promotableCandidates.length > 0 ? "stop" : "continue",
        detail:
          promotableCandidates.length > 0
            ? "retrieved candidates for evaluation"
            : uniqueCandidates.length > 0
              ? "only enrichment candidates found; continuing to next pass"
              : "no candidates; continuing to next pass"
      });

      if (promotableCandidates.length > 0) {
        return finalizeResult(input, query, promotableCandidates, trace, retractionStatus, erratumStatus);
      }
    }

    const allAttemptsFailed = trace.length > 0 && trace.every((entry) => entry.sourceOutcomes.every((outcome) => outcome.status === "failed"));
    return finalizeResult(input, query, [createLocalCandidate(input)], trace, retractionStatus, erratumStatus, true, allAttemptsFailed);
  }

  public async verifyReferenceList(
    inputs: ReferenceInput[],
    options: VerifyReferenceListOptions = {}
  ): Promise<BatchResult> {
    const results = await Promise.all(inputs.map((input) => this.verifyReference(input)));
    const summary = results.reduce<BatchResult["summary"]>(
      (accumulator, result) => {
        accumulator.total += 1;
        accumulator.byStatus[result.status] += 1;
        return accumulator;
      },
      {
        total: 0,
        byStatus: {
          verified: 0,
          verified_with_warnings: 0,
          needs_review: 0,
          unresolved: 0,
          not_checked: 0
        },
        duplicates: 0
      }
    );
    summary.duplicates = countDuplicateResults(results);

    return {
      generatedAt: new Date().toISOString(),
      sourceFile: options.sourceFile,
      results,
      summary
    };
  }
}

function countDuplicateResults(results: ValidationResult[]): number {
  const seen = new Map<string, number>();
  for (const result of results) {
    const key = buildDuplicateKey(result);
    if (!key) {
      continue;
    }
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function buildDuplicateKey(result: ValidationResult): string | undefined {
  const representative =
    result.preferredManifestation?.representative ??
    result.selectedCluster?.candidates[0];
  if (!representative) {
    return undefined;
  }
  return (
    representative.doi ??
    representative.pmid ??
    representative.pmcid ??
    representative.arxivId ??
    (representative.normalizedTitle
      ? `${representative.normalizedTitle}:${representative.year ?? "unknown"}`
      : undefined)
  );
}

function deduplicateCandidates(candidates: CandidateRecord[]): CandidateRecord[] {
  const seen = new Map<string, CandidateRecord>();
  for (const candidate of candidates) {
    const key = candidate.doi ?? candidate.pmid ?? candidate.pmcid ?? candidate.arxivId ?? `${candidate.source}:${candidate.normalizedTitle}`;
    if (!seen.has(key)) {
      seen.set(key, candidate);
    }
  }
  return [...seen.values()];
}

function buildTraceQuery(query: ReturnType<typeof normalizeReferenceInput>): string {
  return query.doi ?? query.pmid ?? query.pmcid ?? query.arxivId ?? query.title ?? query.raw;
}

function isPromotableCandidate(candidate: CandidateRecord, connectors: Map<SourceName, ReferenceConnector>): boolean {
  const role = connectors.get(candidate.source)?.role;
  if (role !== "enrichment") {
    return true;
  }
  return Boolean(candidate.doi || candidate.pmid || candidate.pmcid || candidate.arxivId);
}

function finalizeResult(
  input: ReferenceInput,
  query: ReturnType<typeof normalizeReferenceInput>,
  candidates: CandidateRecord[],
  trace: DecisionTrace[],
  retractionStatus: TriState,
  erratumStatus: TriState,
  unresolved = false,
  allAttemptsFailed = false
): ValidationResult {
  const clusters = clusterCandidates(candidates);
  const scored = clusters.map((cluster) => {
    const mergedCandidate = mergeClusterFields(cluster);
    const comparison = compareCandidate(query, mergedCandidate);
    const confidence = scoreComparison(comparison, mergedCandidate);
    const evidence = buildEvidence(comparison, mergedCandidate);
    const issues = deriveIssues(query, mergedCandidate, comparison);
    return { cluster, mergedCandidate, comparison, confidence, evidence, issues };
  });
  scored.sort((left, right) => {
    if (right.confidence.retrieval !== left.confidence.retrieval) {
      return right.confidence.retrieval - left.confidence.retrieval;
    }
    return right.confidence.metadataConsistency - left.confidence.metadataConsistency;
  });

  const winner = unresolved ? undefined : scored[0];
  if (!winner) {
    return {
      input,
      query,
      alternatives: [],
      evidence: [],
      comparisons: [],
      issues: [
        {
          code: "insufficient_evidence",
          severity: "error",
          field: "candidate",
          detail: "No credible candidate was found"
        }
      ],
      trace,
      confidence: { retrieval: 0, metadataConsistency: 0 },
      status: allAttemptsFailed ? "not_checked" : "unresolved",
      retractionStatus,
      erratumStatus
    };
  }

  const preferredManifestation = selectPreferredManifestation(winner.cluster);
  const manifestationConflict = winner.cluster.manifestations.length > 1;
  const issues = [...winner.issues];
  if (manifestationConflict) {
    issues.push({
      code: "manifestation_conflict",
      severity: "warning",
      field: "manifestation",
      detail: "Multiple manifestations detected for the same work cluster"
    });
  }
  if (retractionStatus === "flagged") {
    issues.push({
      code: "retraction_flagged",
      severity: "warning",
      field: "retraction",
      detail: "Retraction signal returned by connector"
    });
  }
  if (erratumStatus === "flagged") {
    issues.push({
      code: "erratum_flagged",
      severity: "warning",
      field: "erratum",
      detail: "Erratum or correction signal returned by connector"
    });
  }
  const evidence = [...winner.evidence];
  if (manifestationConflict) {
    evidence.push({
      kind: "manifestation_link",
      source: "runtime",
      field: "manifestation",
      score: 0.8,
      detail: "linked preprint and journal manifestations within one work cluster"
    });
  }
  const status = deriveStatus(winner.confidence, issues);

  return {
    input,
    query,
    selectedCluster: winner.cluster,
    preferredManifestation,
    alternatives: scored.slice(1).map((item) => item.cluster),
    evidence,
    comparisons: buildComparisons(scored),
    issues,
    trace,
    confidence: winner.confidence,
    status,
    retractionStatus,
    erratumStatus
  };
}

function buildComparisons(
  scored: Array<{
    comparison: CandidateComparison;
    evidence: EvidenceRecord[];
    issues: ValidationIssue[];
    confidence: { retrieval: number; metadataConsistency: number };
  }>
): CandidateComparison[] {
  return scored.map((item) => item.comparison);
}

function mergeTriState(current: TriState, next?: TriState): TriState {
  if (!next) {
    return current;
  }
  if (current === "flagged" || next === "flagged") {
    return "flagged";
  }
  if (current === "clear" || next === "clear") {
    return "clear";
  }
  return "not_checked";
}
