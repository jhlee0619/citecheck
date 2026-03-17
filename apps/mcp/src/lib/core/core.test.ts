import { describe, expect, it } from "vitest";
import {
  buildEvidence,
  clusterCandidates,
  compareCandidate,
  deriveIssues,
  deriveStatus,
  normalizeCandidate,
  normalizeReferenceInput,
  renderCitation,
  scoreComparison,
  selectPreferredManifestation
} from "./index.js";

describe("core normalization and validation", () => {
  it("normalizes identifier-rich raw citations", () => {
    const query = normalizeReferenceInput({
      kind: "raw_citation",
      raw: "Smith J, Doe A. Deep imaging biomarkers in glioma. Neuroradiology. 2024. doi:10.1000/XYZ123. PMID: 12345678."
    });

    expect(query.doi).toBe("10.1000/xyz123");
    expect(query.pmid).toBe("12345678");
    expect(query.year).toBe(2024);
    expect(query.authors[0]).toContain("Smith");
  });

  it("scores a strong candidate and renders citations", () => {
    const query = normalizeReferenceInput({
      kind: "structured_entry",
      raw: "Deep imaging biomarkers in glioma",
      title: "Deep imaging biomarkers in glioma",
      authors: ["Smith J", "Doe A"],
      year: 2024,
      journal: "Neuroradiology",
      doi: "10.1000/xyz123"
    });
    const candidate = normalizeCandidate({
      id: "crossref:1",
      source: "crossref",
      title: "Deep imaging biomarkers in glioma",
      normalizedTitle: "",
      authors: ["Smith J", "Doe A"],
      normalizedAuthors: [],
      year: 2024,
      journal: "Neuroradiology",
      doi: "10.1000/xyz123",
      manifestation: "journal_article"
    });

    const comparison = compareCandidate(query, candidate);
    const scores = scoreComparison(comparison, candidate);
    const evidence = buildEvidence(comparison, candidate);
    const issues = deriveIssues(query, candidate, comparison);
    const rendered = renderCitation(candidate);

    expect(scores.retrieval).toBeGreaterThan(0.9);
    expect(scores.metadataConsistency).toBeGreaterThan(0.9);
    expect(evidence.some((item) => item.kind === "identifier_exact")).toBe(true);
    expect(deriveStatus(scores, issues)).toBe("verified");
    expect(rendered.bibtex).toContain("@article");
  });

  it("prefers journal manifestation over preprint within a cluster", () => {
    const cluster = clusterCandidates([
      normalizeCandidate({
        id: "arxiv:1",
        source: "arxiv",
        title: "Deep imaging biomarkers in glioma",
        normalizedTitle: "",
        authors: ["Smith J"],
        normalizedAuthors: [],
        year: 2023,
        arxivId: "2401.12345",
        manifestation: "preprint"
      }),
      normalizeCandidate({
        id: "pubmed:1",
        source: "pubmed",
        title: "Deep imaging biomarkers in glioma",
        normalizedTitle: "",
        authors: ["Smith J"],
        normalizedAuthors: [],
        year: 2024,
        journal: "Neuroradiology",
        doi: "10.1000/xyz123",
        pmid: "12345678",
        manifestation: "journal_article"
      })
    ])[0];

    expect(selectPreferredManifestation(cluster)?.manifestation).toBe("journal_article");
  });
});
