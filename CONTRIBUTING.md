# Contributing to Vexi

PRs welcome! The codebase is small, modular, and heavily commented — see the
`src/` layout in [README.md](README.md#contributing) for a map of what lives
where.

## Getting started

```bash
git clone https://github.com/Elomami1976/vexi.git
cd vexi
npm install
npm run build
node dist/index.js
```

## Before opening a PR

```bash
npm run lint    # eslint src
npm run build   # tsc
npm test        # vitest run
```

CI runs the same three commands on every PR (Node 18.x and 20.x, Ubuntu and
Windows) — please make sure they pass locally first.

## Guidelines

- Keep changes scoped. A bug fix doesn't need a surrounding refactor.
- Match the existing style: no unnecessary abstractions, comments explain
  *why* not *what*, atomic writes for anything persisted to disk.
- If you touch the shell-command execution path (`agent.ts`), the snapshot
  engine (`snapshots/`), or a provider's streaming client (`providers/`),
  add or update tests — that's the code most likely to affect user data or
  hang a session.
- Add a test alongside any bug fix that reproduces the bug first.
- To add support for a new API key format, edit `src/providers/detect.ts`.
- To add a new OpenAI-compatible provider, see `src/providers/index.ts` and
  `src/providers/openai-compat.ts`.

## Reporting bugs

Open a GitHub issue with:
- Vexi version (`vexi config` shows it, or check `package.json`)
- OS and Node version
- Steps to reproduce
- What you expected vs. what happened

For security issues, see [SECURITY.md](SECURITY.md) instead of opening a
public issue.
