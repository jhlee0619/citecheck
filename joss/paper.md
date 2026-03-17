---
title: 'citecheck: An MCP server for automated bibliographic verification and repair in scholarly manuscripts'
tags:
  - TypeScript
  - bibliographic verification
  - reference management
  - Model Context Protocol
  - scholarly communication
  - AI agents
authors:
  - name: Junhyeok Lee
    orcid: 0000-0001-7489-5829
    corresponding: true
    affiliation: 1
affiliations:
  - name: Seoul National University College of Medicine, South Korea
    index: 1
date: 17 March 2026
bibliography: paper.bib
---

# Summary

Bibliographic errors in scholarly manuscripts---incorrect DOIs, misattributed authors, wrong publication years, and missing identifiers---are pervasive and consequential. Manual verification of reference lists against authoritative databases is tedious and error-prone, particularly for manuscripts containing dozens of entries across biomedical, computational, and interdisciplinary literatures. `citecheck` is a Model Context Protocol (MCP) server, written in TypeScript, that automates the verification and repair of reference lists in academic papers. Given a manuscript file (`.bib`, `.tex`, `.md`, `.txt`, or `.docx`), `citecheck` extracts the references section, validates each entry against PubMed, Crossref, arXiv, and Semantic Scholar through a multi-pass retrieval strategy, and returns structured correction proposals with per-entry confidence scores, evidence traces, and actionable curation worklists. The tool is designed for integration with MCP-capable AI agents such as Claude Code and Codex, enabling fully autonomous bibliography repair within agent-driven research workflows.

# Statement of Need

Reference list errors are among the most common defects in published scientific literature. Studies have reported bibliographic inaccuracy rates of 25--54% across disciplines [@sievert1992; @booth2004], with DOI errors alone affecting up to 10% of entries in sampled corpora [@teixeira2013]. These errors impede reproducibility, distort citation metrics, and undermine the scholarly record.

The rise of large language models (LLMs) in research workflows has introduced a new category of bibliographic error: citation hallucination. LLMs routinely fabricate references that appear plausible but do not correspond to real publications, blending author names from one paper with titles from another and generating fictitious DOIs [@walters2023]. A systematic evaluation found that 19.9% of citations produced by GPT-4o were entirely fabricated, with over half of non-fabricated citations still containing bibliographic errors [@linardon2025]. At scale, the problem is already contaminating the scholarly record: an analysis of 2.2 million citations in 56,381 papers published at top-tier AI/ML venues (2020--2025) identified 604 papers containing invalid or fabricated citations, with an 80.9% year-over-year increase in 2025 [@xu2026]. A targeted audit of NeurIPS 2025 accepted papers found over 100 hallucinated citations across 51 published papers, demonstrating that even elite peer review fails to catch LLM-generated bibliographic fabrications [@ansari2026].

Existing tools for reference management---Zotero [@zotero], Mendeley, and EndNote---focus on organizing and formatting citations from curated personal libraries, but do not independently verify that a reference list in a manuscript accurately reflects the metadata held by authoritative registries. Citation-checking utilities such as `anystyle` [@anystyle] parse unstructured reference strings, while Crossref's metadata API [@crossref_api] enables individual DOI resolution, but no integrated tool combines multi-source validation, error classification, and structured repair output in a format suitable for programmatic consumption by AI agents.

The emergence of the Model Context Protocol (MCP) [@mcp2024] as a standard interface between large language models and external tools creates a new opportunity: an MCP server that AI coding agents can invoke directly to inspect, validate, and repair bibliographies without human intervention. By providing ground-truth verification against authoritative registries, `citecheck` serves as a guardrail against both traditional bibliographic errors and LLM-induced citation hallucinations. It fills this gap by providing a purpose-built MCP server that exposes a structured, multi-tool workflow for bibliographic quality assurance.

# State of the Field

Reference management tools broadly fall into three categories: (1) personal library managers (Zotero, Mendeley, EndNote) that organize user-curated records; (2) parsing libraries (`anystyle`, `GROBID` [@grobid]) that extract structured fields from unstructured citation strings; and (3) metadata resolution APIs (Crossref REST API, PubMed E-utilities [@pubmed_eutils], Semantic Scholar API [@semantic_scholar_api]) that look up individual records. None of these categories alone addresses the end-to-end problem of validating an existing reference list against multiple authoritative sources, classifying discrepancies, and producing replacement-safe output.

Tools like `doi2bib` convert a single DOI to BibTeX but cannot handle bulk verification or detect inconsistencies between a manuscript's stated metadata and registry records. `GROBID` excels at PDF-to-structured-data extraction but does not perform cross-source validation or produce repair proposals. The Crossref "polite pool" API and PubMed E-utilities each cover subsets of the scholarly literature; biomedical manuscripts typically require querying both, plus arXiv for preprints. No existing tool orchestrates these sources with progressive query reformulation, candidate clustering, manifestation-aware deduplication, and policy-gated batch-level quality assessment.

