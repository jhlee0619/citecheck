import { describe, expect, it } from "vitest";
import fixture from "./fixtures/biomed-sample.json";
import { MemoryConnector } from "@citecheck/connectors";
import { CitecheckRuntime } from "@citecheck/runtime";

describe("offline evaluation fixture", () => {
  it("tracks DOI recovery on the sample gold set", async () => {
    const runtime = new CitecheckRuntime({
      connectors: [
        new MemoryConnector({
          source: "pubmed",
          records: [
            {
              id: "pubmed:gold-1",
              source: "pubmed",
              title: "Deep imaging biomarkers in glioma",
              normalizedTitle: "",
              authors: ["Smith J", "Doe A"],
              normalizedAuthors: [],
              year: 2024,
              journal: "Neuroradiology",
              doi: "10.1000/xyz123",
              pmid: "12345678",
              manifestation: "journal_article"
            }
          ],
          retractionStatus: "clear",
          erratumStatus: "clear"
        })
      ]
    });

    const results = await Promise.all(
      fixture.map((entry) =>
        runtime.verifyReference({
          kind: "raw_citation",
          raw: entry.input
        })
      )
    );

    const doiRecoveryRate =
      results.filter((result, index) => result.preferredManifestation?.representative.doi === fixture[index]?.expectedDoi).length /
      results.length;

    expect(doiRecoveryRate).toBe(1);
    expect(results[0]?.status).toBe(fixture[0]?.expectedStatus);
  });
});
