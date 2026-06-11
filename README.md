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
```

Inside the chat:

```
/help    show available commands
/model   switch model (e.g. /model gpt-4o)
/clear   clear conversation history
/exit    quit
```

## Roadmap

| Phase | Feature | Status |
| ----- | ------- | ------ |
| 1 | BYOK · easy install · terminal chat | ✅ done |
| 2 | AI Context Compression (running summary memory) · full project understanding · custom skills | 🔜 |
| 3 | **Vexi Replay** (export sessions as animated HTML) · multilingual code explanation | 🔜 |
| 4 | Visual code graph · MCP support (client **and** server mode) | 🔜 |
| 5 | **Vexi Learn** — adapts to your personal coding style | 🔜 |

## Why Vexi?

| | Vexi | OpenCode | Claude Code | Cursor |
| --- | --- | --- | --- | --- |
| Install | `npm i -g vexi` | binary/script | `npm i -g` | desktop app |
| BYOK (any provider) | ✅ 5 providers, auto-detect | ✅ | ❌ Anthropic only | partial |
| Works fully offline/local | ✅ no server, no account | ✅ | ❌ account | ❌ account |
| Native-language code explanations | ✅ ar/es/pt/fr (Phase 3) | ❌ | ❌ | ❌ |
| Session replay export | ✅ (Phase 3) | ❌ | ❌ | ❌ |
| Persistent project memory | ✅ (Phase 2) | partial | partial | ✅ |
| MCP server mode (be a tool for other agents) | ✅ (Phase 4) | ❌ | ❌ | ❌ |
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
├── i18n/           5-language UI strings + RTL strategy
└── ui/             terminal branding (chalk, ora)
```

1. Fork & clone
2. `npm install && npm run build`
3. `node dist/index.js`
4. Open a PR

To add support for a new key format, edit a single file: `src/providers/detect.ts`.

---

## 🌍 العربية

**Vexi** — وكيل برمجة بالذكاء الاصطناعي مفتوح المصدر يعمل في الطرفية. ثبّته بأمر واحد (`npm install -g vexi`)، الصق مفتاح API الخاص بك مرة واحدة، وابدأ فورًا. لا تسجيل، لا خادم، كل شيء يعمل محليًا على جهازك. في المرحلة الثالثة سيشرح Vexi أي كود بالعربية الفصحى في ملفات HTML تدعم الاتجاه من اليمين لليسار بشكل مثالي.

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
