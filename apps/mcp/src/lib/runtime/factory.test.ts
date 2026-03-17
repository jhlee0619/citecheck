import { describe, expect, it } from "vitest";
import { buildRuntimeFromConfig, defaultRuntimeFactoryConfig, summarizeEffectiveRuntimeConfig } from "./factory.js";
import { SourceReplayRegistry } from "./fixture-registry.js";

describe("runtime factory", () => {
  it("exposes conservative live HTTP defaults for reruns", () => {
    const config = defaultRuntimeFactoryConfig();
    const summary = summarizeEffectiveRuntimeConfig(config);

    expect(config.batchConcurrency).toBe(5);
    expect(config.httpMaxRetries).toBe(2);
    expect(config.sourceHttpPolicies.crossref?.minIntervalMs).toBe(200);
    expect(config.sourceHttpPolicies.pubmed?.minIntervalMs).toBe(350);
    expect(summary).toMatchObject({
      batchConcurrency: 5,
      httpMaxRetries: 2
    });
  });

  it("uses fixture-backed live connectors when configured", async () => {
    const runtime = buildRuntimeFromConfig({
      ...defaultRuntimeFactoryConfig(),
      useLiveConnectors: true,
      fixtureMode: "only",
      fixtureRegistry: new SourceReplayRegistry([
        {
          key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
          source: "pubmed",
          body: JSON.stringify({
            esearchresult: { idlist: ["12345678"] }
          })
        },
        {
          key: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
          source: "pubmed",
          body: JSON.stringify({
            result: {
              uids: ["12345678"],
              "12345678": {
                uid: "12345678",
                title: "Deep imaging biomarkers in glioma",
                fulljournalname: "Neuroradiology",
                pubdate: "2024 Jan",
                authors: [{ name: "Smith J" }, { name: "Doe A" }],
                articleids: [{ idtype: "doi", value: "10.1000/xyz123" }]
              }
            }
          })
        },
        {
          key: "https://api.crossref.org/works",
          source: "crossref",
          body: JSON.stringify({
            message: { items: [] }
          })
        }
      ])
    });

    const result = await runtime.verifyReference({
      kind: "raw_citation",
      raw: "Smith J, Doe A. Deep imaging biomarkers in glioma. Neuroradiology. 2024. doi:10.1000/xyz123."
    });

    expect(result.status).toBe("verified");
    expect(result.trace[0]?.sourceOutcomes.some((outcome) => outcome.source === "pubmed")).toBe(true);
  });
});
