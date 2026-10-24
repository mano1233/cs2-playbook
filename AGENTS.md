<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Contributing to cs2-playbook

These rules apply to every contributor and every coding agent (Claude Code, Codex, or
anything else that reads this file). CI enforces the ticket rules on every pull request
(`.github/workflows/pr-conventions.yml`), so a PR that skips them cannot merge.

## Every change has a DEV ticket

Work is tracked in Jira, project `DEV` on `midgard-home.atlassian.net`.

- Start from an existing ticket, or create one (type `Task`, a short markdown
  description) before writing code.
- **Never invent or guess a key.** Before citing `DEV-<n>` anywhere, confirm it exists
  and is this work (`project = DEV ORDER BY created DESC`). A wrong key is worse than
  none: it survives in history and sends the next reader to unrelated work.
- No Jira access? Ask the repo owner for a ticket and wait for the key. Don't open the
  PR without one.

## Branch, commits, PR

- **Branch:** `DEV-<n>-<short-description>`, cut from `main`, e.g.
  `DEV-75-pr-conventions`. One ticket per branch. Never push to `main`.
- **Commits:** subject `<type>: <what changed>` (`feat`, `fix`, `chore`, `docs`,
  `refactor`, `test`, `ci`, `perf`, `build`), a body that says *why*, and the bare
  ticket key on its own line as the footer:

  ```
  fix: keep a lineup's screenshots when its throw is renamed

  Renaming rewrote the R2 keys, so every existing shot 404'd.

  DEV-75
  ```

- **PR title:** `<type>: <summary>`, the same shape as a commit subject. PRs are
  squash-merged, so the title becomes the commit on `main`. Append the new version for
  a release, e.g. `feat: role-coloured utility guides (0.8.0)`.
- **PR body:** what changed and why, how it was tested, and the ticket key on its own
  line.
- Before opening the PR, run what CI runs: `npm run typecheck` and `npm test`.

## Releasing

`VERSION` is the published image tag. Every push to `main` builds
`ghcr.io/mano1233/cs2-playbook:<VERSION>`. A newer VERSION also tags `v<VERSION>`,
publishes a GitHub Release with notes generated from the merged PR titles (another
reason they must be clear), and makes midgard open the PR that deploys it. Bump it in any PR that should reach production: minor for a
feature, patch for a fix, one bump per PR. A PR that leaves VERSION alone ships nothing.

## Keep out of git

Credentials, `.env.local`, API keys (`pbk_…`), database dumps, screenshots and Valve
radar images. Radars and lineup shots live in R2, uploaded through the app.
