import { describe, expect, it } from "vitest";
import { ArxivConnector } from "./arxiv.js";
import { CrossrefConnector } from "./crossref.js";
import { PubmedConnector } from "./pubmed.js";
import { SemanticScholarConnector } from "./semantic-scholar.js";
import type { HttpClient, HttpRequest } from "./http.js";

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

describe("real connector drafts", () => {
  it("maps Crossref works into canonical candidates", async () => {
    const connector = new CrossrefConnector({
      httpClient: new FixtureHttpClient({
        "https://api.crossref.org/works": JSON.stringify({
          message: {
            items: [
              {
                DOI: "10.1000/xyz123",
                title: ["Deep imaging biomarkers in glioma"],
                author: [
                  { family: "Smith", given: "J" },
                  { family: "Doe", given: "A" }
                ],
                issued: { "date-parts": [[2024, 1, 1]] },
                "container-title": ["Neuroradiology"],
                URL: "https://doi.org/10.1000/xyz123",
                type: "journal-article",
                "is-referenced-by-count": 12
              }
            ]
          }
        })
      }),
      mailto: "test@example.com"
    });

    const result = await connector.search({
      kind: "raw_citation",
      raw: "Deep imaging biomarkers in glioma",
      title: "Deep imaging biomarkers in glioma",
      titleNormalized: "deep imaging biomarkers in glioma",
      authors: ["Smith J"],
      authorTokens: ["smith j"],
      year: 2024,
      journal: undefined,
      journalNormalized: undefined,
      doi: undefined,
      pmid: undefined,
      pmcid: undefined,
      arxivId: undefined
    });

    expect(result.candidates[0]?.doi).toBe("10.1000/xyz123");
    expect(result.candidates[0]?.journal).toBe("Neuroradiology");
    expect(result.candidates[0]?.manifestation).toBe("journal_article");
  });

  it("maps PubMed esearch plus esummary into biomedical candidates", async () => {
    const connector = new PubmedConnector({
      httpClient: new FixtureHttpClient({
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi": JSON.stringify({
          esearchresult: { idlist: ["12345678"] }
        }),
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi": JSON.stringify({
          result: {
            uids: ["12345678"],
            "12345678": {
              uid: "12345678",
              title: "Deep imaging biomarkers in glioma",
              fulljournalname: "Neuroradiology",
              pubdate: "2024 Jan",
              authors: [{ name: "Smith J" }, { name: "Doe A" }],
              articleids: [
                { idtype: "doi", value: "10.1000/xyz123" },
                { idtype: "pmc", value: "PMC1234567" }
              ]
            }
          }
        })
      }),
      email: "test@example.com",
      tool: "citecheck"
    });

    const result = await connector.search({
      kind: "raw_citation",
      raw: "Deep imaging biomarkers in glioma",
      title: "Deep imaging biomarkers in glioma",
      titleNormalized: "deep imaging biomarkers in glioma",
      authors: ["Smith J"],
      authorTokens: ["smith j"],
      year: 2024,
      journal: undefined,
      journalNormalized: undefined,
      doi: undefined,
      pmid: undefined,
      pmcid: undefined,
      arxivId: undefined
    });

    expect(result.candidates[0]?.pmid).toBe("12345678");
    expect(result.candidates[0]?.pmcid).toBe("PMC1234567");
    expect(result.retractionStatus).toBe("clear");
    expect(result.erratumStatus).toBe("clear");
  });

  it("maps arXiv atom feeds into preprint manifestations", async () => {
    const connector = new ArxivConnector({
      httpClient: new FixtureHttpClient({
        "https://export.arxiv.org/api/query": `<?xml version="1.0" encoding="UTF-8"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>http://arxiv.org/abs/2401.12345v1</id>
              <published>2024-01-10T00:00:00Z</published>
              <title>Deep imaging biomarkers in glioma</title>
              <author><name>Smith J</name></author>
            </entry>
          </feed>`
      })
    });

    const result = await connector.search({
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
    });

    expect(result.candidates[0]?.arxivId).toBe("2401.12345v1");
    expect(result.candidates[0]?.manifestation).toBe("preprint");
  });

  it("treats Semantic Scholar as enrichment-only evidence", async () => {
    const connector = new SemanticScholarConnector({
      httpClient: new FixtureHttpClient({
        "https://api.semanticscholar.org/graph/v1/paper/search": JSON.stringify({
          data: [
            {
              paperId: "paper-1",
              title: "Deep imaging biomarkers in glioma",
              year: 2024,
              venue: "Neuroradiology",
              citationCount: 42,
              externalIds: { DOI: "10.1000/xyz123" },
              authors: [{ name: "Smith J" }],
              url: "https://www.semanticscholar.org/paper/paper-1"
            }
          ]
        })
      })
    });

    const result = await connector.search({
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
    });

    expect(connector.role).toBe("enrichment");
    expect(result.candidates[0]?.doi).toBe("10.1000/xyz123");
    expect(result.sourceWarnings).toContain("enrichment-only source");
  });
});
