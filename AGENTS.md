# citecheck Agent Instructions

Use `citecheck` through MCP.

## Default Mode

If the client supports MCP, start the local stdio server from this repository:

```bash
npx tsx apps/mcp/src/mcp.ts
```

Then use:

- `citecheck_version` to confirm the server is reachable if needed
- `repair_paper` for all reference-repair work

## Tool Contract

Use `repair_paper` when the user asks to check, validate, fix, or repair:

- references
- citations
- bibliography entries
- paper reference sections

Core inputs:

- `target_path`
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
- any `needs_review`, `unresolved`, or `not_checked` entries
- the proposed corrected bibliography

## Scope

`citecheck` is intended for project folders and paper-like files such as:

- `.bib`
- `.tex`
- `.md`
- `.txt`
- `.docx`

## Fallback

If MCP is unavailable, say so plainly. Do not invent a shell CLI workflow as the primary interface for this repository.
