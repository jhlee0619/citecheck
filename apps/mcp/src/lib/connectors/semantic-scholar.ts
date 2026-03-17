import { normalizeCandidate, normalizeText } from "../core/index.js";
import type { CandidateRecord, NormalizedQuery } from "../core/index.js";
import { ConnectorPayloadError, type ConnectorSearchResult, type ReferenceConnector } from "./types.js";
import type { HttpClient } from "./http.js";

interface SemanticScholarConnectorOptions {
  httpClient: HttpClient;
  apiKey?: string;
  limit?: number;
}

interface SemanticScholarSearchResponse {
  data?: SemanticScholarPaper[];
}

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  year?: number;
  venue?: string;
  citationCount?: number;
  externalIds?: Record<string, string>;
  authors?: Array<{ name?: string }>;
  url?: string;
}

export class SemanticScholarConnector implements ReferenceConnector {
  public readonly source = "semantic_scholar";
  public readonly role = "enrichment" as const;
  private readonly httpClient: HttpClient;
  private readonly limit: number;

  public constructor(options: SemanticScholarConnectorOptions) {
    this.httpClient = options.httpClient;
    this.limit = options.limit ?? 5;
  }

  public async search(query: NormalizedQuery): Promise<ConnectorSearchResult> {
    const url = this.buildUrl(query);
    const body = await this.httpClient.get({ source: this.source, url });
    const payload = this.parseJson<SemanticScholarSearchResponse>(body);
    if (!Array.isArray(payload.data)) {
      throw new ConnectorPayloadError(this.source, "missing_required_top_level", "missing data array");
    }
    const usablePapers = payload.data.filter((paper) => this.isEnrichmentUsable(paper));
    if (payload.data.length > 0 && usablePapers.length === 0) {
      throw new ConnectorPayloadError(this.source, "missing_enrichment_critical_fields", "missing enrichment-critical fields");
    }
    const candidates = usablePapers.map((paper, index) => normalizeCandidate(this.toCandidate(paper, index)));

    return {
      source: this.source,
      candidates,
      retractionStatus: "not_checked",
      erratumStatus: "not_checked",
      sourceWarnings: ["enrichment-only source"]
    };
  }

  private buildUrl(query: NormalizedQuery): URL {
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    url.searchParams.set("query", query.title ?? query.raw);
    url.searchParams.set("limit", String(this.limit));
    url.searchParams.set(
      "fields",
      "title,year,venue,citationCount,externalIds,authors,url"
    );
    return url;
  }

  private toCandidate(paper: SemanticScholarPaper, index: number): CandidateRecord {
    const title = paper.title ?? "Untitled";
    const authors = paper.authors?.map((author) => author.name).filter(Boolean) as string[] | undefined;
    const externalIds = paper.externalIds ?? {};
    const manifestation = externalIds.ArXiv ? "preprint" : "unknown";

    return {
      id: `semantic-scholar:${paper.paperId ?? index}`,
      source: "semantic_scholar",
      sourceRecordId: paper.paperId,
      retrievedAt: new Date().toISOString(),
      rawSourceType: "semantic-scholar-paper",
      title,
      normalizedTitle: normalizeText(title),
      authors: authors ?? [],
      normalizedAuthors: (authors ?? []).map(normalizeText),
      year: paper.year,
      journal: paper.venue,
      normalizedJournal: paper.venue ? normalizeText(paper.venue) : undefined,
      doi: externalIds.DOI,
      arxivId: externalIds.ArXiv,
      citationCount: paper.citationCount,
      manifestation,
      sourceUrl: paper.url,
      missingFields: ["doi", "year"].filter((field) => {
        if (field === "doi") {
          return !externalIds.DOI;
        }
        return paper.year === undefined;
      }),
      sourceWarnings: ["enrichment-only candidate"]
    };
  }

  private parseJson<T>(body: string): T {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ConnectorPayloadError(this.source, "json_parse_failure", "invalid Semantic Scholar JSON");
    }
  }

  private isEnrichmentUsable(paper: SemanticScholarPaper): boolean {
    const externalIds = paper.externalIds ?? {};
    return Boolean(paper.title || externalIds.DOI || externalIds.ArXiv || paper.paperId);
  }
}
