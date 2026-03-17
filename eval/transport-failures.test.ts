import { describe, expect, it } from "vitest";
import { CitecheckRuntime } from "@citecheck/runtime";
import type { NormalizedQuery } from "@citecheck/core";
import type { ReferenceConnector } from "@citecheck/connectors";

describe("transport and protocol failures", () => {
  it("keeps partial failures visible when one source fails and another matches", async () => {
    const failingCrossref: ReferenceConnector = {
      source: "crossref",
      role: "authority",
      async search(_query: NormalizedQuery) {
        throw new Error("403 Forbidden");
      }
    };
    const matchingPubmed: ReferenceConnector = {
      source: "pubmed",
      role: "authority",
      async search(_query: NormalizedQuery) {
        return {
          source: "pubmed",
          candidates: [
            {
              id: "pubmed:1",
              source: "pubmed",
              title: "Deep imaging biomarkers in glioma",
              normalizedTitle: "deep imaging biomarkers in glioma",
              authors: ["Smith J"],
              normalizedAuthors: ["smith j"],
              year: 2024,
              doi: "10.1000/xyz123",
              manifestation: "journal_article"
            }
          ],
          retractionStatus: "clear",
          erratumStatus: "clear"
        };
      }
    };

    const runtime = new CitecheckRuntime({
      connectors: [matchingPubmed, failingCrossref]
    });

    const result = await runtime.verifyReference({
      kind: "raw_citation",
      raw: "Smith J. Deep imaging biomarkers in glioma. 2024. doi:10.1000/xyz123."
    });

    expect(result.status).toBe("verified");
    expect(
      result.trace[0]?.sourceOutcomes.some(
        (outcome) =>
          outcome.source === "crossref" &&
          outcome.status === "failed" &&
          outcome.failureClass === "transport_failure" &&
          outcome.failureReason === "unknown_failure"
      )
    ).toBe(true);
    expect(result.trace[0]?.sourceOutcomes.some((outcome) => outcome.source === "pubmed" && outcome.status === "matched")).toBe(true);
  });
});
