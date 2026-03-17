export type InputKind = "identifier" | "structured_entry" | "raw_citation";
export type SourceName = "crossref" | "pubmed" | "semantic_scholar" | "arxiv" | "local";
export type EvidenceKind =
  | "identifier_exact"
  | "identifier_partial"
  | "title_similarity"
  | "author_overlap"
  | "year_match"
  | "year_mismatch"
  | "venue_match"
  | "venue_mismatch"
  | "manifestation_link"
  | "source_field_trust"
  | "retraction_check"
  | "erratum_check";
export type ManifestationType = "journal_article" | "preprint" | "conference_paper" | "unknown";
export type ValidationStatus =
  | "verified"
  | "verified_with_warnings"
  | "needs_review"
  | "unresolved"
  | "not_checked";
export type TriState = "clear" | "flagged" | "not_checked";
export type SourceFailureClass =
  | "transport_failure"
  | "auth_failure"
  | "rate_limit_failure"
  | "payload_shape_failure";
export type SourceFailureReason =
  | "http_error"
  | "timeout"
  | "json_parse_failure"
  | "xml_parse_failure"
  | "missing_required_top_level"
  | "missing_required_entry_fields"
  | "missing_enrichment_critical_fields"
  | "unknown_failure";

export interface IdentifierInput {
  kind: "identifier";
  raw: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
}

export interface StructuredEntryInput {
  kind: "structured_entry";
  raw: string;
  title?: string;
  authors?: string[];
  year?: number;
  journal?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
  pages?: string;
  volume?: string;
  issue?: string;
}

export interface RawCitationInput {
  kind: "raw_citation";
  raw: string;
}

export type ReferenceInput = IdentifierInput | StructuredEntryInput | RawCitationInput;

export interface NormalizedQuery {
  kind: InputKind;
  raw: string;
  title?: string;
  titleNormalized?: string;
  authors: string[];
  authorTokens: string[];
  year?: number;
  journal?: string;
  journalNormalized?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
}

export interface CandidateRecord {
  id: string;
  source: SourceName;
  sourceRecordId?: string;
  retrievedAt?: string;
  rawSourceType?: string;
  title: string;
  normalizedTitle: string;
  authors: string[];
  normalizedAuthors: string[];
  year?: number;
  journal?: string;
  normalizedJournal?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
  abstract?: string;
  citationCount?: number;
  manifestation: ManifestationType;
  sourceUrl?: string;
  missingFields?: string[];
  sourceWarnings?: string[];
}

export interface EvidenceRecord {
  kind: EvidenceKind;
  source: SourceName | "runtime";
  field: string;
  score: number;
  detail: string;
}

export interface CandidateComparison {
  candidateId: string;
  titleSimilarity: number;
  authorOverlap: number;
  yearMatch: boolean | null;
  journalMatch: boolean | null;
  identifierMatches: {
    doi: boolean;
    pmid: boolean;
    pmcid: boolean;
    arxivId: boolean;
  };
}

export interface WorkCluster {
  id: string;
  canonicalTitle: string;
  candidates: CandidateRecord[];
  manifestations: ManifestationRecord[];
}

export interface ManifestationRecord {
  id: string;
  manifestation: ManifestationType;
  representative: CandidateRecord;
  supportingCandidates: CandidateRecord[];
}

export interface ValidationIssue {
  code:
    | "doi_mismatch"
    | "pmid_mismatch"
    | "pmcid_mismatch"
    | "arxiv_mismatch"
    | "title_mismatch"
    | "author_mismatch"
    | "year_mismatch"
    | "journal_mismatch"
    | "manifestation_conflict"
    | "retraction_flagged"
    | "erratum_flagged"
    | "missing_identifier"
    | "insufficient_evidence";
  severity: "info" | "warning" | "error";
  field: string;
  observed?: string;
  expected?: string;
  detail: string;
}

export interface DecisionTrace {
  pass: number;
  query: string;
  queriedSources: SourceName[];
  sourceOutcomes: Array<{
    source: SourceName;
    status: "matched" | "empty" | "failed" | "skipped" | "enriched";
    failureClass?: SourceFailureClass;
    failureReason?: SourceFailureReason;
    retryable?: boolean;
    detail: string;
  }>;
  candidateCount: number;
  reformulationReason?: string;
  decision: "continue" | "stop";
  detail: string;
}

