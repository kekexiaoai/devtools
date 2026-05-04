# Repository Guidelines

## Project Structure & Module Organization

This repository is a Wails v2 desktop app with a Go backend and React/TypeScript frontend. Root files such as `main.go`, `wails.json`, `go.mod`, and `Makefile` define the app entry point, Wails configuration, Go module, and common workflows. Backend code lives in `backend/`: shared packages are under `backend/pkg`, internal application logic under `backend/internal`, and Wails-exposed services under `backend/service`. Frontend code lives in `frontend/src`, with views in `frontend/src/views`, reusable components in `frontend/src/components`, hooks in `frontend/src/hooks`, and utilities in `frontend/src/lib` or `frontend/src/utils`. Generated Wails bindings are in `frontend/wailsjs`; do not edit them by hand. Screenshots and product images are stored in `snapshots/`.

## Build, Test, and Development Commands

- `make install`: install frontend dependencies, Wails CLI, and git hooks.
- `make dev`: start the integrated Wails development environment with debug tags.
- `make build`: build the production Wails app into `build/bin`.
- `make frontend-dev`: run the Vite frontend only.
- `make frontend-build`: run TypeScript checks and build frontend assets.
- `make lint-all`: run frontend type checking, ESLint fixes, and formatting.
- `make test`: run frontend Vitest tests.
- `go test ./...`: run Go backend tests.

## Coding Style & Naming Conventions

Go code must be formatted with `gofmt`; use short package names and keep platform-specific files named with suffixes such as `_darwin.go`, `_windows.go`, or `_unix.go`. TypeScript uses Prettier and ESLint from `frontend/eslint.config.js`; use two-space indentation, single quotes, PascalCase for React components, camelCase for hooks/utilities, and `useXxx` for hook names. Prefer existing shadcn/ui and Radix patterns for UI work.

## Testing Guidelines

Frontend tests use Vitest and should sit next to source files as `*.test.ts` or `*.test.tsx`. Backend tests use Go’s standard `testing` package as `*_test.go`. Cover stateful hooks, SSH config parsing, tunnel lifecycle logic, and edge cases around platform-specific behavior.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commits, for example `feat(terminal): search`, `fix: Remove duplicate code`, and `chore: update release-windows action`. Keep commits focused and use scopes when helpful. Pull requests should include a short problem summary, implementation notes, test results, linked issues, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit local SSH credentials, generated logs, or machine-specific config. Treat `~/.ssh/config` handling and tunnel commands as sensitive paths; validate inputs and avoid logging secrets.
