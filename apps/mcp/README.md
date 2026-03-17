# @citecheck/mcp

MCP server for automatic paper reference repair.

Quick start:

```bash
claude mcp add citecheck -- npx -y @citecheck/mcp
```

Local run:

```bash
npx tsx src/mcp.ts
```

Exposed tools:

- `scan_workspace`
- `analyze_references`
- `plan_reference_rewrite`
- `apply_reference_rewrite`
- `repair_paper`
- `citecheck_version`

Recommended default:

- `mode: "review"`
