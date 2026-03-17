import { normalizeCandidate, normalizeText } from "../core/index.js";
import type { CandidateRecord, NormalizedQuery } from "../core/index.js";
import { ConnectorPayloadError, type ConnectorSearchResult, type ReferenceConnector } from "./types.js";
import type { HttpClient } from "./http.js";

interface ArxivConnectorOptions {
  httpClient: HttpClient;
  maxResults?: number;
}

export class ArxivConnector implements ReferenceConnector {
  public readonly source = "arxiv";
  public readonly role = "manifestation" as const;
  private readonly httpClient: HttpClient;
  private readonly maxResults: number;

  public constructor(options: ArxivConnectorOptions) {
    this.httpClient = options.httpClient;
    this.maxResults = options.maxResults ?? 5;
  }

  public async search(query: NormalizedQuery): Promise<ConnectorSearchResult> {
    const url = this.buildUrl(query);
    const xml = await this.httpClient.get({ source: this.source, url });
    if (!/<feed[\s>]/i.test(xml)) {
      throw new ConnectorPayloadError(this.source, "xml_parse_failure", "missing feed root");
    }
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
    if (entries.length === 0) {
      throw new ConnectorPayloadError(this.source, "missing_required_top_level", "missing entry elements");
    }
    const candidates = entries.map((entry, index) => normalizeCandidate(this.toCandidate(entry, index)));
    return {
      source: this.source,
      candidates,
      retractionStatus: "not_checked",
      erratumStatus: "not_checked",
      sourceWarnings: candidates.length === 0 ? ["arXiv returned no matches"] : ["manifestation source"]
    };
  }

  private buildUrl(query: NormalizedQuery): URL {
    const url = new URL("https://export.arxiv.org/api/query");
    if (query.arxivId) {
      url.searchParams.set("id_list", query.arxivId);
    } else if (query.title) {
      url.searchParams.set("search_query", `ti:"${query.title}"`);
    } else {
      url.searchParams.set("search_query", `all:"${query.raw}"`);
    }
    url.searchParams.set("max_results", String(this.maxResults));
    return url;
  }

  private toCandidate(entry: string, index: number): CandidateRecord {
    const title = readTag(entry, "title");
    const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((match) => match[1].trim());
    const published = readTag(entry, "published");
    const yearMatch = published?.match(/\b(19|20)\d{2}\b/);
    const arxivUrl = readTag(entry, "id");
    const arxivId = arxivUrl?.split("/").at(-1);
    if (!title || !arxivId) {
      throw new ConnectorPayloadError(this.source, "missing_required_entry_fields", "missing title or id");
    }

    return {
      id: `arxiv:${arxivId ?? index}`,
      source: "arxiv",
      sourceRecordId: arxivId ?? String(index),
      retrievedAt: new Date().toISOString(),
      rawSourceType: "preprint",
      title,
      normalizedTitle: normalizeText(title),
      authors,
      normalizedAuthors: authors.map(normalizeText),
      year: yearMatch ? Number.parseInt(yearMatch[0], 10) : undefined,
      arxivId,
      manifestation: "preprint",
      sourceUrl: arxivUrl,
      missingFields: ["doi", "pmid", "pmcid", "journal"],
      sourceWarnings: []
    };
  }
}

function readTag(entry: string, tag: string): string | undefined {
  return entry.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1].replace(/\s+/g, " ").trim();
}
