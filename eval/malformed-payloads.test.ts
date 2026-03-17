import { describe, expect, it } from "vitest";
import { ArxivConnector } from "@citecheck/connectors";
import { SemanticScholarConnector } from "@citecheck/connectors";
import { CrossrefConnector } from "@citecheck/connectors";
import { PubmedConnector } from "@citecheck/connectors";
import { ConnectorPayloadError } from "@citecheck/connectors";
import type { HttpClient, HttpRequest } from "@citecheck/connectors";

class FixtureHttpClient implements HttpClient {
  private readonly fixtures: Record<string, string>;

  public constructor(fixtures: Record<string, string>) {
    this.fixtures = fixtures;
  }

  public async get(request: HttpRequest): Promise<string> {
    const key = `${request.url.origin}${request.url.pathname}`;
    const body = this.fixtures[key];
    if (!body) {
      throw new Error(`missing fixture for ${key}`);
    }
    return body;
  }
}

describe("malformed payload regression", () => {
  it("classifies PubMed malformed esummary as payload_shape_failure", async () => {
    const connector = new PubmedConnector({
      httpClient: new FixtureHttpClient({
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi": JSON.stringify({
          esearchresult: { idlist: ["12345678"] }
        }),
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi": `{"unexpected":"shape"}`
      })
    });

    await expect(
      connector.search({
        kind: "raw_citation",
        raw: "Deep imaging biomarkers in glioma",
        title: "Deep imaging biomarkers in glioma",
        titleNormalized: "deep imaging biomarkers in glioma",
        authors: [],
        authorTokens: [],
        year: undefined,
        journal: undefined,
        journalNormalized: undefined,
        doi: undefined,
        pmid: undefined,
        pmcid: undefined,
        arxivId: undefined
      })
    ).rejects.toMatchObject({
      failureClass: "payload_shape_failure",
      failureReason: "missing_required_top_level"
    });
  });

  it("classifies CrossRef malformed payload as payload_shape_failure", async () => {
    const connector = new CrossrefConnector({
      httpClient: new FixtureHttpClient({
        "https://api.crossref.org/works": `{"unexpected":{"payload":[]}}`
      })
    });

    await expect(
      connector.search({
        kind: "raw_citation",
        raw: "Deep imaging biomarkers in glioma",
        title: "Deep imaging biomarkers in glioma",
        titleNormalized: "deep imaging biomarkers in glioma",
        authors: [],
        authorTokens: [],
        year: undefined,
        journal: undefined,
        journalNormalized: undefined,
        doi: undefined,
        pmid: undefined,
        pmcid: undefined,
        arxivId: undefined
      })
    ).rejects.toMatchObject({
      failureClass: "payload_shape_failure",
      failureReason: "missing_required_top_level"
    });
  });

  it("classifies arXiv invalid XML as payload_shape_failure", async () => {
    const connector = new ArxivConnector({
      httpClient: new FixtureHttpClient({
        "https://export.arxiv.org/api/query": "not-xml"
      })
    });

    await expect(
      connector.search({
        kind: "raw_citation",
        raw: "Deep imaging biomarkers in glioma",
        title: "Deep imaging biomarkers in glioma",
        titleNormalized: "deep imaging biomarkers in glioma",
        authors: [],
        authorTokens: [],
        year: undefined,
        journal: undefined,
        journalNormalized: undefined,
        doi: undefined,
        pmid: undefined,
        pmcid: undefined,
        arxivId: undefined
      })
    ).rejects.toMatchObject({
      failureClass: "payload_shape_failure",
      failureReason: "xml_parse_failure"
    });
  });

  it("classifies arXiv missing id/title shape as payload_shape_failure", async () => {
    const connector = new ArxivConnector({
      httpClient: new FixtureHttpClient({
        "https://export.arxiv.org/api/query": `<?xml version="1.0" encoding="UTF-8"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <published>2024-01-10T00:00:00Z</published>
              <title>Deep imaging biomarkers in glioma</title>
            </entry>
          </feed>`
      })
    });

    await expect(
      connector.search({
        kind: "raw_citation",
        raw: "Deep imaging biomarkers in glioma",
        title: "Deep imaging biomarkers in glioma",
        titleNormalized: "deep imaging biomarkers in glioma",
        authors: [],
        authorTokens: [],
        year: undefined,
        journal: undefined,
        journalNormalized: undefined,
        doi: undefined,
        pmid: undefined,
        pmcid: undefined,
        arxivId: undefined
      })
    ).rejects.toMatchObject({
      failureClass: "payload_shape_failure",
      failureReason: "missing_required_entry_fields"
    });
  });

  it("classifies Semantic Scholar malformed JSON as payload_shape_failure", async () => {
    const connector = new SemanticScholarConnector({
      httpClient: new FixtureHttpClient({
        "https://api.semanticscholar.org/graph/v1/paper/search": "not-json"
      })
    });

    await expect(
      connector.search({
        kind: "raw_citation",
        raw: "Deep imaging biomarkers in glioma",
        title: "Deep imaging biomarkers in glioma",
        titleNormalized: "deep imaging biomarkers in glioma",
        authors: [],
        authorTokens: [],
        year: undefined,
        journal: undefined,
        journalNormalized: undefined,
        doi: undefined,
        pmid: undefined,
        pmcid: undefined,
        arxivId: undefined
      })
    ).rejects.toMatchObject({
      failureClass: "payload_shape_failure",
      failureReason: "json_parse_failure"
    });
  });

  it("classifies Semantic Scholar missing enrichment-critical fields as payload_shape_failure", async () => {
    const connector = new SemanticScholarConnector({
      httpClient: new FixtureHttpClient({
        "https://api.semanticscholar.org/graph/v1/paper/search": JSON.stringify({
          data: [
            {
              authors: [{ name: "Smith J" }],
              venue: "Neuroradiology"
            }
          ]
        })
      })
    });

    await expect(
      connector.search({
        kind: "raw_citation",
        raw: "Deep imaging biomarkers in glioma",
        title: "Deep imaging biomarkers in glioma",
        titleNormalized: "deep imaging biomarkers in glioma",
        authors: [],
        authorTokens: [],
        year: undefined,
        journal: undefined,
        journalNormalized: undefined,
        doi: undefined,
        pmid: undefined,
        pmcid: undefined,
        arxivId: undefined
      })
    ).rejects.toMatchObject({
      failureClass: "payload_shape_failure",
      failureReason: "missing_enrichment_critical_fields"
    });
  });
});
