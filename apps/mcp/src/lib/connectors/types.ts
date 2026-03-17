import type {
  CandidateRecord,
  NormalizedQuery,
  SourceFailureClass,
  SourceFailureReason,
  SourceName,
  TriState
} from "../core/index.js";

export type ConnectorRole = "authority" | "manifestation" | "enrichment";

export interface ConnectorSearchResult {
  source: SourceName;
  candidates: CandidateRecord[];
  retractionStatus?: TriState;
  erratumStatus?: TriState;
  sourceWarnings?: string[];
}

export class ConnectorError extends Error {
  public readonly source: SourceName;
  public readonly failureClass: SourceFailureClass;
  public readonly failureReason: SourceFailureReason;
  public readonly retryable: boolean;

  public constructor(
    source: SourceName,
    failureClass: SourceFailureClass,
    failureReason: SourceFailureReason,
    detail: string,
    retryable: boolean
  ) {
    super(`${source} ${failureClass}/${failureReason}: ${detail}`);
    this.name = "ConnectorError";
    this.source = source;
    this.failureClass = failureClass;
    this.failureReason = failureReason;
    this.retryable = retryable;
  }
}

export class ConnectorPayloadError extends ConnectorError {
  public constructor(source: SourceName, failureReason: SourceFailureReason, detail: string) {
    super(source, "payload_shape_failure", failureReason, detail, false);
    this.name = "ConnectorPayloadError";
  }
}

export interface ReferenceConnector {
  readonly source: SourceName;
  readonly role: ConnectorRole;
  search(query: NormalizedQuery): Promise<ConnectorSearchResult>;
}
