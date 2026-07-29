# Repository Guidelines

## Project Structure & Module Organization

The React, TypeScript, and Vite frontend lives in `src/`. Organize changes by feature: `scene/` owns the Three.js environment, `induction/` the training flow, `evaluation/` assessments, and `progress/` persistence. The Express and Mongoose API is under `server/`; keep endpoints in `routes/`, schemas in `models/`, and business rules in `domain/`. Put cross-application contracts in `shared/`. Tests belong in `tests/`; static files and 3D models belong in `public/`.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies.
- `npm run dev:frontend`: start Vite with hot reload.
- `npm run dev:backend`: start the API in watch mode in a second terminal.
- `npm run seed`: load the local MongoDB development data.
- `npm run typecheck`: validate frontend and server TypeScript.
- `npm run lint`: run the repository ESLint configuration.
- `npm test`: execute all test suites through `tsx`.
- `npm run build`: type-check both applications and create the production frontend bundle.

Copy `.env.example` to `.env` before local development.

## Coding Style & Naming Conventions

Use four-space indentation, single quotes, semicolons, and strict TypeScript types. Name React components and files in `PascalCase`, variables and functions in `camelCase`, and hooks with a `use` prefix. Do not place progression or authorization rules only in UI components. Preserve stable identifiers shared between scene objects, training content, and persisted progress. Run ESLint and type checking before review.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name files `*.test.ts` and keep them in `tests/`. Add regression coverage for behavior changes, especially station ordering, unlock conditions, evaluation validation, progress recovery, and required model assets. Tests must be deterministic and independent of production credentials or shared databases. No numeric coverage threshold is enforced; exercise all meaningful changed paths.

## Commit & Pull Request Guidelines

Follow the existing history: concise, imperative Spanish subjects, for example `Agrega recuperación del progreso`. Keep each commit scoped to one coherent change. Pull requests should explain the result, architectural impact, and verification performed; link an issue when available. Include screenshots or a recording for UI or 3D changes, and call out new environment variables, migrations, or asset licenses.

## Security & Configuration

Never commit `.env`, JWT secrets, MongoDB credentials, or user data. Update `.env.example` with safe placeholders whenever configuration changes. Validate authorization and evaluation answers on the server, even when the frontend already restricts access.
