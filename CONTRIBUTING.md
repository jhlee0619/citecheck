# Contributing to citecheck

Thank you for considering contributing to citecheck. This document explains how to get started.

## Getting Started

```bash
git clone https://github.com/jhlee0619/citecheck.git
cd citecheck
npm install
```

## Development Workflow

```bash
npm run check    # TypeScript type checking
npm test         # Run unit and integration tests
npm run test:gold # Run fixture-based regression suite
npm run verify   # All of the above
```

## Making Changes

1. Fork the repository and create a feature branch from `main`.
2. Write or update tests for your changes.
3. Run `npm run verify` and ensure all checks pass.
4. Submit a pull request with a clear description of the change.

## Reporting Bugs

Open an issue at https://github.com/jhlee0619/citecheck/issues with:

- A description of the problem
- Steps to reproduce (input file format, tool called, arguments used)
- Expected vs. actual behavior
- `citecheck_version` output

## Adding a New Connector

To add a new bibliographic data source:

1. Create a new file in `apps/mcp/src/lib/connectors/` implementing the `ReferenceConnector` interface.
2. Add the source name to the `SourceName` type in `apps/mcp/src/lib/core/index.ts`.
3. Register the connector in `apps/mcp/src/lib/runtime/factory.ts`.
4. Add fixture entries in `eval/` for regression testing.
5. Add HTTP policy defaults in `defaultRuntimeFactoryConfig()`.

## Code Style

- TypeScript strict mode
- ESM modules (`"type": "module"`)
- No external linter configuration; follow existing patterns in the codebase
- Prefer explicit types over `any`

## Code of Conduct

Contributors are expected to be respectful and constructive. Harassment or abusive behavior will not be tolerated.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
