import { normalizeCandidate, normalizeText } from "@citecheck/core";
import type { CandidateRecord, NormalizedQuery, TriState } from "@citecheck/core";
import { ConnectorPayloadError, type ConnectorSearchResult, type ReferenceConnector } from "./types.js";
import type { HttpClient } from "./http.js";

interface CrossrefConnectorOptions {
  httpClient: HttpClient;
  mailto?: string;
  rows?: number;
}

interface CrossrefApiResponse {
  message?: {
    items?: CrossrefWork[];
  };
}

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  URL?: string;
  type?: string;
  abstract?: string;
  "is-referenced-by-count"?: number;
}

export class CrossrefConnector implements ReferenceConnector {
  public readonly source = "crossref";
  public readonly role = "authority" as const;
  private readonly httpClient: HttpClient;
  private readonly mailto?: string;
  private readonly rows: number;

  public constructor(options: CrossrefConnectorOptions) {
    this.httpClient = options.httpClient;
    this.mailto = options.mailto;
    this.rows = options.rows ?? 5;
  }

  public async search(query: NormalizedQuery): Promise<ConnectorSearchResult> {
    const url = this.buildUrl(query);
    const body = await this.httpClient.get({ source: this.source, url });
    const payload = this.parseJson<CrossrefApiResponse>(body, "json_parse_failure", "invalid Crossref JSON");
    if (!payload.message || typeof payload.message !== "object") {
      throw new ConnectorPayloadError(this.source, "missing_required_top_level", "missing message object");
    }
    const candidates = (payload.message?.items ?? []).map((work, index) => normalizeCandidate(this.toCandidate(work, index)));

    return {
      source: this.source,
      candidates,
      retractionStatus: this.detectRetraction(candidates),
      erratumStatus: "not_checked",
      sourceWarnings: candidates.flatMap((candidate) => candidate.sourceWarnings ?? [])
    };
  }

  private buildUrl(query: NormalizedQuery): URL {
    if (query.doi) {
      const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(query.doi)}`);
      if (this.mailto) {
        url.searchParams.set("mailto", this.mailto);
      }
      return url;
    }

    const url = new URL("https://api.crossref.org/works");
    if (query.title) {
      url.searchParams.set("query.title", query.title);
    } else if (query.raw) {
      url.searchParams.set("query.bibliographic", query.raw);
    }
    if (query.year) {
      url.searchParams.set("filter", `from-pub-date:${query.year},until-pub-date:${query.year}`);
    }
    url.searchParams.set("rows", String(this.rows));
    if (this.mailto) {
      url.searchParams.set("mailto", this.mailto);
    }
    return url;
  }

  private toCandidate(work: CrossrefWork, index: number): CandidateRecord {
    const authors =
      work.author?.map((author) => author.name ?? [author.family, author.given].filter(Boolean).join(", ")).filter(Boolean) ?? [];
    const year = work.issued?.["date-parts"]?.[0]?.[0];
    const title = work.title?.[0] ?? "Untitled";
    const journal = work["container-title"]?.[0];
    const manifestation = work.type === "posted-content" ? "preprint" : "journal_article";

    return {
      id: `crossref:${work.DOI ?? normalizeText(title)}:${index}`,
      source: "crossref",
      sourceRecordId: work.DOI ?? `crossref:${index}`,
      retrievedAt: new Date().toISOString(),
      rawSourceType: work.type,
      title,
      normalizedTitle: normalizeText(title),
      authors,
      normalizedAuthors: authors.map(normalizeText),
      year,
      journal,
      normalizedJournal: journal ? normalizeText(journal) : undefined,
      doi: work.DOI,
      abstract: work.abstract,
      citationCount: work["is-referenced-by-count"],
      manifestation,
      sourceUrl: work.URL,
      missingFields: ["doi", "year", "journal"].filter((field) => {
        if (field === "doi") {
          return !work.DOI;
        }
        if (field === "year") {
          return year === undefined;
        }
        return !journal;
      }),
      sourceWarnings: year === undefined ? ["missing issued year in Crossref response"] : []
    };
  }

  private detectRetraction(candidates: CandidateRecord[]): TriState {
    return candidates.some((candidate) => /retract/i.test(candidate.title) || /retract/i.test(candidate.journal ?? ""))
      ? "flagged"
      : "not_checked";
  }

  private parseJson<T>(body: string, reason: "json_parse_failure", detail: string): T {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ConnectorPayloadError(this.source, reason, detail);
    }
  }
}
