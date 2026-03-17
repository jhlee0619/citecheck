import {
  ArxivConnector,
  CrossrefConnector,
  FetchHttpClient,
  MemoryConnector,
  maskSourcePolicies,
  PubmedConnector,
  RetryingHttpClient,
  SemanticScholarConnector,
  type HttpClient,
  type HttpRequest,
  type SourceHttpPolicy
} from "../connectors/index.js";
import { CitecheckRuntime } from "./runtime.js";
import { SourceReplayRegistry } from "./fixture-registry.js";

export type FixtureMode = "off" | "prefer" | "only";

export interface RuntimeFactoryConfig {
  useLiveConnectors: boolean;
  enablePubmed: boolean;
  enableCrossref: boolean;
  enableArxiv: boolean;
  enableSemanticScholar: boolean;
  batchConcurrency: number;
  httpTimeoutMs: number;
  httpMaxRetries: number;
  userAgent: string;
  contactEmail?: string;
  sourceHttpPolicies: Partial<Record<"pubmed" | "crossref" | "arxiv" | "semantic_scholar", SourceHttpPolicy>>;
  fixtureMode: FixtureMode;
  fixtureRegistry?: SourceReplayRegistry;
}

export function defaultRuntimeFactoryConfig(): RuntimeFactoryConfig {
  return {
    useLiveConnectors: false,
    enablePubmed: true,
    enableCrossref: true,
    enableArxiv: true,
    enableSemanticScholar: false,
    batchConcurrency: 5,
    httpTimeoutMs: 10_000,
    httpMaxRetries: 2,
    userAgent: "citecheck/0.1.0",
    contactEmail: undefined,
    sourceHttpPolicies: {
      pubmed: {
        retries: 2,
        backoffMs: 2_000,
        minIntervalMs: 350
      },
      crossref: {
        retries: 2,
        backoffMs: 2_000,
        minIntervalMs: 200
      },
      arxiv: {
        retries: 1,
        backoffMs: 1_000,
        minIntervalMs: 350
      },
      semantic_scholar: {
        retries: 2,
        backoffMs: 2_000,
        minIntervalMs: 500
      }
    },
    fixtureMode: "off",
    fixtureRegistry: undefined
  };
}

export function buildRuntimeFromConfig(config: RuntimeFactoryConfig): CitecheckRuntime {
  const connectors = [];
  if (config.useLiveConnectors) {
    const liveHttpClient = createHttpClient(config);
    const httpClient = maybeWrapFixtureClient(liveHttpClient, config);
    if (config.enablePubmed) {
      connectors.push(
        new PubmedConnector({
          httpClient,
          email: config.contactEmail,
          tool: "citecheck"
        })
      );
    }
    if (config.enableCrossref) {
      connectors.push(
        new CrossrefConnector({
          httpClient,
          mailto: config.contactEmail
        })
      );
    }
    if (config.enableArxiv) {
      connectors.push(
        new ArxivConnector({
          httpClient
        })
      );
    }
    if (config.enableSemanticScholar) {
      connectors.push(
        new SemanticScholarConnector({
          httpClient
        })
      );
    }
    return new CitecheckRuntime({ connectors, batchConcurrency: config.batchConcurrency });
  }

  if (config.enablePubmed) {
    connectors.push(createDemoPubmedConnector());
  }
  if (config.enableCrossref) {
    connectors.push(createDemoCrossrefConnector());
  }
  if (config.enableArxiv) {
    connectors.push(createDemoArxivConnector());
  }
  if (config.enableSemanticScholar) {
      connectors.push(createDemoSemanticScholarConnector());
  }
  return new CitecheckRuntime({ connectors, batchConcurrency: config.batchConcurrency });
}

function createHttpClient(config: RuntimeFactoryConfig): HttpClient {
  return new RetryingHttpClient(
    new FetchHttpClient({
      userAgent: config.userAgent,
      defaultTimeoutMs: config.httpTimeoutMs,
      sourcePolicies: config.sourceHttpPolicies
    }),
    {
      retries: config.httpMaxRetries,
      backoffMs: 500,
      sourcePolicies: config.sourceHttpPolicies
    }
  );
}

function maybeWrapFixtureClient(inner: HttpClient, config: RuntimeFactoryConfig): HttpClient {
  if (config.fixtureMode === "off") {
    return inner;
  }
  return new FixtureAwareHttpClient(config.fixtureRegistry ?? new SourceReplayRegistry([]), inner, config.fixtureMode);
}

