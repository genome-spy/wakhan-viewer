# Wakhan Viewer

A browser-based Wakhan results viewer built with TypeScript, Lit, Vite, and
GenomeSpy. ZIP files are processed locally in a web worker.

## Code style

- Use native TypeScript types. Prefer inference for clear initializers and
  explicit types where the contract would otherwise be unclear.
- Match the existing formatting: two-space indentation, spaces rather than
  tabs, double-quoted strings, and semicolons.
- Use modern JavaScript syntax and prefer `const` unless reassignment is needed.
  Classes and types use `PascalCase`; source files use `camelCase`.
- Separate logical blocks within functions with blank lines. Keep closely
  related statements together.
- Prefer straightforward control flow and removing duplication over adding
  abstractions. Keep one source of truth and derive secondary values.
- Rely on types, validate at boundaries, and fail fast on unexpected input.
  Avoid unnecessary null checks, optional chaining, and silent fallbacks.
  Optional or nullable state should have clear semantics.
- Add recovery, retries, rollback, or reentrancy only for a supported requirement.
  Preserve cleanup and handling of expected loading, cancellation, and disposal.
- Cover every case when branching on enums or discriminated unions and fail
  loudly on unknown values.
- Use JSDoc for non-obvious intent. Remove associated comments when removing code.

## Verification

- Keep Vitest `.test.ts` files next to the code they cover. Test behavior and
  contracts rather than repeating implementation details.
- Use the lightest relevant verification for copy or presentation-only changes.
  During iteration, run focused tests with `npx vitest run <test-file>`; use
  `npm run test:run` when the scope or risk warrants the full suite.
- Run `npm run typecheck` or `npm run build` as appropriate. The build includes
  type checking. Simplify or remove redundant tests when refactoring while
  preserving meaningful regression coverage.

## Commit style

- Use Conventional Commits, for example `feat: add app installation support` or
  `fix: handle invalid ZIP archives`. Add a scope when it helps clarify the change.
- Keep the complete header and each body/footer line at most 100 characters.
  Include a brief body explaining the rationale unless the change is trivial.
- Reserve `docs` for user-facing documentation. Use `chore` for internal
  documentation such as agent instructions and architecture maintenance.