export interface ConfidenceScores {
  retrieval: number;
  metadataConsistency: number;
}

export interface ValidationResult {
  input: ReferenceInput;
  query: NormalizedQuery;
  selectedCluster?: WorkCluster;
  preferredManifestation?: ManifestationRecord;
  alternatives: WorkCluster[];
  evidence: EvidenceRecord[];
  comparisons: CandidateComparison[];
  issues: ValidationIssue[];
  trace: DecisionTrace[];
  confidence: ConfidenceScores;
  status: ValidationStatus;
  retractionStatus: TriState;
  erratumStatus: TriState;
}

export interface BatchSummary {
  total: number;
  byStatus: Record<ValidationStatus, number>;
  duplicates: number;
}

export interface BatchResult {
  generatedAt: string;
  sourceFile?: string;
  results: ValidationResult[];
  summary: BatchSummary;
}

export interface FieldTrustProfile {
  doi: SourceName[];
  pmid: SourceName[];
  pmcid: SourceName[];
  arxivId: SourceName[];
  title: SourceName[];
  authors: SourceName[];
  year: SourceName[];
  journal: SourceName[];
}

export interface RenderedCitation {
  bibtex: string;
  numbered: string;
  cslJson: Record<string, unknown>;
}

const DOI_PATTERN = /(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i;
const PMID_PATTERN = /\bPMID\s*:?[\s#]*(\d+)\b/i;
const PMCID_PATTERN = /\bPMCID\s*:?[\s#]*(PMC\d+)\b/i;
const ARXIV_PATTERN = /\b(?:arXiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)\b/i;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDoi(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(DOI_PATTERN);
  return match?.[1].replace(/[.,;:]+$/, "").toLowerCase();
}

export function normalizePmid(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\d+/);
  return match?.[0];
}

export function normalizePmcid(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/PMC\d+/i);
  return match?.[0].toUpperCase();
}

export function normalizeArxivId(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(ARXIV_PATTERN);
  return match?.[1].toLowerCase();
}

function splitAuthors(value: string): string[] {
  return value
    .split(/\band\b|,|;/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseRawCitation(raw: string): StructuredEntryInput {
  const doi = normalizeDoi(raw);
  const pmid = normalizePmid(raw.match(PMID_PATTERN)?.[1]);
  const pmcid = normalizePmcid(raw.match(PMCID_PATTERN)?.[1]);
  const arxivId = normalizeArxivId(raw.match(ARXIV_PATTERN)?.[1]);
  const yearMatch = raw.match(YEAR_PATTERN);
  const segments = raw.split(".").map((segment) => segment.trim()).filter(Boolean);
  const title = segments[1] ?? segments[0];
  const authors = segments[0] ? splitAuthors(segments[0]) : [];
  const journal = segments[2];

  return {
    kind: "structured_entry",
    raw,
    title,
    authors,
    year: yearMatch ? Number.parseInt(yearMatch[0], 10) : undefined,
    journal,
    doi,
    pmid,
    pmcid,
    arxivId
  };
}

export function normalizeReferenceInput(input: ReferenceInput): NormalizedQuery {
  const structured =
    input.kind === "raw_citation"
      ? parseRawCitation(input.raw)
      : input.kind === "identifier"
        ? {
            kind: "structured_entry" as const,
            raw: input.raw,
            doi: input.doi ?? normalizeDoi(input.raw),
            pmid: input.pmid ?? normalizePmid(input.raw.match(PMID_PATTERN)?.[1]),
            pmcid: input.pmcid ?? normalizePmcid(input.raw.match(PMCID_PATTERN)?.[1]),
            arxivId: input.arxivId ?? normalizeArxivId(input.raw.match(ARXIV_PATTERN)?.[1])
          }
        : input;

  const title = structured.title?.trim();
  const authors = structured.authors?.map((author) => author.trim()).filter(Boolean) ?? [];
  const journal = structured.journal?.trim();

  return {
    kind: input.kind,
    raw: input.raw,
    title,
    titleNormalized: title ? normalizeText(title) : undefined,
    authors,
    authorTokens: authors.map(normalizeText),
    year: structured.year,
    journal,
    journalNormalized: journal ? normalizeText(journal) : undefined,
    doi: normalizeDoi(structured.doi),
    pmid: normalizePmid(structured.pmid),
    pmcid: normalizePmcid(structured.pmcid),
    arxivId: normalizeArxivId(structured.arxivId)
  };
}

export function normalizeCandidate(candidate: CandidateRecord): CandidateRecord {
  return {
    ...candidate,
    normalizedTitle: normalizeText(candidate.title),
    normalizedAuthors: candidate.authors.map(normalizeText),
    normalizedJournal: candidate.journal ? normalizeText(candidate.journal) : undefined,
    doi: normalizeDoi(candidate.doi),
    pmid: normalizePmid(candidate.pmid),
    pmcid: normalizePmcid(candidate.pmcid),
    arxivId: normalizeArxivId(candidate.arxivId),
    missingFields: candidate.missingFields ?? [],
    sourceWarnings: candidate.sourceWarnings ?? []
  };
}

export const BIOMEDICAL_TRUST_PROFILE: FieldTrustProfile = {
  doi: ["crossref", "pubmed", "semantic_scholar", "arxiv"],
  pmid: ["pubmed", "crossref", "semantic_scholar", "arxiv"],
  pmcid: ["pubmed", "crossref", "semantic_scholar", "arxiv"],
  arxivId: ["arxiv", "semantic_scholar", "crossref", "pubmed"],
  title: ["pubmed", "crossref", "semantic_scholar", "arxiv"],
  authors: ["pubmed", "crossref", "semantic_scholar", "arxiv"],
  year: ["pubmed", "crossref", "semantic_scholar", "arxiv"],
  journal: ["pubmed", "crossref", "semantic_scholar", "arxiv"]
};

function jaccardScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

export function compareCandidate(query: NormalizedQuery, candidate: CandidateRecord): CandidateComparison {
  const queryTitle = query.titleNormalized ?? "";
  const titleTokens = queryTitle.split(" ").filter(Boolean);
  const candidateTitleTokens = candidate.normalizedTitle.split(" ").filter(Boolean);
  const titleSimilarity = queryTitle ? jaccardScore(titleTokens, candidateTitleTokens) : 0;
  const authorOverlap = jaccardScore(query.authorTokens, candidate.normalizedAuthors);

  return {
    candidateId: candidate.id,
    titleSimilarity,
    authorOverlap,
    yearMatch: query.year && candidate.year ? query.year === candidate.year : null,
    journalMatch:
      query.journalNormalized && candidate.normalizedJournal
        ? query.journalNormalized === candidate.normalizedJournal
        : null,
    identifierMatches: {
      doi: Boolean(query.doi && candidate.doi && normalizeDoi(query.doi) === normalizeDoi(candidate.doi)),
      pmid: Boolean(query.pmid && candidate.pmid && normalizePmid(query.pmid) === normalizePmid(candidate.pmid)),
      pmcid: Boolean(
        query.pmcid && candidate.pmcid && normalizePmcid(query.pmcid) === normalizePmcid(candidate.pmcid)
      ),
      arxivId: Boolean(
        query.arxivId && candidate.arxivId && normalizeArxivId(query.arxivId) === normalizeArxivId(candidate.arxivId)
      )
    }
  };
}

export function buildEvidence(
  comparison: CandidateComparison,
  candidate: CandidateRecord,
  trustProfile: FieldTrustProfile = BIOMEDICAL_TRUST_PROFILE
): EvidenceRecord[] {
  const evidence: EvidenceRecord[] = [];
  const trustedTitleSource = trustProfile.title[0];
  evidence.push({
    kind: "title_similarity",
    source: candidate.source,
    field: "title",
    score: comparison.titleSimilarity,
    detail: `title similarity=${comparison.titleSimilarity.toFixed(2)}`
  });
  evidence.push({
    kind: "author_overlap",
    source: candidate.source,
    field: "authors",
    score: comparison.authorOverlap,
    detail: `author overlap=${comparison.authorOverlap.toFixed(2)}`
  });

  for (const [field, matched] of Object.entries(comparison.identifierMatches)) {
    if (!matched) {
      continue;
    }
    evidence.push({
      kind: "identifier_exact",
      source: candidate.source,
      field,
      score: 1,
      detail: `${field} exact match`
    });
  }

  if (comparison.yearMatch !== null) {
    evidence.push({
      kind: comparison.yearMatch ? "year_match" : "year_mismatch",
      source: candidate.source,
      field: "year",
      score: comparison.yearMatch ? 1 : 0,
      detail: comparison.yearMatch ? "year matches input" : "year differs from input"
    });
  }

  evidence.push({
    kind: "source_field_trust",
    source: "runtime",
    field: "title",
    score: candidate.source === trustedTitleSource ? 1 : 0.5,
    detail: `${candidate.source} trust applied for title field`
  });

  return evidence;
}

export function scoreComparison(comparison: CandidateComparison, candidate: CandidateRecord): ConfidenceScores {
  const identifierScore = Object.values(comparison.identifierMatches).some(Boolean) ? 1 : 0;
  const retrieval = Math.min(
    1,
    identifierScore * 0.7 + comparison.titleSimilarity * 0.2 + comparison.authorOverlap * 0.1
  );
  const metadataConsistency = Math.max(
    0,
    Math.min(
      1,
      comparison.titleSimilarity * 0.45 +
        comparison.authorOverlap * 0.25 +
        (comparison.yearMatch === null ? 0.15 : comparison.yearMatch ? 0.15 : 0) +
        (comparison.journalMatch === null ? 0.15 : comparison.journalMatch ? 0.15 : 0)
    )
  );
  const citationBonus = candidate.citationCount ? Math.min(0.05, Math.log10(candidate.citationCount + 1) / 100) : 0;

  return {
    retrieval: Math.min(1, retrieval + citationBonus),
    metadataConsistency
  };
}

export function deriveIssues(query: NormalizedQuery, candidate: CandidateRecord, comparison: CandidateComparison): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (query.doi && !comparison.identifierMatches.doi) {
    issues.push({
      code: "doi_mismatch",
      severity: "warning",
      field: "doi",
      observed: query.doi,
      expected: candidate.doi,
      detail: "DOI does not match selected candidate"
    });
  }
  if (query.pmid && !comparison.identifierMatches.pmid) {
    issues.push({
      code: "pmid_mismatch",
      severity: "warning",
      field: "pmid",
      observed: query.pmid,
      expected: candidate.pmid,
      detail: "PMID does not match selected candidate"
    });
  }
  if (query.pmcid && !comparison.identifierMatches.pmcid) {
    issues.push({
      code: "pmcid_mismatch",
      severity: "warning",
      field: "pmcid",
      observed: query.pmcid,
      expected: candidate.pmcid,
      detail: "PMCID does not match selected candidate"
    });
  }
  if (query.arxivId && !comparison.identifierMatches.arxivId) {
    issues.push({
      code: "arxiv_mismatch",
      severity: "warning",
      field: "arxivId",
      observed: query.arxivId,
      expected: candidate.arxivId,
      detail: "arXiv ID does not match selected candidate"
    });
  }
  if (comparison.titleSimilarity < 0.75 && query.title) {
    issues.push({
      code: "title_mismatch",
      severity: "warning",
      field: "title",
      observed: query.title,
      expected: candidate.title,
      detail: "Title similarity below expected threshold"
    });
  }
  if (comparison.authorOverlap < 0.5 && query.authors.length > 0) {
    issues.push({
      code: "author_mismatch",
      severity: "warning",
      field: "authors",
      observed: query.authors.join(", "),
      expected: candidate.authors.join(", "),
      detail: "Author overlap below expected threshold"
    });
  }
  if (comparison.yearMatch === false) {
    issues.push({
      code: "year_mismatch",
      severity: "warning",
      field: "year",
      observed: String(query.year),
      expected: candidate.year ? String(candidate.year) : undefined,
      detail: "Publication year differs from input"
    });
  }
  if (comparison.journalMatch === false) {
    issues.push({
      code: "journal_mismatch",
      severity: "warning",
      field: "journal",
      observed: query.journal,
      expected: candidate.journal,
      detail: "Journal or venue differs from input"
    });
  }
  if (!query.doi && !query.pmid && !query.pmcid && !query.arxivId) {
    issues.push({
      code: "missing_identifier",
      severity: "info",
      field: "identifier",
      detail: "Input did not include a strong identifier"
    });
  }
  return issues;
}

export function deriveStatus(scores: ConfidenceScores, issues: ValidationIssue[]): ValidationStatus {
  const hasMajorContradiction = issues.some((issue) => issue.severity === "error");
  const hasWarnings = issues.some((issue) => issue.severity === "warning");
  if (hasMajorContradiction) {
    return "needs_review";
  }
  if (scores.retrieval >= 0.85 && scores.metadataConsistency >= 0.75 && !hasWarnings) {
    return "verified";
  }
  if (scores.retrieval >= 0.85 && scores.metadataConsistency >= 0.5) {
    return "verified_with_warnings";
  }
  if (scores.retrieval >= 0.6) {
    return "needs_review";
  }
  return "unresolved";
}

export function trustOrderForField(field: keyof FieldTrustProfile, trustProfile: FieldTrustProfile): SourceName[] {
  return trustProfile[field];
}

export function createLocalCandidate(input: ReferenceInput): CandidateRecord {
  const query = normalizeReferenceInput(input);
  return {
    id: `local:${normalizeText(query.raw)}`,
    source: "local",
    sourceRecordId: `local:${normalizeText(query.raw)}`,
    retrievedAt: new Date().toISOString(),
    rawSourceType: "local-input",
    title: query.title ?? query.raw,
    normalizedTitle: normalizeText(query.title ?? query.raw),
    authors: query.authors,
    normalizedAuthors: query.authorTokens,
    year: query.year,
    journal: query.journal,
    normalizedJournal: query.journalNormalized,
    doi: query.doi,
    pmid: query.pmid,
    pmcid: query.pmcid,
    arxivId: query.arxivId,
    manifestation: query.arxivId ? "preprint" : "unknown",
    missingFields: ["external_evidence"],
    sourceWarnings: ["local fallback candidate only"]
  };
}

function chooseFieldValue(
  field: keyof Pick<CandidateRecord, "doi" | "pmid" | "pmcid" | "arxivId" | "title" | "authors" | "year" | "journal">,
  candidates: CandidateRecord[],
  trustProfile: FieldTrustProfile
): CandidateRecord | undefined {
  const order = trustOrderForField(field, trustProfile as FieldTrustProfile);
  for (const source of order) {
    const preferred = candidates.find((candidate) => candidate.source === source && candidate[field] !== undefined);
    if (preferred) {
      return preferred;
    }
  }
  return candidates.find((candidate) => candidate[field] !== undefined);
}

export function clusterCandidates(candidates: CandidateRecord[]): WorkCluster[] {
  const clusters: WorkCluster[] = [];

  for (const candidate of candidates) {
    const match = clusters.find((cluster) =>
      cluster.candidates.some((existing) => {
        const sharedDoi = candidate.doi && existing.doi && candidate.doi === existing.doi;
        const sharedPmid = candidate.pmid && existing.pmid && candidate.pmid === existing.pmid;
        const titleSimilarity =
          compareCandidate(
            {
              kind: "structured_entry",
              raw: candidate.title,
              title: candidate.title,
              titleNormalized: candidate.normalizedTitle,
              authors: candidate.authors,
              authorTokens: candidate.normalizedAuthors,
              year: candidate.year,
              journal: candidate.journal,
              journalNormalized: candidate.normalizedJournal,
              doi: candidate.doi,
              pmid: candidate.pmid,
              pmcid: candidate.pmcid,
              arxivId: candidate.arxivId
            },
            existing
          ).titleSimilarity;
        return Boolean(sharedDoi || sharedPmid || titleSimilarity >= 0.8);
      })
    );

    if (match) {
      match.candidates.push(candidate);
      continue;
    }

    clusters.push({
      id: `cluster:${clusters.length + 1}`,
      canonicalTitle: candidate.title,
      candidates: [candidate],
      manifestations: []
    });
  }

  return clusters.map((cluster) => ({
    ...cluster,
    manifestations: buildManifestations(cluster.candidates)
  }));
}

export function buildManifestations(candidates: CandidateRecord[]): ManifestationRecord[] {
  const groups = new Map<string, CandidateRecord[]>();
  for (const candidate of candidates) {
    const key = `${candidate.manifestation}:${candidate.doi ?? candidate.pmid ?? candidate.arxivId ?? normalizeText(candidate.title)}`;
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, supportingCandidates]) => ({
    id: `manifestation:${key}`,
    manifestation: supportingCandidates[0]?.manifestation ?? "unknown",
    representative: supportingCandidates[0]!,
    supportingCandidates
  }));
}

