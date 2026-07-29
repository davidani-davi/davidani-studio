# Testing

Tests make fast product work safe. The goal is complete behavioral coverage so changes can ship confidently without relying on manual memory.

## Framework

This project uses Vitest with jsdom and Testing Library.

## Commands

- `npm test` runs the complete test suite once.
- `npx vitest` runs tests in watch mode during development.
- `npm run build` runs the production Next.js and TypeScript verification.

## Test layers

- Unit tests live beside the code they cover as `*.test.ts`.
- Component tests use Testing Library and test visible behavior.
- Integration tests cover API boundaries with external services mocked.
- End-to-end tests should cover critical authenticated studio workflows when a browser test runner is added.

Name tests after the behavior they prove. Assert meaningful output and error behavior, and cover setup or cleanup explicitly when a test changes shared state.
