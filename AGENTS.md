# citecheck Agent Instructions

Use `citecheck` through MCP.

## Default Mode

If the client supports MCP, start the local stdio server from this repository:

```bash
npx tsx apps/mcp/src/mcp.ts
```

Then use:

- `citecheck_version` to confirm the server is reachable if needed
- `scan_workspace` to locate paper-like files
- `analyze_references` for structured review output
- `plan_reference_rewrite` for patch previews
- `apply_reference_rewrite` only when explicit write-back is requested
- `repair_paper` only as a compatibility wrapper

## Tool Contract

Use `repair_paper` when the user asks to check, validate, fix, or repair:

- references
- citations
- bibliography entries
- paper reference sections

Core inputs:

- `target_path`
- `mode`
- `output_format`
- `policy`

Optional replay inputs:

- `fixture_mode`
- `fixture_manifest`

## What To Return

After running `repair_paper`, summarize:

- the selected file
- the detected format
- how many references were extracted
- whether verification was degraded by rate limits or payload failures
- any key remapping risk
- any manifestation conflicts
- any bibliography lint findings
- the curation worklist items with highest priority
- any `needs_review`, `unresolved`, or `not_checked` entries
- any entries blocked for replacement
- the proposed corrected bibliography

## Post-Review Workflow

After presenting the summary, ask the user how they want to receive the corrections:

1. **Overwrite original file?** — Use `apply_reference_rewrite` with `write_mode: "replace"`. The output preserves the original file format (bib stays bib, numbered stays numbered). If citation keys changed, `.tex` files in the same directory that reference the `.bib` file are automatically updated (`\cite`, `\citep`, `\citet`, etc.). Report any `citationKeyRewrites` in the result to the user. Ask if the user wants to remove unresolved entries (`remove_unresolved: true`). When enabled:
   - Unresolved/not_checked entries are removed from the bibliography
   - For `.tex`: `\cite{removedKey}` commands are removed from citing files
   - For `.md`/`.txt`: `[N]` citation markers are removed and remaining numbers are renumbered
   - Report `removedEntries` and `citationRemovals` to the user
2. **Save separately?** — Ask which format:
   - **BibTeX** (`.bib`) — `output_format: "bibtex"`
   - **Numbered list** — `output_format: "numbered"`
   - **EndNote** (`.enw`) — `output_format: "enw"`
   Then write the output to a new file in the requested format.

## Input Preparation

citecheck works best with structured input. Before calling any tool:

1. **BibTeX (`.bib`)** — pass directly, no preprocessing needed.
2. **Numbered reference lists** (`1. Author...`, `[1] Author...`) — pass directly, handled well.
3. **Unstructured plain text** (e.g. ACL-style author-year with no numbering, PDF copy-paste) — **preprocess first**:
   - Add sequential numbering (`1.`, `2.`, ...) to each reference entry.
   - Rejoin hyphenated line breaks (e.g. `Steer-\nMoE` → `SteerMoE`).
   - Save as `.txt` and pass the file path.

When the user pastes raw reference text inline, write it to a temp `.txt` file before calling `repair_paper`.

## Scope

`citecheck` is intended for project folders and paper-like files such as:

- `.bib`
- `.tex`
- `.md`
- `.txt`
- `.docx`

## Fallback

If MCP is unavailable, say so plainly. Do not invent a shell CLI workflow as the primary interface for this repository.
