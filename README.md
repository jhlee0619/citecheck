# citecheck

[![npm version](https://img.shields.io/npm/v/%40citecheck%2Fmcp)](https://www.npmjs.com/package/@citecheck/mcp)
[![license](https://img.shields.io/npm/l/%40citecheck%2Fmcp)](/data/jhleeEND/software/citecheck/LICENSE)

MCP server for automatic reference repair in paper-like files and research project folders.

`citecheck` finds the most likely paper or bibliography file, extracts the references section, validates entries against external sources, and returns corrected output in a format an agent can use immediately.

It is designed for MCP-capable agents such as Codex or Claude Code. Instead of asking a user to manually prepare a bibliography file, the agent can call one tool, point it at a project folder, and get back a structured repair result.

## Overview

`citecheck` is useful when:

- a paper is stored as `.tex`, `.md`, `.docx`, `.txt`, or `.bib`
- the references section is mixed into the document instead of separated cleanly
- an agent needs machine-readable output instead of a human-only report
- you want corrected bibliography output plus an explicit validation summary

At a high level, `citecheck`:

- finds the most paper-like file in the target path
- extracts the references section automatically
- validates entries against PubMed, Crossref, arXiv, and Semantic Scholar
- applies a batch policy gate
- returns corrected references as JSON, numbered text, or BibTeX

## Install

After publishing, the intended setup is:

```bash
claude mcp add citecheck -- npx -y @citecheck/mcp
```

```bash
codex mcp add citecheck -- npx -y @citecheck/mcp
```

For local development:

```bash
git clone <repo-url>
cd citecheck
npm install
npx tsx apps/mcp/src/mcp.ts
```

Once the server is registered, ask the agent to use the `citecheck` MCP server for reference repair on the current project.

## Tools

Exposed MCP tools:

- `scan_workspace`
- `analyze_references`
- `plan_reference_rewrite`
- `apply_reference_rewrite`
- `repair_paper`
- `citecheck_version`

Use `citecheck_version` for a quick connectivity check.

Recommended workflow:

- `scan_workspace` to identify the most likely paper/reference source
- `analyze_references` for structured review output
- `plan_reference_rewrite` for replacement-safe previews and patch plans
- `apply_reference_rewrite` only when explicit write-back is desired
- `repair_paper` as a compatibility wrapper

Core inputs across the workflow:

- `target_path`
- `mode`
- `output_format`
- `policy`
- `fixture_mode`
- `fixture_manifest`

Write-back planning and apply tools also accept:

- `write_mode`

`target_path` may be either a project folder or a single file.

Supported file types:

- `.bib`
- `.tex`
- `.md`
- `.txt`
- `.docx`

`mode` values:

- `review`: inspect, diff, and report risks without treating the output as overwrite-safe
- `replacement`: try to build a replacement-ready bibliography, but block or partialize the result if safety checks fail

### Example Request

Once connected, the agent can be asked something like:

```text
Use the citecheck MCP server to inspect this project and repair the references.
```

The agent should then call `repair_paper` with `target_path` set to the current project path.

## Output

Default output is JSON. It includes:

- mode
- manifestation policy
- selected file
- detected format
- references extracted
- entry statuses
- review status
- replacement eligibility
- matched work confidence
- manifestation conflict
- bibliography lint findings
- curation worklist
- key mapping
- duplicate key detection
- citation rewrite risk
- verification degraded flag
- corrected entries
- `proposedOutput`
- `replacementStatus`
- policy result
- exit code

Typical status values:

- `verified`
- `verified_with_warnings`
- `needs_review`
- `unresolved`
- `not_checked`

If the caller requests a non-JSON output format, `citecheck` can also return:

- `numbered` reference text
- `bibtex` output when the underlying data is strong enough or when the input is already bibliography-oriented

## Agent Flow

Typical usage:

1. Register the `citecheck` MCP server.
2. Optionally call `citecheck_version`.
3. Call `scan_workspace` or `analyze_references` with the current project path.
4. Call `plan_reference_rewrite` for patch previews when needed.
5. Call `apply_reference_rewrite` only for explicit sidecar or in-place writes.

Repository-local guidance for agents also lives in [AGENTS.md](/data/jhleeEND/software/citecheck/AGENTS.md).

## Layout

- `apps/mcp/src/mcp.ts`: MCP stdio server
- `apps/mcp/src/index.ts`: repair API used by the MCP server
- `apps/mcp/src/lib`: validation, connectors, runtime, and policy logic
- `eval`: regression tests and fixtures

## Development

```bash
npm install
npm run check
npm test
npm run verify
```

## License

[MIT](/data/jhleeEND/software/citecheck/LICENSE)