`citecheck` addresses this gap by integrating four external data sources behind a unified verification runtime, with a multi-pass search strategy that automatically reformulates queries when initial retrieval yields insufficient evidence.

# Software Design

## Architecture

`citecheck` is organized as a monorepo with the MCP server published as `@citecheck/mcp` on npm. The codebase comprises approximately 6,770 lines of TypeScript across four modules (\autoref{fig:architecture}):

- **Connectors**: HTTP clients for PubMed, Crossref, arXiv, and Semantic Scholar, each implementing a common `ReferenceConnector` interface. Per-source rate limiting and retry policies are configured at the HTTP client level.
- **Core**: Normalization, candidate comparison, Jaccard-based similarity scoring, cluster construction, evidence building, and issue derivation logic.
- **Runtime**: Multi-pass verification orchestration. Each reference is queried against available connectors in parallel; if no promotable candidate emerges, the runtime reformulates the query and re-queries a subset of sources. Up to three passes are attempted before marking a reference as unresolved.
- **Policy**: Batch-level quality gates that evaluate aggregate verification outcomes against configurable thresholds (default, strict, lenient presets), producing an exit decision that signals whether the batch is safe for downstream use.

![Simplified architecture of citecheck. The MCP server exposes tools that delegate to the repair API. The runtime orchestrates multi-pass verification across four external connectors, with results evaluated by the policy engine.\label{fig:architecture}](architecture.png){ width=80% }

## Multi-Pass Verification

For each reference, the runtime executes up to three retrieval passes with progressively relaxed query formulations:

1. **Pass 1** queries all enabled connectors (PubMed, Crossref, arXiv, Semantic Scholar) with the original query.
2. **Pass 2** uses a normalized title with author/year anchors.
3. **Pass 3** broadens the search to alternative source combinations.

Within each pass, connector calls execute concurrently via `Promise.allSettled()`, and multiple references are processed in parallel (configurable batch concurrency, default 5). Candidates returned from different sources are clustered by shared identifiers (DOI, PMID) or high title similarity ($\geq 0.8$ Jaccard coefficient), then scored on retrieval confidence and metadata consistency.

## Candidate Evaluation

Each candidate cluster is compared against the original reference entry across normalized title, author lists, year, journal, and identifiers. A confidence score pair (retrieval, metadata consistency) determines the validation status: `verified`, `verified_with_warnings`, `needs_review`, or `unresolved`. The system detects 14 issue types including identifier mismatches, title discrepancies, missing fields, retraction flags, and manifestation conflicts (e.g., a journal article cited as a preprint).

## MCP Tool Interface

`citecheck` exposes six MCP tools following a progressive-disclosure workflow:

- `scan_workspace`: identifies paper-like files in a directory.
- `analyze_references`: extracts, lints, and validates references (read-only).
- `plan_reference_rewrite`: previews correction patches with safety assessment.
- `apply_reference_rewrite`: writes corrected output as a sidecar file or in-place replacement.
- `repair_paper`: unified single-call entry point.
- `citecheck_version`: server health check.

Output is available in JSON, BibTeX, numbered text, Markdown, or EndNote format. The structured JSON output includes per-entry evidence traces, field-level diffs, replacement eligibility flags, and a curation worklist that agents can use to prioritize human review.

# Research Impact Statement

`citecheck` has been used by the authors to verify and repair reference lists in manuscripts under preparation, including a longitudinal brain metastases study with 37 references across biomedical and machine-learning literatures. In that manuscript, `citecheck` identified missing DOIs in 34 of 37 entries, flagged one identifier mismatch, and detected one ambiguous entry---corrections that would have required several hours of manual cross-referencing.

The tool is published on npm as `@citecheck/mcp` and can be installed as an MCP server for Claude Code or Codex with a single command. As MCP adoption grows in research-oriented AI agent workflows, `citecheck` provides infrastructure for maintaining bibliographic integrity without requiring researchers to leave their agent-assisted writing environment.

# AI Usage Disclosure

Generative AI tools (Claude Code with Claude Opus 4) were used during the development of `citecheck` for code generation assistance, test scaffolding, and iterative debugging. All AI-generated code was reviewed, tested, and validated by the author. The test suite (47 unit and integration tests plus 40+ fixture-based regression scenarios) was used to verify correctness throughout development. This paper was drafted with AI assistance and reviewed by the author for accuracy and completeness.

# Acknowledgements

The authors thank the maintainers of the PubMed E-utilities, Crossref REST API, arXiv API, and Semantic Scholar Academic Graph API for providing open access to bibliographic metadata. `citecheck` uses the Model Context Protocol SDK developed by Anthropic.

# References
