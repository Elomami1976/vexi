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

[![npm](https://img.shields.io/npm/v/vexi-cli?color=2979FF)](https://www.npmjs.com/package/vexi-cli)
[![license](https://img.shields.io/badge/license-MIT-2979FF)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-2979FF)](package.json)
[![website](https://img.shields.io/badge/website-vexi.pro-2979FF)](https://vexi.pro)

**English** · [العربية](#-العربية) · [Español](#-español) · [Português](#-português) · [Français](#-français)

</div>

---

## Install

```bash
npm install -g vexi-cli
vexi
```

That's it. No login, no signup, no server, no database. Everything runs locally.

## Update

```bash
vexi update
# or directly:
npm install -g vexi-cli@latest
```

Vexi checks once a day whether a newer version is published on npm and prints a
one-line notice at startup if one is available. To disable the check:

```bash
vexi --no-update-check          # skip for this run
VEXI_NO_UPDATE_CHECK=1 vexi     # skip via environment variable
```

## Uninstall

```bash
vexi uninstall           # removes Vexi, keeps your ~/.vexi config
vexi uninstall --purge   # also deletes ~/.vexi (config, keys, memory)
```

Or directly, without running Vexi:

```bash
npm uninstall -g vexi-cli
rm -rf ~/.vexi           # optional -- removes config, keys, and memory
```

On Windows:

```cmd
npm uninstall -g vexi-cli
rmdir /s /q %USERPROFILE%\.vexi
```

## BYOK — Bring Your Own Key

On first run, paste any API key. Vexi **auto-detects the provider** from the key format:

| Key prefix | Provider | Auto-detect? | Free tier? |
| ---------- | -------- | ------------ | ---------- |
| `sk-ant-...` | Anthropic (Claude) | ✅ | — |
| `sk-or-...` | OpenRouter | ✅ | ✅ free models |
| `gsk_...` | Groq | ✅ | ✅ free |
| `AIza...` | Google Gemini | ✅ | ✅ free |
| `csk-...` | Cerebras | ✅ | ✅ free |
| `<32-hex>.<secret>` | Zhipu AI — GLM | ✅ | ✅ free |
| `sk-proj-...` | OpenAI | ✅ | — |
| `sk-...` *(classic)* | OpenAI / DeepSeek / Kimi — pick manually | manual select | DeepSeek ✅ / Kimi ✅ |
| *(any)* | Qwen · Mistral · MiniMax | manual select | ✅ free |

> **Tip:** If Vexi guesses the wrong provider, run `vexi config reset`, paste your key again, and pick from the list.

Your key is stored **locally** in `~/.vexi/config.json` with owner-only file permissions (`chmod 600`).

### 🆓 Start for free — no credit card needed

**International:**

| Provider | Sign-up | Free model | Speed |
| -------- | ------- | ---------- | ----- |
| **Groq** | [console.groq.com](https://console.groq.com) | Llama 3.3 70B | ⚡⚡ very fast |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) | Gemini 2.5 Flash | ⚡ fast |
| **Cerebras** | [cloud.cerebras.ai](https://cloud.cerebras.ai) | Llama 3.3 70B | ⚡⚡⚡ fastest |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai) | many free models | varies |

**Chinese AI (all free tier, great quality):**

| Provider | Sign-up | Free model | Notes |
| -------- | ------- | ---------- | ----- |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | deepseek-chat (V3) | excellent coder |
| **Zhipu AI — GLM** | [bigmodel.cn](https://bigmodel.cn) | glm-4-flash | auto-detected |
| **Alibaba Qwen** | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com) | qwen-turbo | manual select |
| **Kimi (Moonshot)** | [platform.moonshot.cn](https://platform.moonshot.cn) | moonshot-v1-8k | manual select |
| **MiniMax** | [platform.minimaxi.com](https://platform.minimaxi.com) | MiniMax-Text-01 | manual select |

To switch provider at any time:
```bash
vexi config reset   # wipe the stored key
vexi                # restart — prompts for a new key
```

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
vexi undo                   # revert the last AI file edit
vexi redo                   # re-apply a reverted edit
vexi history                # list recent AI file edits with timestamps
vexi clean                  # clear old snapshots (.vexi/snapshots/)
```

Inside the chat:

```
/help     show available commands
/model    switch model (e.g. /model gpt-4o)
/memory   show compressed project memory
/clear    clear conversation history
/undo     revert last AI file edit
/redo     re-apply last undone edit
/history  list recent AI file edits
/exit     quit
```

## ⚙️ Multi-language build support

Vexi can build and run projects in **any language** — not just JavaScript. When the AI suggests commands, it wraps them in a shell block, Vexi asks for confirmation, then executes them automatically and feeds the output back to the AI.

| Language | Commands Vexi can run |
| --- | --- |
| Python | `pip install -r requirements.txt`, `python main.py`, `pytest` |
| Java (Maven) | `mvn compile`, `mvn package`, `java -jar target/app.jar` |
| Java (Gradle) | `gradle build`, `java -jar build/libs/app.jar` |
| C / C++ | `gcc main.c -o main`, `make`, `cmake ..` |
| Rust | `cargo build`, `cargo run` |
| Go | `go build ./...`, `go run main.go` |
| JavaScript | `npm install`, `npm run build`, `npm test` |

The project scanner automatically detects `.py`, `.java`, `.c`, `.cpp`, `.rs`, `.go` files and tells the AI what language your project uses before the first message.

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

## ↩️ Undo / Redo — instant rescue from any AI edit

> Approve a change, see it break things, type `vexi undo`. Done.

```bash
vexi undo      # revert the last AI-applied file change
vexi redo      # re-apply a reverted change
vexi history   # list every file edit this session, with timestamps
vexi clean     # remove old snapshot sessions to free disk space
```

Or use the in-chat shortcuts without leaving the session: `/undo`, `/redo`, `/history`.

**How it works (lightweight snapshot design):**

- Before executing any confirmed shell command, Vexi inspects it for file-write patterns (`cat >`, `sed -i`, `mv`, `cp`, `tee`, `writeFileSync`, PowerShell `Set-Content`, and bare source-file tokens) and saves a copy of **only the affected files** into `.vexi/snapshots/<session>/`.
- `undo` restores the pre-command copy and saves the current state as a redo point — so you can bounce back and forth freely.
- Each session keeps a maximum of 50 snapshots; the oldest are pruned automatically.
- Snapshots are **per-file, not per-project** — no full-tree indexing, no slow startup, no huge disk usage (the approach OpenCode's whole-tree snapshot system suffers from).
- `vexi clean` wipes all previous sessions' snapshots while keeping the current one active.

This pairs naturally with the confirmation prompt: even if you approve a change that turns out to be wrong, one command gets you back.

## Roadmap

| Phase | Feature | Status |
| ----- | ------- | ------ |
| 1 | BYOK · easy install · terminal chat | ✅ done |
| 2 | AI Context Compression (running summary memory) · full project understanding · custom skills | ✅ done |
| 3 | **Vexi Replay** (export sessions as animated HTML) · multilingual code explanation | ✅ done |
| 4 | Visual code graph · MCP support (client **and** server mode) | ✅ done |
| 5 | **Vexi Learn** — adapts to your personal coding style | ✅ done |
| 6 | **Multi-language builds** — auto-executes pip, gcc, javac, cargo, gradle from chat | ✅ done |
| 7 | **Undo / Redo** — instant one-command revert of any AI file edit, without touching git | ✅ done |

## Why Vexi?

| | Vexi | OpenCode | Claude Code | Cursor |
| --- | --- | --- | --- | --- |
| Install | `npm i -g vexi-cli` | binary/script | `npm i -g` | desktop app |
| BYOK (any provider) | ✅ 12 providers incl. Chinese AI | ✅ | ❌ Anthropic only | partial |
| Works fully offline/local | ✅ no server, no account | ✅ | ❌ account | ❌ account |
| Native-language code explanations | ✅ ar/es/pt/fr | ❌ | ❌ | ❌ |
| Session replay export | ✅ | ❌ | ❌ | ❌ |
| Persistent project memory | ✅ | partial | partial | ✅ |
| Learns your personal coding style | ✅ from your own sessions | ❌ | ❌ | partial |
| MCP server mode (be a tool for other agents) | ✅ | ❌ | ❌ | ❌ |
| Builds any language (Python, Java, C, Rust, Go) | ✅ | ❌ | ✅ | ✅ |
| Instant undo/redo of AI edits (no git required) | ✅ per-file snapshots | ❌ | ❌ | ❌ |
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
├── snapshots/      undo/redo engine — per-file backups before AI edits
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

**Vexi** — وكيل برمجة بالذكاء الاصطناعي مفتوح المصدر يعمل في الطرفية. ثبّته بأمر واحد (`npm install -g vexi-cli`)، الصق مفتاح API الخاص بك مرة واحدة، وابدأ فورًا. لا تسجيل، لا خادم، كل شيء يعمل محليًا على جهازك. يشرح Vexi أي كود بالعربية الفصحى (`vexi explain auth.ts --ar`) في ملفات HTML تدعم الاتجاه من اليمين لليسار بشكل مثالي، ويتعلّم أسلوبك البرمجي الشخصي من جلساتك السابقة (`vexi learn`).

## 🌍 Español

**Vexi** es un agente de programación con IA, de código abierto, que vive en tu terminal. Instálalo con un solo comando (`npm install -g vexi-cli`), pega tu clave API una vez y empieza al instante. Sin registro, sin servidor: todo se ejecuta localmente. Vexi detecta tu proveedor automáticamente y habla tu idioma.

## 🌍 Português

**Vexi** é um agente de programação com IA, de código aberto, que vive no seu terminal. Instale com um único comando (`npm install -g vexi-cli`), cole sua chave de API uma vez e comece imediatamente. Sem cadastro, sem servidor: tudo roda localmente. O Vexi detecta seu provedor automaticamente e fala o seu idioma.

## 🌍 Français

**Vexi** est un agent de codage IA open source qui vit dans votre terminal. Installez-le en une seule commande (`npm install -g vexi-cli`), collez votre clé API une fois et commencez immédiatement. Pas de compte, pas de serveur : tout s'exécute localement. Vexi détecte automatiquement votre fournisseur et parle votre langue.

---

<div align="center">

**MIT License** · Made with ⚡ by the Vexi community

`npm install -g vexi-cli`

</div>
