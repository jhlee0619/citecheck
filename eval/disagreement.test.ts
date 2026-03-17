import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildRuntimeFromConfig, defaultRuntimeFactoryConfig, SourceReplayRegistry } from "@citecheck/runtime";

describe("disagreement fixtures", () => {
  it("keeps online-vs-print year disagreements in verified_with_warnings", async () => {
    const [esearch, pubmed, crossref, expected] = await Promise.all([
      readFile("eval/fixtures/disagreement/year-online-vs-print/esearch.json", "utf8"),
      readFile("eval/fixtures/disagreement/year-online-vs-print/pubmed.json", "utf8"),
      readFile("eval/fixtures/disagreement/year-online-vs-print/crossref.json", "utf8"),
      readFile("eval/fixtures/disagreement/year-online-vs-print/expected.json", "utf8")
    ]);

    const runtime = buildRuntimeFromConfig({
      ...defaultRuntimeFactoryConfig(),
      useLiveConnectors: true,
      fixtureMode: "only",
      fixtureRegistry: new SourceReplayRegistry([
        {
          key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
          source: "pubmed",
          disagreementClass: "year-online-vs-print",
          body: esearch
        },
        {
          key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
          source: "pubmed",
          disagreementClass: "year-online-vs-print",
          body: pubmed
        },
        {
          key: "https://api.crossref.org/works",
          source: "crossref",
          disagreementClass: "year-online-vs-print",
          body: crossref
        }
      ])
    });

    const result = await runtime.verifyReference({
      kind: "raw_citation",
      raw: "Smith J, Doe A. Deep imaging biomarkers in glioma. Neuroradiology. 2024. doi:10.1000/xyz123."
    });
    const expectedPayload = JSON.parse(expected) as { expectedStatus: string; expectedIssueCode: string };

    expect(result.status).toBe(expectedPayload.expectedStatus);
    expect(result.issues.some((issue) => issue.code === expectedPayload.expectedIssueCode)).toBe(true);
  });
});
