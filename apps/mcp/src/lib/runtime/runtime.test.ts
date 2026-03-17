import { describe, expect, it } from "vitest";
import { MemoryConnector } from "../connectors/index.js";
import { CitecheckRuntime } from "./runtime.js";
import type { NormalizedQuery } from "../core/index.js";
import type { ReferenceConnector } from "../connectors/index.js";

describe("runtime orchestration", () => {
  it("produces evidence-backed results with manifestation awareness", async () => {
    const runtime = new CitecheckRuntime({
      connectors: [
        new MemoryConnector({
          source: "pubmed",
          records: [
            {
              id: "pubmed:1",
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
        }),
        new MemoryConnector({
          source: "arxiv",
          records: [
            {
              id: "arxiv:1",
              source: "arxiv",
              title: "Deep imaging biomarkers in glioma",
              normalizedTitle: "",
              authors: ["Smith J", "Doe A"],
              normalizedAuthors: [],
              year: 2023,
              arxivId: "2401.12345",
              manifestation: "preprint"
            }
          ]
        })
      ]
    });

    const result = await runtime.verifyReference({
      kind: "raw_citation",
      raw: "Smith J, Doe A. Deep imaging biomarkers in glioma. Neuroradiology. 2024. doi:10.1000/xyz123."
    });

    expect(result.status).toBe("verified_with_warnings");
    expect(result.preferredManifestation?.manifestation).toBe("journal_article");
    expect(result.evidence.some((item) => item.kind === "manifestation_link")).toBe(true);
    expect(result.retractionStatus).toBe("clear");
  });

  it("returns not_checked when every connector fails", async () => {
    const failingConnector: ReferenceConnector = {
      source: "pubmed",
      role: "authority",
      async search(_query: NormalizedQuery) {
        throw new Error("upstream timeout");
      }
    };
    const runtime = new CitecheckRuntime({
      connectors: [failingConnector]
    });

    const result = await runtime.verifyReference({
      kind: "raw_citation",
      raw: "Unresolvable citation"
    });

    expect(result.status).toBe("not_checked");
    expect(result.trace[0]?.sourceOutcomes[0]?.status).toBe("failed");
  });
});
