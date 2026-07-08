# Security Policy

## Supported versions

Only the latest version published on npm (`vexi-cli@latest`) receives
security fixes. There is no long-term-support branch at this stage.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting:
[github.com/Elomami1976/vexi/security/advisories/new](https://github.com/Elomami1976/vexi/security/advisories/new)

If that's not available, email **elomami1976@gmail.com** with:
- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- The Vexi version affected

You should get an initial response within a few days. Please allow a
reasonable window to fix and release a patch before any public disclosure.

## Scope

Vexi is a local CLI that runs on the user's own machine with a
bring-your-own-key model — there is no Vexi-operated server or account
system. Areas of particular interest for security review:

- **Shell command execution** (`src/agent.ts`) — commands the AI proposes
  are only run after explicit user confirmation, with a timeout and output
  cap, but the confirmation step is the primary safety boundary.
- **Snapshot undo/redo** (`src/snapshots/`) — must never read or write
  outside the project root.
- **Skills from remote URLs** (`src/skills/`) — remote skill content is
  injected into the system prompt as an instruction the model should
  follow, so it requires a preview + explicit confirmation before saving.
- **Config storage** (`src/config.ts`) — API keys are stored locally in
  `~/.vexi/config.json` with owner-only (`0600`) permissions and never
  transmitted anywhere except directly to the configured provider.