export function selectPreferredManifestation(
  cluster: WorkCluster,
  trustProfile: FieldTrustProfile = BIOMEDICAL_TRUST_PROFILE
): ManifestationRecord | undefined {
  const journalManifestation = cluster.manifestations.find((manifestation) => manifestation.manifestation === "journal_article");
  if (journalManifestation) {
    return journalManifestation;
  }
  return cluster.manifestations
    .slice()
    .sort((left, right) => preferredSourceScore(right.representative.source, trustProfile) - preferredSourceScore(left.representative.source, trustProfile))[0];
}

function preferredSourceScore(source: SourceName, trustProfile: FieldTrustProfile): number {
  const order = trustProfile.title;
  const index = order.indexOf(source);
  return index === -1 ? 0 : order.length - index;
}

export function mergeClusterFields(
  cluster: WorkCluster,
  trustProfile: FieldTrustProfile = BIOMEDICAL_TRUST_PROFILE
): CandidateRecord {
  const titleRecord = chooseFieldValue("title", cluster.candidates, trustProfile);
  const authorRecord = chooseFieldValue("authors", cluster.candidates, trustProfile);
  const yearRecord = chooseFieldValue("year", cluster.candidates, trustProfile);
  const journalRecord = chooseFieldValue("journal", cluster.candidates, trustProfile);
  const doiRecord = chooseFieldValue("doi", cluster.candidates, trustProfile);
  const pmidRecord = chooseFieldValue("pmid", cluster.candidates, trustProfile);
  const pmcidRecord = chooseFieldValue("pmcid", cluster.candidates, trustProfile);
  const arxivRecord = chooseFieldValue("arxivId", cluster.candidates, trustProfile);
  const representative = selectPreferredManifestation(cluster, trustProfile)?.representative ?? cluster.candidates[0];

  return {
    ...representative,
    title: titleRecord?.title ?? representative.title,
    normalizedTitle: normalizeText(titleRecord?.title ?? representative.title),
    authors: authorRecord?.authors ?? representative.authors,
    normalizedAuthors: (authorRecord?.authors ?? representative.authors).map(normalizeText),
    year: yearRecord?.year ?? representative.year,
    journal: journalRecord?.journal ?? representative.journal,
    normalizedJournal: journalRecord?.journal ? normalizeText(journalRecord.journal) : representative.normalizedJournal,
    doi: doiRecord?.doi ?? representative.doi,
    pmid: pmidRecord?.pmid ?? representative.pmid,
    pmcid: pmcidRecord?.pmcid ?? representative.pmcid,
    arxivId: arxivRecord?.arxivId ?? representative.arxivId
  };
}

