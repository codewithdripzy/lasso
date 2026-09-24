# Publishing `@lasso-ai/cli` to npm

This document is for maintainers preparing a release of the [`@lasso-ai/cli`](https://www.npmjs.com/package/@lasso-ai/cli) package.

## Prerequisites

- npm account with publish access to the `@lasso-ai` scope.
- Node.js **>= 18**.
- A clean git tree on the release commit tagged in [CHANGELOG.md](../CHANGELOG.md).

## Pre-release checklist

1. Update version in `package.json` and add a dated section in `CHANGELOG.md`.
2. Run quality gates:

   ```bash
   pnpm install
   pnpm format:check
   pnpm typecheck
   pnpm build
   ```

3. Inspect the tarball contents (no secrets, no `node_modules`, includes `dist/`):

   ```bash
   npm pack --dry-run
   ```

   Expected top-level paths include `package.json`, `README.md`, `LICENSE`, `dist/cli/`, and `dist/overlay.js`.

## Publish

From the repository root (`lib/`):

```bash
npm login
npm publish --access public
```

`prepublishOnly` runs `npm run build` automatically before publish.

For a prerelease:

```bash
npm publish --access public --tag next
```

## After publish

1. Create a [GitHub release](https://github.com/codewithdripzy/lasso/releases) matching the version tag.
2. Confirm the [npm package page](https://www.npmjs.com/package/@lasso-ai/cli) shows the new README, homepage, and funding link.
3. Smoke-test install in a fresh app:

   ```bash
   npm i -g @lasso-ai/cli@latest
   npx @lasso-ai/cli --help
   ```

## Links

- **Website:** [lasso.byorello.space](https://lasso.byorello.space)
- **Repository:** [github.com/codewithdripzy/lasso](https://github.com/codewithdripzy/lasso)
- **Issues:** [github.com/codewithdripzy/lasso/issues](https://github.com/codewithdripzy/lasso/issues)
