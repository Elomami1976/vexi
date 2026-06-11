<div align="center">

```
██╗   ██╗███████╗██╗  ██╗██╗
██║   ██║██╔════╝╚██╗██╔╝██║
██║   ██║█████╗   ╚███╔╝ ██║
╚██╗ ██╔╝██╔══╝   ██╔██╗ ██║
 ╚████╔╝ ███████╗██╔╝ ██╗██║
  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝
```

**Open-source AI coding agent for your terminal.**
Bring your own key · Zero config · Multilingual · 100% local

[![npm](https://img.shields.io/npm/v/vexi?color=2979FF)](https://www.npmjs.com/package/vexi)
[![license](https://img.shields.io/badge/license-MIT-2979FF)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-2979FF)](package.json)

**English** · [العربية](#-العربية) · [Español](#-español) · [Português](#-português) · [Français](#-français)

</div>

---

## Install

```bash
npm install -g vexi
vexi
```

That's it. No login, no signup, no server, no database. Everything runs locally.

## BYOK — Bring Your Own Key

On first run, paste any API key. Vexi **auto-detects the provider** from the key format:

| Key prefix          | Provider          |
| ------------------- | ----------------- |
| `sk-ant-...`        | Anthropic (Claude)|
| `sk-or-...`         | OpenRouter        |
| `gsk_...`           | Groq              |
| `AIza...`           | Google Gemini     |
| `sk-...` / `sk-proj-...` | OpenAI       |

If detection is ambiguous, Vexi simply asks you to pick the provider. Your key is stored **locally** in `~/.vexi/config.json` with owner-only file permissions (`chmod 600`).

## Multilingual

```bash
vexi --lang ar   # العربية
vexi --lang es   # Español
vexi --lang pt   # Português
vexi --lang fr   # Français
vexi --lang en   # English
```

Vexi auto-detects your system language on first run.

> **Note on Arabic:** terminals render RTL text incorrectly, so the interactive UI stays in English while AI replies, generated explanations and HTML exports (coming in Phase 3) are in fluent Arabic — where RTL renders perfectly.

## Usage

```bash
vexi                  # start a chat session in the current project
vexi --lang es        # start in Spanish
vexi config           # show config location + provider + model
vexi config reset     # delete the stored API key
vexi skill list       # show active skills
vexi skill add <src>  # add a skill (local .md file or GitHub URL)
vexi skill remove <n> # remove a skill
vexi replay           # list recorded sessions
vexi replay --export  # export a session as an animated HTML replay
vexi explain auth.ts --ar   # explain a file in Arabic (opens RTL HTML)
vexi explain src/ --es      # explain a folder in Spanish (in terminal)
vexi graph --visual         # interactive dependency graph in your browser
vexi mcp list               # manage external MCP servers
vexi --mcp-server           # expose Vexi as an MCP server (stdio)
vexi learn                  # learn your coding style from past sessions
vexi learn --apply          # save it as a skill (injected in every session)
```

Inside the chat:

```
/help    show available commands
/model   switch model (e.g. /model gpt-4o)
/memory  show compressed project memory
/clear   clear conversation history
/exit    quit
```

## 🧠 Project memory — Context Compression Engine

Most AI coding tools forget earlier decisions once the conversation gets long.
Vexi doesn't delete old messages — it **compresses** them:

- Recent messages always stay in full.
- Older messages are folded into a *running summary* + key decision points
  (e.g. *"User chose JWT for authentication"*) stored in `.vexi/memory.json`.
- Memory is loaded automatically on every session start — Vexi remembers
  your decisions **across sessions**, even in large projects.
- Inspect it anytime with `/memory`.

## 🗺️ Full project understanding

On startup Vexi scans your whole project (not just the open file) and injects
a compact map into every prompt: languages, frameworks, and architecture
layers (frontend / backend / database / auth / devops).

Scanner safeguards: respects `.gitignore`, always skips `node_modules`,
`.git`, `dist`, `build`, `coverage`, and ignores files larger than 500KB —
so it never floods the context window.

## 🎯 Custom Skills

Teach Vexi *your* conventions with plain markdown files in `.vexi/skills/`:

```
.vexi/skills/
  api-style.md     "All API endpoints follow REST + Zod validation"
  arabic-docs.md   "All documentation written in Arabic"
  my-stack.md      "Always use Next.js + Supabase + Tailwind"
```

Every skill is injected into the system prompt on session start, so generated
code follows your style automatically. Share skills via GitHub:

```bash
vexi skill add https://github.com/user/react-best-practices
vexi skill add ./docs/conventions.md
```

## 🎬 Vexi Replay

Every chat session is automatically recorded to `.vexi/sessions/` (locally,
nothing leaves your machine). Export any session as a **single standalone
HTML file**:

```bash
vexi replay --export             # latest session
vexi replay --export --lang ar   # full RTL Arabic replay
```

The generated page has play/pause and 1×/2×/4× speed controls, messages
appear with their real timing and a character-by-character typing effect,
and it ends with a session summary (duration, messages, model). An
**Export video** button records the replay right in the browser
(MediaRecorder — no ffmpeg, the CLI stays lightweight). Share it anywhere.

## 🌍 Explain code in your native language

> The first AI tool that explains any code in your native language.

```bash
vexi explain auth.ts --ar    # Arabic — opens a beautiful RTL HTML page
vexi explain src/ --es       # Spanish — streams into the terminal
vexi explain app.py --fr     # French
```

Structured output: file purpose → function-by-function breakdown with line
numbers → how the pieces fit together. Latin-script languages stream
directly in the terminal; Arabic is written to `.md` + `.html` (dir="rtl")
and opened in your browser, where it renders perfectly.

## 🗺️ Visual code graph

```bash
vexi graph --visual
```

Generates a **single HTML file** (no server) and opens it in your browser:
an interactive d3 force-directed graph of your modules with zoom, drag and
search. Node heat shows how many files depend on each module, and clicking
a node runs **impact analysis** — highlighting every file that breaks if
you change it.

## 🔌 MCP support

**Vexi as MCP client** — connect external tools and the AI can call them
mid-conversation (works with every provider, no function-calling API needed):

```bash
vexi mcp add github npx -y @modelcontextprotocol/server-github
vexi mcp list
```

Configuration lives in `~/.vexi/mcp.json` (same shape as Claude Desktop's
config, copy entries verbatim).

**Vexi as MCP server** — the unique part: Vexi exposes its own capabilities
to *other* AI agents (Claude Desktop, Claude Code, Cursor…), built with the
official `@modelcontextprotocol/sdk`:

| Capability | Type |
| --- | --- |
| `vexi://project` — project structure map | Resource |
| `vexi://memory` — decisions & summary from past sessions | Resource |
| `vexi://sessions` — recorded session list | Resource |
| `scan_project` / `project_memory` / `explain_code` (5 languages) | Tools |

```jsonc
// Claude Desktop config
{ "mcpServers": { "vexi": { "command": "vexi", "args": ["--mcp-server"] } } }
```

Vexi **complements** Claude Code instead of competing: its project memory
becomes a shared memory layer usable by any agent.

## 🧠 Vexi Learn

> The agent gets more *you* over time.

```bash
vexi learn           # analyze your recent sessions, preview the learned style
vexi learn --apply   # save it as .vexi/skills/learned-style.md
```

Vexi mines your own recorded sessions for the strongest style signal there
is: **your corrections to the AI** — “don't use classes”, “always use
async/await”, “prefer named exports”, “لا تستخدم مكتبات خارجية” (signal
detection works in all 5 languages). It distills them into a markdown skill
file that is automatically injected into the system prompt of every future
session, so you stop repeating yourself. Everything stays local — the only
network call is to your own model provider, and you always preview before
saving.

## Roadmap

| Phase | Feature | Status |
| ----- | ------- | ------ |
| 1 | BYOK · easy install · terminal chat | ✅ done |
| 2 | AI Context Compression (running summary memory) · full project understanding · custom skills | ✅ done |
| 3 | **Vexi Replay** (export sessions as animated HTML) · multilingual code explanation | ✅ done |
| 4 | Visual code graph · MCP support (client **and** server mode) | ✅ done |
| 5 | **Vexi Learn** — adapts to your personal coding style | ✅ done |

## Why Vexi?

| | Vexi | OpenCode | Claude Code | Cursor |
| --- | --- | --- | --- | --- |
| Install | `npm i -g vexi` | binary/script | `npm i -g` | desktop app |
| BYOK (any provider) | ✅ 5 providers, auto-detect | ✅ | ❌ Anthropic only | partial |
| Works fully offline/local | ✅ no server, no account | ✅ | ❌ account | ❌ account |
| Native-language code explanations | ✅ ar/es/pt/fr | ❌ | ❌ | ❌ |
| Session replay export | ✅ | ❌ | ❌ | ❌ |
| Persistent project memory | ✅ | partial | partial | ✅ |
| Learns your personal coding style | ✅ from your own sessions | ❌ | ❌ | partial |
| MCP server mode (be a tool for other agents) | ✅ | ❌ | ❌ | ❌ |
| License | MIT | MIT | proprietary | proprietary |

Vexi **complements** tools like Claude Code instead of competing: its project memory and multilingual explanations will be exposed over MCP so any agent can use them.

## Privacy & security

- Your API key never leaves your machine — requests go **directly** to your provider.
- `~/.vexi/config.json` is written atomically with `0600` permissions.
- No telemetry, no analytics, no accounts.

## Contributing

PRs welcome! The codebase is small, modular and heavily commented:

```
src/
├── index.ts        entry point
├── cli.ts          CLI definition (commander)
├── agent.ts        chat loop + first-run onboarding
├── config.ts       ~/.vexi/config.json (atomic, chmod 600)
├── providers/      key detection + streaming API clients
├── scanner/        project mapper (.gitignore-aware, size-capped)
├── memory/         Context Compression Engine (.vexi/memory.json)
├── skills/         custom skills loader (.vexi/skills/*.md)
├── replay/         session recorder + HTML replay export
├── explain/        multilingual code explanation (RTL HTML for Arabic)
├── graph/          dependency graph + interactive d3 visualization
├── mcp/            MCP client (tools in chat) + server mode
├── learn/          Vexi Learn — style mining from your own sessions
├── i18n/           5-language UI strings + RTL strategy
├── ui/             terminal branding (chalk, ora)
└── utils/          atomic JSON writes, cross-platform open
```

1. Fork & clone
2. `npm install && npm run build`
3. `node dist/index.js`
4. Open a PR

To add support for a new key format, edit a single file: `src/providers/detect.ts`.

---

## 🌍 العربية

**Vexi** — وكيل برمجة بالذكاء الاصطناعي مفتوح المصدر يعمل في الطرفية. ثبّته بأمر واحد (`npm install -g vexi`)، الصق مفتاح API الخاص بك مرة واحدة، وابدأ فورًا. لا تسجيل، لا خادم، كل شيء يعمل محليًا على جهازك. يشرح Vexi أي كود بالعربية الفصحى (`vexi explain auth.ts --ar`) في ملفات HTML تدعم الاتجاه من اليمين لليسار بشكل مثالي، ويتعلّم أسلوبك البرمجي الشخصي من جلساتك السابقة (`vexi learn`).

## 🌍 Español

**Vexi** es un agente de programación con IA, de código abierto, que vive en tu terminal. Instálalo con un solo comando (`npm install -g vexi`), pega tu clave API una vez y empieza al instante. Sin registro, sin servidor: todo se ejecuta localmente. Vexi detecta tu proveedor automáticamente y habla tu idioma.

## 🌍 Português

**Vexi** é um agente de programação com IA, de código aberto, que vive no seu terminal. Instale com um único comando (`npm install -g vexi`), cole sua chave de API uma vez e comece imediatamente. Sem cadastro, sem servidor: tudo roda localmente. O Vexi detecta seu provedor automaticamente e fala o seu idioma.

## 🌍 Français

**Vexi** est un agent de codage IA open source qui vit dans votre terminal. Installez-le en une seule commande (`npm install -g vexi`), collez votre clé API une fois et commencez immédiatement. Pas de compte, pas de serveur : tout s'exécute localement. Vexi détecte automatiquement votre fournisseur et parle votre langue.

---

<div align="center">

**MIT License** · Made with ⚡ by the Vexi community

`npm install -g vexi`

</div>