function citeKey(candidate: CandidateRecord): string {
  const author = candidate.authors[0]?.split(/\s+/).at(-1)?.toLowerCase() ?? "unknown";
  const year = candidate.year ?? "nd";
  return `${author}${year}`;
}

export function renderCitation(candidate: CandidateRecord): RenderedCitation {
  const authors = candidate.authors.join(" and ");
  const fields = [
    `title = {${candidate.title}}`,
    authors ? `author = {${authors}}` : undefined,
    candidate.journal ? `journal = {${candidate.journal}}` : undefined,
    candidate.year ? `year = {${candidate.year}}` : undefined,
    candidate.doi ? `doi = {${candidate.doi}}` : undefined
  ].filter(Boolean);

  return {
    bibtex: `@article{${citeKey(candidate)},\n  ${fields.join(",\n  ")}\n}`,
    numbered: `${authors}. ${candidate.title}.${candidate.journal ? ` ${candidate.journal}.` : ""}${candidate.year ? ` ${candidate.year}.` : ""}${candidate.doi ? ` doi:${candidate.doi}.` : ""}`.trim(),
    cslJson: {
      type: "article-journal",
      title: candidate.title,
      author: candidate.authors.map((author) => ({ literal: author })),
      containerTitle: candidate.journal,
      issued: candidate.year ? { "date-parts": [[candidate.year]] } : undefined,
      DOI: candidate.doi
    }
  };
}
