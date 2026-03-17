import { normalizeCandidate, normalizeText } from "../core/index.js";
import type { CandidateRecord, NormalizedQuery } from "../core/index.js";
import { ConnectorPayloadError, type ConnectorSearchResult, type ReferenceConnector } from "./types.js";
import type { HttpClient } from "./http.js";

interface PubmedConnectorOptions {
  httpClient: HttpClient;
  apiKey?: string;
  tool?: string;
  email?: string;
  retmax?: number;
}

interface PubmedSearchResponse {
  esearchresult?: {
    idlist?: string[];
  };
}

interface PubmedSummaryResponse {
  result?: Record<string, PubmedSummaryRecord | string[] | undefined> & {
    uids?: string[];
  };
}

interface PubmedSummaryRecord {
  uid?: string;
  title?: string;
  fulljournalname?: string;
  pubdate?: string;
  authors?: Array<{ name?: string }>;
  articleids?: Array<{ idtype?: string; value?: string }>;
}

export class PubmedConnector implements ReferenceConnector {
  public readonly source = "pubmed";
  public readonly role = "authority" as const;
  private readonly httpClient: HttpClient;
  private readonly apiKey?: string;
  private readonly tool?: string;
  private readonly email?: string;
  private readonly retmax: number;

  public constructor(options: PubmedConnectorOptions) {
    this.httpClient = options.httpClient;
    this.apiKey = options.apiKey;
    this.tool = options.tool;
    this.email = options.email;
    this.retmax = options.retmax ?? 5;
  }

  public async search(query: NormalizedQuery): Promise<ConnectorSearchResult> {
    const searchUrl = this.buildSearchUrl(query);
    const searchBody = await this.httpClient.get({ source: this.source, url: searchUrl });
    const searchPayload = this.parseJson<PubmedSearchResponse>(searchBody, "json_parse_failure", "invalid esearch JSON");
    const ids = searchPayload.esearchresult?.idlist ?? [];
    if (ids.length === 0) {
      return {
        source: this.source,
        candidates: [],
        retractionStatus: "not_checked",
        erratumStatus: "not_checked"
      };
    }

    const summaryUrl = this.buildSummaryUrl(ids);
    const summaryBody = await this.httpClient.get({ source: this.source, url: summaryUrl });
    const summaryPayload = this.parseJson<PubmedSummaryResponse>(summaryBody, "json_parse_failure", "invalid esummary JSON");
    if (!summaryPayload.result || typeof summaryPayload.result !== "object") {
      throw new ConnectorPayloadError(this.source, "missing_required_top_level", "missing result object");
    }
    const candidates = ids
      .map((id) => summaryPayload.result?.[id])
      .filter((record): record is PubmedSummaryRecord => Boolean(record && typeof record === "object"))
      .map((record) => normalizeCandidate(this.toCandidate(record)));

    return {
      source: this.source,
      candidates,
      retractionStatus: candidates.some((candidate) => /retract/i.test(candidate.title)) ? "flagged" : "clear",
      erratumStatus: candidates.some((candidate) => /erratum|correction/i.test(candidate.title)) ? "flagged" : "clear",
      sourceWarnings: candidates.flatMap((candidate) => candidate.sourceWarnings ?? [])
    };
  }

  private buildSearchUrl(query: NormalizedQuery): URL {
    const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
    url.searchParams.set("db", "pubmed");
    url.searchParams.set("retmode", "json");
    url.searchParams.set("retmax", String(this.retmax));
    url.searchParams.set("term", this.buildTerm(query));
    this.applySharedParams(url);
    return url;
  }

  private buildSummaryUrl(ids: string[]): URL {
    const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
    url.searchParams.set("db", "pubmed");
    url.searchParams.set("retmode", "json");
    url.searchParams.set("id", ids.join(","));
    this.applySharedParams(url);
    return url;
  }

  private buildTerm(query: NormalizedQuery): string {
    if (query.pmid) {
      return `${query.pmid}[uid]`;
    }
    if (query.doi) {
      return `${query.doi}[doi]`;
    }
    if (query.pmcid) {
      return `${query.pmcid}[pmc]`;
    }
    const parts: string[] = [];
    if (query.title) {
      parts.push(`${query.title}[title]`);
    }
    if (query.authors[0]) {
      parts.push(`${query.authors[0]}[author]`);
    }
    if (query.year) {
      parts.push(`${query.year}[pdat]`);
    }
    return parts.join(" AND ") || query.raw;
  }

  private applySharedParams(url: URL): void {
    if (this.apiKey) {
      url.searchParams.set("api_key", this.apiKey);
    }
    if (this.tool) {
      url.searchParams.set("tool", this.tool);
    }
    if (this.email) {
      url.searchParams.set("email", this.email);
    }
  }

  private parseJson<T>(body: string, reason: "json_parse_failure", detail: string): T {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ConnectorPayloadError(this.source, reason, detail);
    }
  }

  private toCandidate(record: PubmedSummaryRecord): CandidateRecord {
    const authors = record.authors?.map((author) => author.name).filter(Boolean) as string[] | undefined;
    const articleIds = new Map((record.articleids ?? []).map((item) => [item.idtype, item.value]));
    const title = record.title ?? "Untitled";
    const journal = record.fulljournalname;
    const pubdate = record.pubdate ?? "";
    const yearMatch = pubdate.match(/\b(19|20)\d{2}\b/);

    return {
      id: `pubmed:${record.uid ?? normalizeText(title)}`,
      source: "pubmed",
      sourceRecordId: record.uid,
      retrievedAt: new Date().toISOString(),
      rawSourceType: "pubmed-summary",
      title,
      normalizedTitle: normalizeText(title),
      authors: authors ?? [],
      normalizedAuthors: (authors ?? []).map(normalizeText),
      year: yearMatch ? Number.parseInt(yearMatch[0], 10) : undefined,
      journal,
      normalizedJournal: journal ? normalizeText(journal) : undefined,
      doi: articleIds.get("doi"),
      pmid: record.uid,
      pmcid: articleIds.get("pmc"),
      manifestation: "journal_article",
      missingFields: ["doi", "pmcid", "journal"].filter((field) => {
        if (field === "doi") {
          return !articleIds.get("doi");
        }
        if (field === "pmcid") {
          return !articleIds.get("pmc");
        }
        return !journal;
      }),
      sourceWarnings: articleIds.get("doi") ? [] : ["PubMed summary missing DOI"]
    };
  }
}