class FixtureAwareHttpClient implements HttpClient {
  private readonly registry: SourceReplayRegistry;
  private readonly inner: HttpClient;
  private readonly mode: FixtureMode;

  public constructor(registry: SourceReplayRegistry, inner: HttpClient, mode: FixtureMode) {
    this.registry = registry;
    this.inner = inner;
    this.mode = mode;
  }

  public async get(request: HttpRequest): Promise<string> {
    const key = `${request.url.origin}${request.url.pathname}`;
    const entry = this.registry.resolve(key);
    if (entry) {
      return entry.body;
    }
    if (this.mode === "only") {
      throw new Error(`fixture missing for ${key}`);
    }
    return this.inner.get(request);
  }
}

export function summarizeEffectiveRuntimeConfig(config: RuntimeFactoryConfig): Record<string, unknown> {
  return {
    useLiveConnectors: config.useLiveConnectors,
    enablePubmed: config.enablePubmed,
    enableCrossref: config.enableCrossref,
    enableArxiv: config.enableArxiv,
    enableSemanticScholar: config.enableSemanticScholar,
    batchConcurrency: config.batchConcurrency,
    httpTimeoutMs: config.httpTimeoutMs,
    httpMaxRetries: config.httpMaxRetries,
    fixtureMode: config.fixtureMode,
    fixtureRegistry: config.fixtureRegistry?.summary() ?? null,
    sourceHttpPolicies: maskSourcePolicies(config.sourceHttpPolicies)
  };
}

function createDemoPubmedConnector(): MemoryConnector {
  return new MemoryConnector({
    source: "pubmed",
    role: "authority",
    records: [
      {
        id: "pubmed:demo-1",
        source: "pubmed",
        sourceRecordId: "12345678",
        retrievedAt: new Date().toISOString(),
        rawSourceType: "pubmed-summary",
        title: "Deep imaging biomarkers in glioma",
        normalizedTitle: "",
        authors: ["Smith J", "Doe A"],
        normalizedAuthors: [],
        year: 2024,
        journal: "Neuroradiology",
        doi: "10.1000/xyz123",
        pmid: "12345678",
        manifestation: "journal_article",
        missingFields: ["pmcid"],
        sourceWarnings: []
      }
    ],
    retractionStatus: "clear",
    erratumStatus: "clear"
  });
}

function createDemoCrossrefConnector(): MemoryConnector {
  return new MemoryConnector({
    source: "crossref",
    role: "authority",
    records: [
      {
        id: "crossref:demo-1",
        source: "crossref",
        sourceRecordId: "10.1000/xyz123",
        retrievedAt: new Date().toISOString(),
        rawSourceType: "journal-article",
        title: "Deep imaging biomarkers in glioma",
        normalizedTitle: "",
        authors: ["Smith J", "Doe A"],
        normalizedAuthors: [],
        year: 2024,
        journal: "Neuroradiology",
        doi: "10.1000/xyz123",
        manifestation: "journal_article",
        missingFields: ["pmid", "pmcid"],
        sourceWarnings: []
      }
    ]
  });
}

function createDemoArxivConnector(): MemoryConnector {
  return new MemoryConnector({
    source: "arxiv",
    role: "manifestation",
    records: [
      {
        id: "arxiv:demo-1",
        source: "arxiv",
        sourceRecordId: "2401.12345",
        retrievedAt: new Date().toISOString(),
        rawSourceType: "preprint",
        title: "Deep imaging biomarkers in glioma",
        normalizedTitle: "",
        authors: ["Smith J", "Doe A"],
        normalizedAuthors: [],
        year: 2023,
        arxivId: "2401.12345",
        manifestation: "preprint",
        missingFields: ["doi", "pmid", "pmcid", "journal"],
        sourceWarnings: []
      }
    ]
  });
}

function createDemoSemanticScholarConnector(): MemoryConnector {
  return new MemoryConnector({
    source: "semantic_scholar",
    role: "enrichment",
    records: [
      {
        id: "semantic-scholar:demo-1",
        source: "semantic_scholar",
        sourceRecordId: "semantic-demo-1",
        retrievedAt: new Date().toISOString(),
        rawSourceType: "semantic-scholar-paper",
        title: "Deep imaging biomarkers in glioma",
        normalizedTitle: "",
        authors: ["Smith J", "Doe A"],
        normalizedAuthors: [],
        year: 2024,
        journal: "Neuroradiology",
        doi: "10.1000/xyz123",
        citationCount: 42,
        manifestation: "unknown",
        missingFields: [],
        sourceWarnings: ["enrichment-only candidate"]
      }
    ]
  });
}
