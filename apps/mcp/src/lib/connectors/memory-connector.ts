import { normalizeCandidate } from "../core/index.js";
import type { CandidateRecord, NormalizedQuery, SourceName, TriState } from "../core/index.js";
import type { ConnectorRole, ConnectorSearchResult, ReferenceConnector } from "./types.js";

interface MemoryConnectorOptions {
  source: SourceName;
  role?: ConnectorRole;
  records: CandidateRecord[];
  retractionStatus?: TriState;
  erratumStatus?: TriState;
}

export class MemoryConnector implements ReferenceConnector {
  public readonly source: SourceName;
  public readonly role: ConnectorRole;
  private readonly records: CandidateRecord[];
  private readonly retractionStatus?: TriState;
  private readonly erratumStatus?: TriState;

  public constructor(options: MemoryConnectorOptions) {
    this.source = options.source;
    this.role = options.role ?? "authority";
    this.records = options.records.map(normalizeCandidate);
    this.retractionStatus = options.retractionStatus;
    this.erratumStatus = options.erratumStatus;
  }

  public async search(query: NormalizedQuery): Promise<ConnectorSearchResult> {
    const candidates = this.records.filter((record) => {
      const identifierHit = Boolean(
        (query.doi && record.doi === query.doi) ||
          (query.pmid && record.pmid === query.pmid) ||
          (query.pmcid && record.pmcid === query.pmcid) ||
          (query.arxivId && record.arxivId === query.arxivId)
      );
      if (identifierHit) {
        return true;
      }
      if (query.titleNormalized) {
        return record.normalizedTitle.includes(query.titleNormalized) || query.titleNormalized.includes(record.normalizedTitle);
      }
      return false;
    });

    return {
      source: this.source,
      candidates,
      retractionStatus: this.retractionStatus,
      erratumStatus: this.erratumStatus,
      sourceWarnings: ["memory fixture connector"]
    };
  }
}
