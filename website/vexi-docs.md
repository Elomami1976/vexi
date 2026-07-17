# Vexi — Documentation

> Free, open-source AI coding agent for your terminal.
> One guide, five languages. Commands are universal (English); only the prose is translated.
> GitHub: https://github.com/Elomami1976/vexi · Site: https://vexi.pro

**Languages in this file:** [English](#english) · [العربية](#العربية) · [Français](#français) · [Español](#español) · [Português](#português)

---
---

<a id="english"></a>
# 🇬🇧 English

## 1. What Vexi is (and what it is not)

Vexi is the **agent** — the tool that reads your files, writes code and chats in your terminal. It has **no AI brain of its own.** It connects to a model that lives elsewhere (OpenRouter, Groq, DeepSeek…) using an API key.

> **Mental model:** Think of a web browser. Chrome contains no websites — it just *connects* to them. Vexi is the same: it contains no AI, it connects to one.

There are **two kinds of "free"** here, and mixing them up causes most early confusion:

- **Vexi the tool** → free (open source, installed free via npm).
- **The AI model** → free only if the provider you connect offers a free tier.

## 2. Install & update

You need Node.js installed (which includes npm). Then install Vexi globally:

```
npm install -g vexi-cli
```

To update to the latest version:

```
npm install -g vexi-cli@latest
```

> ⚠️ **Windows: `vexi update` may fail.** You may see `spawn EINVAL` when running `vexi update`. This is a known Node.js behavior on recent versions. The reliable workaround is to run the npm command directly (above) instead of `vexi update` — typed in your terminal, it always works.

Check your installed version anytime:

```
vexi --version
```

## 3. Connect an AI with `vexi setup`

`vexi setup` is the clean, recommended way to configure your AI. It starts from the endpoint **URL**, so there is no guessing — it detects the provider, fetches the live model list, lets you pick one, and verifies the connection with a real request before saving — so a bad key or wrong URL fails at setup, not on your first chat.

```
vexi setup
```

It asks three things, in order — **URL → key → model**:

```
? Paste your endpoint URL  › https://openrouter.ai/api/v1
  Detected: OpenRouter
? Paste your API key       › sk-or-...
  Fetching available models…
? Choose a model           › deepseek/deepseek-chat-v3:free
  Verifying connection…
  ✓ Verified — got a live response
  ✓ Saved — run `vexi` to start
```

> 💡 **Why setup beats pasting a key:** the first-run flow tries to *guess* your provider from the key's prefix, which is ambiguous (`sk-` could be OpenAI, DeepSeek or Kimi). `vexi setup` removes the guessing and shows you the real model list. Use it whenever you set up or switch providers.

## 4. Provider endpoint URLs

An endpoint URL is **not a page you open in a browser** — it is the address you paste into `vexi setup`. You never *see* it on the provider's website; you get your **key** from the website and the **URL** from the table below (or the provider's docs).

| Provider | Endpoint URL | Free tier? |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | ✓ |
| Groq | `https://api.groq.com/openai/v1` | ✓ |
| DeepSeek | `https://api.deepseek.com/v1` | ✓ |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | ✓ |
| Cerebras | `https://api.cerebras.ai/v1` | ✓ |
| Ollama (local) | `http://localhost:11434/v1` | ✓ |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | ✕ |
| OpenAI | `https://api.openai.com/v1` | ✕ |
| Kimi (Moonshot) — intl | `https://api.moonshot.ai/v1` | trial |

> 💡 **Simplest path — one key for everything:** with a single **OpenRouter** key you can reach GLM, DeepSeek, Kimi, Claude, Gemini and more — just change the model. Stay on `https://openrouter.ai/api/v1` and you'll rarely touch `vexi setup` again.

> ⚠️ **Kimi: match key and region.** Kimi (Moonshot) has two separate regions. A key from `platform.kimi.ai` only works with `api.moonshot.ai`; a key from `platform.moonshot.cn` only works with `api.moonshot.cn`. Mixing them causes an endless "re-enter your key" loop.

## 5. Choosing free vs paid models

On OpenRouter, models ending in `:free` cost nothing. Everything else charges your credits per token.

> 💡 **Rule:** only pick models ending in `:free`, or use a provider's free tier (Groq, Gemini, Cerebras). Then you never spend money.

The trade-off: free models are weaker. They may **invent files that don't exist**, drift between languages, or ignore instructions. If a model hallucinates content or won't follow your rules, that's the *model*, not Vexi — switch to a stronger one (DeepSeek's free tier is a good step up; GLM 5.2 is a low-cost paid option).

## 6. `vexi` vs `vexi setup` — daily use

`vexi setup` **configures** (which AI to use). `vexi` **uses** it (chat and code). You configure once; you run many times. Your config is saved and persists — you do *not* run setup before every session.

```
# once (or when switching models)
vexi setup

# every time you want to work
vexi
```

Running `vexi` starts the interactive chat. The status line shows your current setup at a glance:

```
project salik · provider OpenRouter · model deepseek/deepseek-chat-v3:free · lang en
```

At the `>` prompt, type a request in plain language. In-session commands include `/help /model /clear /undo /redo /history /push /usage /exit`.

## 7. Switching provider or model

| I want to… | Do this |
|---|---|
| Switch to a new provider | `vexi setup` |
| Switch model, same provider | `/model <id>` |
| Just use what's configured | `vexi` |

Inside a chat session, swap the model instantly without re-entering your key:

```
/model z-ai/glm-5.2
```

> ⚠️ **Note:** `/model` accepts any string without checking it against the live list — a typo won't complain until the API rejects your next message. Copy the exact slug (the `:free` suffix and any `vendor/` prefix must match).

## 8. Custom skills (project rules)

Skills are plain markdown files in `.vexi/skills/` inside your project. On every chat session they're injected as rules the model must follow — perfect for "always use Windows commands" or "reply in Arabic". Note `.vexi/skills` is **two nested folders**, and each skill file must end in `.md`.

**Manage skills:**

```
vexi skill add ./my-rules.md              # from a local file
vexi skill add https://github.com/u/repo  # from a GitHub repo
vexi skill list                           # show active skills
vexi skill remove my-rules                # remove by NAME (no .md)
```

> ⚠️ **Create the file, don't paste commands into it.** On Windows, the reliable way to create a skill is to run a command that *writes the file for you* — don't open Notepad and paste the terminal command into the file. Everything between `@'` and `'@` below is the file content; the rest is the command that saves it.

```powershell
New-Item -ItemType Directory -Force -Path ".vexi\skills" | Out-Null
@'
# Project Conventions
- Use Windows PowerShell commands only (no touch, ls, rm, cat, &&).
- Reply in Arabic by default.
- Explain only the real files in this project; never invent files.
'@ | Set-Content -Path ".vexi\skills\rules.md" -Encoding UTF8
```

## 9. Adding MCP servers

MCP servers give the model extra tools. Vexi's MCP client runs a **local command** (stdio). The general form is:

```
vexi mcp add <name> <command> [args...]
vexi mcp list
vexi mcp remove <name>
```

A **remote** MCP server (a URL, like Higgsfield) can't be added directly, because Vexi only speaks stdio. Use the `mcp-remote` bridge — install it once, then point Vexi at it:

```
npm install -g mcp-remote
vexi mcp add higgsfield mcp-remote https://mcp.higgsfield.ai/mcp
```

> ❌ **Error: `unknown option '-y'`.** If you use `npx -y`, Vexi's parser grabs the `-y` as its own flag and fails. Fix: install `mcp-remote` globally (above) so you drop `npx -y` entirely — or pass `--` before it: `vexi mcp add name npx -- -y mcp-remote <url>`.

On first launch after adding, the bridge opens your browser to log in and authorize. Note: driving many tools well needs a capable model — free models often struggle, and media results come back as URLs in the terminal.

## 10. Explain code in your language

`vexi explain` writes an explanation of a file or folder. Arabic opens as a clean right-to-left HTML page in your browser:

```
vexi explain index.html --ar     # Arabic (opens RTL HTML)
vexi explain src/ --fr           # French
vexi explain app.py --es         # Spanish
```

> 💡 **The flag wins — always pass it.** The language flag (`--ar`) overrides everything else. Without it, the command falls back to your session language and a weak model may drift to another language. Note: skills do *not* control `explain` — only the flag does.

## 11. Replay — export a session

Every chat is recorded to `.vexi/sessions/`. `vexi replay` does **not** re-run anything — it turns a saved session into a watchable, animated HTML page (play/pause, speed controls, an "export video" button). Great for demos.

```
vexi replay              # list recorded sessions
vexi replay --export     # export latest as animated HTML
vexi replay --export --lang ar   # right-to-left Arabic replay
```

## 12. Inside the `.vexi` folder

Each project gets a `.vexi/` folder. Here's what lives in it:

| Item | What it is |
|---|---|
| `sessions/` | Recorded chats — read by `vexi replay`. |
| `snapshots/` | Undo/redo history. Vexi copies files here before editing, so `/undo` works without git. Don't delete while working. |
| `skills/` | Your convention files (`.md`) — injected into every session. |
| `project.json` | Project scan data and config. |

> 💡 **Empty skills folder is normal.** If you remove your last skill, the `skills` folder becomes empty — that's expected, not a bug. Re-add a skill to bring it back.

## 13. Troubleshooting

- ❌ **`spawn EINVAL` on `vexi update` (Windows)** — run `npm install -g vexi-cli@latest` directly in your terminal instead of `vexi update`.
- ❌ **Endless "re-enter your API key?"** — the provider rejected the key. Most common cause: wrong endpoint for that key (e.g. Kimi `.ai` key with the `.cn` URL). Re-run `vexi setup` with the URL that matches your key's region, or check the key has credit.
- ❌ **`'touch' is not recognized` (Windows)** — the model emitted a Unix command. Add a skill telling it to use Windows PowerShell commands only. The file is often still created by the second, valid command, so check before assuming it failed.
- ❌ **Arabic shows as boxes (□□□)** — not a bug; the classic Windows PowerShell console lacks Arabic glyphs. Read Arabic via `vexi explain … --ar` (opens in the browser, renders perfectly), or use the modern Windows Terminal app.
- ❌ **The model invents files / changes language** — this is a weak free model, not Vexi. Switch to a stronger model with `vexi setup` or `/model` (e.g. `deepseek/deepseek-chat-v3:free` or paid `z-ai/glm-5.2`).
- ❌ **`unknown option '-y'` when adding MCP** — install `mcp-remote` globally and drop `npx -y`, or insert `--` before the passthrough args.
- ⚠️ **Keep your keys private** — an API key is a password. Never share it in screenshots or screen recordings. If a key is ever exposed, delete it in the provider's console and create a new one.

---
---

<a id="العربية"></a>
# 🇸🇦 العربية

## ١. ما هو Vexi (وما ليس هو)

‏Vexi هو **الوكيل** — الأداة التي تقرأ ملفاتك وتكتب الشيفرة وتحادثك في الطرفية. لكنه **لا يملك عقلاً ذكياً خاصاً به.** بل يتصل بنموذج موجود في مكان آخر (OpenRouter أو Groq أو DeepSeek…) باستخدام مفتاح API.

> **الفكرة الأساسية:** تخيّل متصفح الويب. كروم لا يحتوي على أي موقع — بل *يتصل* بالمواقع. Vexi مثله تماماً: لا يحتوي على ذكاء اصطناعي، بل يتصل به.

هناك **نوعان من «المجاني»** هنا، والخلط بينهما هو سبب معظم الالتباس في البداية:

- **أداة Vexi** ← مجانية (مفتوحة المصدر، تُثبَّت مجاناً عبر npm).
- **نموذج الذكاء الاصطناعي** ← مجاني فقط إذا كان المزوّد الذي تتصل به يقدّم باقة مجانية.

## ٢. التثبيت والتحديث

تحتاج إلى تثبيت Node.js (ويأتي معه npm). ثم ثبّت Vexi بشكل عام:

```
npm install -g vexi-cli
```

للتحديث إلى أحدث إصدار:

```
npm install -g vexi-cli@latest
```

> ⚠️ **ويندوز: قد يفشل `vexi update`.** قد يظهر لك `spawn EINVAL` عند تشغيل `vexi update`. هذا سلوك معروف في إصدارات Node.js الحديثة. الحل الموثوق هو تشغيل أمر npm مباشرةً (بالأعلى) بدلاً من `vexi update` — فهو يعمل دائماً عند كتابته في الطرفية.

تحقّق من الإصدار المثبّت في أي وقت:

```
vexi --version
```

## ٣. وصل نموذج ذكاء عبر `vexi setup`

‏`vexi setup` هو الطريقة النظيفة والمُوصى بها لإعداد الذكاء الاصطناعي. يبدأ من **رابط** نقطة النهاية، فلا تخمين — يتعرّف على المزوّد، ويجلب قائمة النماذج الحيّة، ويتيح لك الاختيار، ثم يتحقق من الاتصال بطلب حقيقي قبل الحفظ — فيفشل المفتاح الخاطئ أو الرابط الخاطئ أثناء الإعداد، لا في أول محادثة.

```
vexi setup
```

يسألك عن ثلاثة أشياء بالترتيب — **الرابط ← المفتاح ← النموذج**:

```
? Paste your endpoint URL  › https://openrouter.ai/api/v1
  Detected: OpenRouter
? Paste your API key       › sk-or-...
  Fetching available models…
? Choose a model           › deepseek/deepseek-chat-v3:free
  Verifying connection…
  ✓ Verified — got a live response
  ✓ Saved — run `vexi` to start
```

> 💡 **لماذا setup أفضل من لصق مفتاح:** يحاول التدفق عند أول تشغيل أن *يخمّن* المزوّد من بادئة المفتاح، وهي ملتبسة (`sk-` قد تكون OpenAI أو DeepSeek أو Kimi). أمّا `vexi setup` فيلغي التخمين ويعرض قائمة النماذج الحقيقية. استخدمه كلما أعددت أو بدّلت مزوّداً.

## ٤. روابط نقاط النهاية للمزوّدين

رابط نقطة النهاية **ليس صفحة تفتحها في المتصفح** — بل هو العنوان الذي تلصقه في `vexi setup`. أنت لا *ترى* هذا الرابط على موقع المزوّد؛ تحصل على **المفتاح** من الموقع، وعلى **الرابط** من الجدول أدناه (أو من توثيق المزوّد).

| المزوّد | رابط نقطة النهاية | باقة مجانية؟ |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | ✓ |
| Groq | `https://api.groq.com/openai/v1` | ✓ |
| DeepSeek | `https://api.deepseek.com/v1` | ✓ |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | ✓ |
| Cerebras | `https://api.cerebras.ai/v1` | ✓ |
| Ollama (محلي) | `http://localhost:11434/v1` | ✓ |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | ✕ |
| OpenAI | `https://api.openai.com/v1` | ✕ |
| Kimi (Moonshot) — دولي | `https://api.moonshot.ai/v1` | تجريبي |

> 💡 **أبسط طريق — مفتاح واحد لكل شيء:** بمفتاح **OpenRouter** واحد يمكنك الوصول إلى GLM وDeepSeek وKimi وClaude وGemini وغيرها — فقط غيّر النموذج. ابقَ على `https://openrouter.ai/api/v1` ونادراً ما ستحتاج إلى `vexi setup` مجدداً.

> ⚠️ **Kimi: طابِق المفتاح والمنطقة.** لدى Kimi (Moonshot) منطقتان منفصلتان. المفتاح من `platform.kimi.ai` يعمل فقط مع `api.moonshot.ai`؛ والمفتاح من `platform.moonshot.cn` يعمل فقط مع `api.moonshot.cn`. الخلط بينهما يسبّب حلقة لا تنتهي من «أعد إدخال مفتاحك».

## ٥. اختيار النماذج المجانية مقابل المدفوعة

في OpenRouter، النماذج المنتهية بـ `:free` مجانية تماماً. وما عداها يخصم من رصيدك لكل رمز.

> 💡 **القاعدة:** اختر فقط النماذج المنتهية بـ `:free`، أو استخدم الباقة المجانية لمزوّد (Groq أو Gemini أو Cerebras). عندها لن تنفق أي مال.

المقابل: النماذج المجانية أضعف. قد **تخترع ملفات غير موجودة**، أو تتنقل بين اللغات، أو تتجاهل التعليمات. إذا هلوس نموذج بمحتوى أو رفض اتّباع قواعدك، فالمشكلة في *النموذج* لا في Vexi — انتقل إلى نموذج أقوى (باقة DeepSeek المجانية خطوة جيدة؛ وGLM 5.2 خيار مدفوع منخفض التكلفة).

## ٦. `vexi` مقابل `vexi setup` — الاستخدام اليومي

‏`vexi setup` **يُعِدّ** (أي ذكاء تستخدم). و`vexi` **يستخدمه** (المحادثة والبرمجة). تُعِدّ مرة واحدة، وتشغّل مرات كثيرة. إعدادك محفوظ ودائم — *لا* تشغّل الإعداد قبل كل جلسة.

```
# once (or when switching models)
vexi setup

# every time you want to work
vexi
```

تشغيل `vexi` يبدأ المحادثة التفاعلية. يعرض سطر الحالة إعدادك الحالي بلمحة:

```
project salik · provider OpenRouter · model deepseek/deepseek-chat-v3:free · lang en
```

عند محث `>`، اكتب طلبك بلغة عادية. تشمل أوامر الجلسة `/help /model /clear /undo /redo /history /push /usage /exit`.

## ٧. تبديل المزوّد أو النموذج

| أريد أن… | افعل هذا |
|---|---|
| التبديل إلى مزوّد جديد | `vexi setup` |
| تبديل النموذج، نفس المزوّد | `/model <id>` |
| استخدام المُهيّأ فقط | `vexi` |

داخل جلسة المحادثة، بدّل النموذج فوراً دون إعادة إدخال مفتاحك:

```
/model z-ai/glm-5.2
```

> ⚠️ **ملاحظة:** يقبل `/model` أي نص دون التحقق منه مقابل القائمة الحيّة — الخطأ المطبعي لن يظهر حتى ترفض الواجهة رسالتك التالية. انسخ المعرّف بدقّة (يجب أن تتطابق لاحقة `:free` وأي بادئة `vendor/`).

## ٨. المهارات المخصّصة (قواعد المشروع)

المهارات ملفات ماركداون بسيطة داخل `.vexi/skills/` في مشروعك. تُحقَن في كل جلسة كقواعد يجب على النموذج اتّباعها — مثالية لـ«استخدم أوامر ويندوز دائماً» أو «أجب بالعربية». لاحظ أن `.vexi/skills` هو **مجلدان متداخلان**، وكل ملف مهارة يجب أن ينتهي بـ `.md`.

**إدارة المهارات:**

```
vexi skill add ./my-rules.md              # from a local file
vexi skill add https://github.com/u/repo  # from a GitHub repo
vexi skill list                           # show active skills
vexi skill remove my-rules                # remove by NAME (no .md)
```

> ⚠️ **أنشئ الملف، ولا تلصق الأوامر بداخله.** على ويندوز، الطريقة الموثوقة لإنشاء مهارة هي تشغيل أمر *يكتب الملف نيابةً عنك* — لا تفتح المفكرة وتلصق أمر الطرفية داخل الملف. كل ما بين `@'` و`'@` أدناه هو محتوى الملف؛ والباقي هو الأمر الذي يحفظه.

```powershell
New-Item -ItemType Directory -Force -Path ".vexi\skills" | Out-Null
@'
# Project Conventions
- Use Windows PowerShell commands only (no touch, ls, rm, cat, &&).
- Reply in Arabic by default.
- Explain only the real files in this project; never invent files.
'@ | Set-Content -Path ".vexi\skills\rules.md" -Encoding UTF8
```

## ٩. إضافة خوادم MCP

تمنح خوادم MCP النموذج أدوات إضافية. عميل MCP في Vexi يشغّل **أمراً محلياً** (stdio). الصيغة العامة:

```
vexi mcp add <name> <command> [args...]
vexi mcp list
vexi mcp remove <name>
```

لا يمكن إضافة خادم MCP **بعيد** (رابط، مثل Higgsfield) مباشرةً، لأن Vexi يتحدّث stdio فقط. استخدم جسر `mcp-remote` — ثبّته مرة واحدة، ثم وجّه Vexi إليه:

```
npm install -g mcp-remote
vexi mcp add higgsfield mcp-remote https://mcp.higgsfield.ai/mcp
```

> ❌ **خطأ: `unknown option '-y'`.** إذا استخدمت `npx -y`، يلتقط محلّل Vexi الرمز `-y` كخيار خاص به فيفشل. الحل: ثبّت `mcp-remote` بشكل عام (بالأعلى) لتستغني عن `npx -y` — أو ضع `--` قبله: `vexi mcp add name npx -- -y mcp-remote <url>`.

عند أول تشغيل بعد الإضافة، يفتح الجسر متصفحك لتسجيل الدخول والتفويض. ملاحظة: قيادة أدوات كثيرة بكفاءة تحتاج نموذجاً قوياً — النماذج المجانية غالباً ما تتعثّر، ونتائج الوسائط تعود كروابط في الطرفية.

## ١٠. شرح الشيفرة بلغتك

‏`vexi explain` يكتب شرحاً لملف أو مجلد. تُفتح العربية كصفحة HTML نظيفة من اليمين إلى اليسار في متصفحك:

```
vexi explain index.html --ar     # Arabic (opens RTL HTML)
vexi explain src/ --fr           # French
vexi explain app.py --es         # Spanish
```

> 💡 **العَلَم هو الأقوى — مرّره دائماً.** عَلَم اللغة (`--ar`) يتجاوز كل شيء آخر. بدونه يعود الأمر إلى لغة جلستك، وقد ينحرف نموذج ضعيف إلى لغة أخرى. ملاحظة: المهارات *لا* تتحكم في `explain` — العَلَم وحده يفعل.

## ١١. Replay — تصدير جلسة

تُسجَّل كل محادثة في `.vexi/sessions/`. `vexi replay` **لا** يعيد تشغيل أي شيء — بل يحوّل جلسة محفوظة إلى صفحة HTML متحرّكة قابلة للمشاهدة (تشغيل/إيقاف، تحكّم بالسرعة، زر «تصدير فيديو»). ممتاز للعروض.

```
vexi replay              # list recorded sessions
vexi replay --export     # export latest as animated HTML
vexi replay --export --lang ar   # right-to-left Arabic replay
```

## ١٢. داخل مجلد `.vexi`

يحصل كل مشروع على مجلد `.vexi/`. إليك ما بداخله:

| العنصر | ما هو |
|---|---|
| `sessions/` | محادثات مسجّلة — يقرؤها `vexi replay`. |
| `snapshots/` | سجل التراجع/الإعادة. ينسخ Vexi الملفات هنا قبل التعديل، فيعمل `/undo` دون git. لا تحذفه أثناء العمل. |
| `skills/` | ملفات قواعدك (`.md`) — تُحقَن في كل جلسة. |
| `project.json` | بيانات فحص المشروع والإعدادات. |

> 💡 **مجلد المهارات الفارغ أمر طبيعي.** إذا أزلت آخر مهارة لديك، يصبح مجلد `skills` فارغاً — هذا متوقّع وليس خطأً. أعِد إضافة مهارة لاستعادته.

## ١٣. حل المشكلات

- ❌ **`spawn EINVAL` عند `vexi update` (ويندوز)** — شغّل `npm install -g vexi-cli@latest` مباشرةً في الطرفية بدلاً من `vexi update`.
- ❌ **حلقة «أعد إدخال مفتاحك؟» اللانهائية** — رفض المزوّد المفتاح. السبب الأشهر: نقطة نهاية خاطئة لهذا المفتاح (مثلاً مفتاح Kimi `.ai` مع رابط `.cn`). أعد تشغيل `vexi setup` برابط يطابق منطقة مفتاحك، أو تحقّق من وجود رصيد.
- ❌ **`'touch' غير معروف` (ويندوز)** — أصدر النموذج أمر يونكس. أضِف مهارة تطلب استخدام أوامر PowerShell على ويندوز فقط. غالباً يُنشأ الملف بالأمر الثاني الصالح، فتحقّق قبل افتراض الفشل.
- ❌ **العربية تظهر كمربّعات (□□□)** — ليس خطأً؛ طرفية Windows PowerShell الكلاسيكية تفتقر إلى محارف العربية. اقرأ العربية عبر `vexi explain … --ar` (تُفتح في المتصفح وتُعرض بإتقان)، أو استخدم تطبيق Windows Terminal الحديث.
- ❌ **النموذج يخترع ملفات / يغيّر اللغة** — هذه مشكلة نموذج مجاني ضعيف، لا Vexi. انتقل إلى نموذج أقوى عبر `vexi setup` أو `/model` (مثل `deepseek/deepseek-chat-v3:free` أو المدفوع `z-ai/glm-5.2`).
- ❌ **`unknown option '-y'` عند إضافة MCP** — ثبّت `mcp-remote` بشكل عام واستغنِ عن `npx -y`، أو أدرج `--` قبل الوسائط المُمرَّرة.
- ⚠️ **احفظ مفاتيحك خاصة** — مفتاح API كلمة مرور. لا تشاركه أبداً في لقطات الشاشة أو تسجيلات الشاشة. إذا انكشف مفتاح، احذفه من لوحة تحكم المزوّد وأنشئ آخر جديداً.

---
---

<a id="français"></a>
# 🇫🇷 Français

## 1. Ce qu'est Vexi (et ce qu'il n'est pas)

Vexi est l'**agent** — l'outil qui lit vos fichiers, écrit du code et dialogue dans votre terminal. Il n'a **aucun cerveau IA propre.** Il se connecte à un modèle hébergé ailleurs (OpenRouter, Groq, DeepSeek…) via une clé API.

> **Modèle mental :** pensez à un navigateur. Chrome ne contient aucun site — il s'y *connecte*. Vexi, c'est pareil : il ne contient aucune IA, il s'y connecte.

Il y a **deux sortes de « gratuit »** ici, et les confondre est la source de la plupart des malentendus au début :

- **Vexi l'outil** → gratuit (open source, installé gratuitement via npm).
- **Le modèle d'IA** → gratuit seulement si le fournisseur choisi propose une offre gratuite.

## 2. Installer et mettre à jour

Node.js doit être installé (npm est inclus). Installez ensuite Vexi globalement :

```
npm install -g vexi-cli
```

Pour passer à la dernière version :

```
npm install -g vexi-cli@latest
```

> ⚠️ **Windows : `vexi update` peut échouer.** Vous pouvez voir `spawn EINVAL` en lançant `vexi update`. C'est un comportement connu des versions récentes de Node.js. La solution fiable : lancer la commande npm directement (ci-dessus) plutôt que `vexi update` — tapée dans le terminal, elle fonctionne toujours.

Vérifiez votre version à tout moment :

```
vexi --version
```

## 3. Connecter une IA avec `vexi setup`

`vexi setup` est la façon propre et recommandée de configurer votre IA. Elle part de l'**URL** du point d'accès : aucune devinette — elle détecte le fournisseur, récupère la liste des modèles en direct, vous laisse choisir, puis vérifie la connexion avec une vraie requête avant d'enregistrer — une mauvaise clé ou URL échoue donc dès la configuration, pas à la première conversation.

```
vexi setup
```

Elle demande trois choses, dans l'ordre — **URL → clé → modèle** :

```
? Paste your endpoint URL  › https://openrouter.ai/api/v1
  Detected: OpenRouter
? Paste your API key       › sk-or-...
  Fetching available models…
? Choose a model           › deepseek/deepseek-chat-v3:free
  Verifying connection…
  ✓ Verified — got a live response
  ✓ Saved — run `vexi` to start
```

> 💡 **Pourquoi setup vaut mieux que coller une clé :** le premier lancement tente de *deviner* le fournisseur d'après le préfixe de la clé, ce qui est ambigu (`sk-` peut être OpenAI, DeepSeek ou Kimi). `vexi setup` supprime la devinette et affiche la vraie liste de modèles. Utilisez-le pour configurer ou changer de fournisseur.

## 4. URL des fournisseurs

Une URL de point d'accès n'est **pas une page que l'on ouvre dans un navigateur** — c'est l'adresse à coller dans `vexi setup`. Vous ne la *voyez* pas sur le site du fournisseur ; vous obtenez la **clé** sur le site et l'**URL** dans le tableau ci-dessous (ou la doc du fournisseur).

| Fournisseur | URL du point d'accès | Offre gratuite ? |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | ✓ |
| Groq | `https://api.groq.com/openai/v1` | ✓ |
| DeepSeek | `https://api.deepseek.com/v1` | ✓ |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | ✓ |
| Cerebras | `https://api.cerebras.ai/v1` | ✓ |
| Ollama (local) | `http://localhost:11434/v1` | ✓ |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | ✕ |
| OpenAI | `https://api.openai.com/v1` | ✕ |
| Kimi (Moonshot) — intl | `https://api.moonshot.ai/v1` | essai |

> 💡 **Le plus simple — une clé pour tout :** avec une seule clé **OpenRouter**, vous atteignez GLM, DeepSeek, Kimi, Claude, Gemini et plus — il suffit de changer de modèle. Restez sur `https://openrouter.ai/api/v1` et vous ne toucherez presque plus à `vexi setup`.

> ⚠️ **Kimi : clé et région assorties.** Kimi (Moonshot) a deux régions distinctes. Une clé de `platform.kimi.ai` ne fonctionne qu'avec `api.moonshot.ai` ; une clé de `platform.moonshot.cn` qu'avec `api.moonshot.cn`. Les mélanger provoque une boucle sans fin « ressaisissez votre clé ».

## 5. Choisir entre modèles gratuits et payants

Sur OpenRouter, les modèles se terminant par `:free` ne coûtent rien. Tout le reste débite vos crédits par token.

> 💡 **Règle :** choisissez uniquement des modèles finissant par `:free`, ou l'offre gratuite d'un fournisseur (Groq, Gemini, Cerebras). Vous ne dépenserez jamais rien.

Le compromis : les modèles gratuits sont plus faibles. Ils peuvent **inventer des fichiers inexistants**, changer de langue ou ignorer les consignes. Si un modèle hallucine ou n'obéit pas, c'est le *modèle*, pas Vexi — passez à un modèle plus fort (l'offre gratuite de DeepSeek est un bon palier ; GLM 5.2 est une option payante peu coûteuse).

## 6. `vexi` vs `vexi setup` — usage quotidien

`vexi setup` **configure** (quelle IA utiliser). `vexi` l'**utilise** (discuter et coder). On configure une fois ; on lance souvent. La config est sauvegardée et persiste — inutile de relancer setup avant chaque session.

```
# once (or when switching models)
vexi setup

# every time you want to work
vexi
```

Lancer `vexi` démarre le chat interactif. La ligne d'état résume votre configuration :

```
project salik · provider OpenRouter · model deepseek/deepseek-chat-v3:free · lang en
```

À l'invite `>`, tapez une demande en langage naturel. Commandes de session : `/help /model /clear /undo /redo /history /push /usage /exit`.

## 7. Changer de fournisseur ou de modèle

| Je veux… | Faites |
|---|---|
| Changer de fournisseur | `vexi setup` |
| Changer de modèle, même fournisseur | `/model <id>` |
| Utiliser la config actuelle | `vexi` |

Dans une session, changez de modèle instantanément sans ressaisir la clé :

```
/model z-ai/glm-5.2
```

> ⚠️ **Note :** `/model` accepte n'importe quelle chaîne sans la vérifier — une faute ne se voit qu'au rejet du message suivant par l'API. Copiez le slug exact (le suffixe `:free` et tout préfixe `vendor/` doivent correspondre).

## 8. Skills personnalisés (règles projet)

Les skills sont de simples fichiers markdown dans `.vexi/skills/` de votre projet. À chaque session, ils sont injectés comme règles à suivre — idéal pour « toujours utiliser des commandes Windows » ou « répondre en arabe ». Notez que `.vexi/skills` est **deux dossiers imbriqués**, et chaque fichier doit finir en `.md`.

**Gérer les skills :**

```
vexi skill add ./my-rules.md              # from a local file
vexi skill add https://github.com/u/repo  # from a GitHub repo
vexi skill list                           # show active skills
vexi skill remove my-rules                # remove by NAME (no .md)
```

> ⚠️ **Créez le fichier, n'y collez pas de commandes.** Sous Windows, la méthode fiable est de lancer une commande qui *écrit le fichier pour vous* — n'ouvrez pas le Bloc-notes pour y coller la commande. Tout ce qui est entre `@'` et `'@` ci-dessous est le contenu ; le reste est la commande qui l'enregistre.

```powershell
New-Item -ItemType Directory -Force -Path ".vexi\skills" | Out-Null
@'
# Project Conventions
- Use Windows PowerShell commands only (no touch, ls, rm, cat, &&).
- Reply in Arabic by default.
- Explain only the real files in this project; never invent files.
'@ | Set-Content -Path ".vexi\skills\rules.md" -Encoding UTF8
```

## 9. Ajouter des serveurs MCP

Les serveurs MCP donnent des outils supplémentaires au modèle. Le client MCP de Vexi lance une **commande locale** (stdio). Forme générale :

```
vexi mcp add <name> <command> [args...]
vexi mcp list
vexi mcp remove <name>
```

Un serveur MCP **distant** (une URL, comme Higgsfield) ne peut pas être ajouté directement, car Vexi ne parle que stdio. Utilisez le pont `mcp-remote` — installez-le une fois, puis pointez Vexi dessus :

```
npm install -g mcp-remote
vexi mcp add higgsfield mcp-remote https://mcp.higgsfield.ai/mcp
```

> ❌ **Erreur : `unknown option '-y'`.** Avec `npx -y`, l'analyseur de Vexi prend `-y` pour sa propre option et échoue. Solution : installez `mcp-remote` globalement (ci-dessus) pour supprimer `npx -y` — ou mettez `--` avant : `vexi mcp add name npx -- -y mcp-remote <url>`.

Au premier lancement après l'ajout, le pont ouvre votre navigateur pour vous connecter et autoriser. Note : bien piloter de nombreux outils demande un modèle capable — les modèles gratuits peinent souvent, et les médias reviennent sous forme d'URL dans le terminal.

## 10. Expliquer le code dans votre langue

`vexi explain` rédige l'explication d'un fichier ou dossier. L'arabe s'ouvre en page HTML de droite à gauche dans le navigateur :

```
vexi explain index.html --ar     # Arabic (opens RTL HTML)
vexi explain src/ --fr           # French
vexi explain app.py --es         # Spanish
```

> 💡 **Le drapeau prime — passez-le toujours.** Le drapeau de langue (`--ar`) prime sur tout. Sans lui, la commande retombe sur la langue de session et un modèle faible peut dériver. Note : les skills ne contrôlent *pas* `explain` — seul le drapeau le fait.

## 11. Replay — exporter une session

Chaque discussion est enregistrée dans `.vexi/sessions/`. `vexi replay` ne **relance** rien — il transforme une session sauvegardée en page HTML animée à regarder (lecture/pause, vitesse, bouton « exporter la vidéo »). Idéal pour les démos.

```
vexi replay              # list recorded sessions
vexi replay --export     # export latest as animated HTML
vexi replay --export --lang ar   # right-to-left Arabic replay
```

## 12. Dans le dossier `.vexi`

Chaque projet possède un dossier `.vexi/`. Voici son contenu :

| Élément | Ce que c'est |
|---|---|
| `sessions/` | Discussions enregistrées — lues par `vexi replay`. |
| `snapshots/` | Historique annuler/rétablir. Vexi y copie les fichiers avant édition, pour que `/undo` marche sans git. Ne pas supprimer pendant le travail. |
| `skills/` | Vos fichiers de conventions (`.md`) — injectés à chaque session. |
| `project.json` | Données d'analyse du projet et config. |

> 💡 **Un dossier skills vide est normal.** Si vous supprimez votre dernier skill, le dossier `skills` devient vide — c'est normal, pas un bug. Rajoutez un skill pour le retrouver.

## 13. Dépannage

- ❌ **`spawn EINVAL` sur `vexi update` (Windows)** — lancez `npm install -g vexi-cli@latest` directement dans le terminal, au lieu de `vexi update`.
- ❌ **Boucle « ressaisir la clé ? »** — le fournisseur a rejeté la clé. Cause fréquente : mauvais point d'accès pour cette clé (ex. clé Kimi `.ai` avec l'URL `.cn`). Relancez `vexi setup` avec l'URL de la bonne région, ou vérifiez le crédit.
- ❌ **`'touch' non reconnu` (Windows)** — le modèle a émis une commande Unix. Ajoutez un skill imposant les commandes Windows PowerShell. Le fichier est souvent créé par la 2ᵉ commande valide, vérifiez avant de conclure à un échec.
- ❌ **L'arabe s'affiche en carrés (□□□)** — pas un bug ; la console Windows PowerShell classique n'a pas les glyphes arabes. Lisez l'arabe via `vexi explain … --ar` (s'ouvre dans le navigateur, rendu parfait), ou utilisez l'app Windows Terminal moderne.
- ❌ **Le modèle invente des fichiers / change de langue** — c'est un modèle gratuit faible, pas Vexi. Passez à un modèle plus fort via `vexi setup` ou `/model` (ex. `deepseek/deepseek-chat-v3:free` ou payant `z-ai/glm-5.2`).
- ❌ **`unknown option '-y'` à l'ajout MCP** — installez `mcp-remote` globalement et supprimez `npx -y`, ou insérez `--` avant les arguments.
- ⚠️ **Gardez vos clés privées** — une clé API est un mot de passe. Ne la partagez jamais dans des captures ou enregistrements d'écran. Si une clé est exposée, supprimez-la dans la console du fournisseur et créez-en une nouvelle.

---
---

<a id="español"></a>
# 🇪🇸 Español

## 1. Qué es Vexi (y qué no es)

Vexi es el **agente** — la herramienta que lee tus archivos, escribe código y conversa en tu terminal. **No tiene un cerebro de IA propio.** Se conecta a un modelo alojado en otro sitio (OpenRouter, Groq, DeepSeek…) con una clave API.

> **Idea clave:** piensa en un navegador. Chrome no contiene sitios web — solo se *conecta* a ellos. Vexi es igual: no contiene IA, se conecta a ella.

Aquí hay **dos tipos de «gratis»**, y confundirlos causa casi toda la confusión inicial:

- **Vexi como herramienta** → gratis (open source, se instala gratis con npm).
- **El modelo de IA** → gratis solo si el proveedor que conectas ofrece un plan gratuito.

## 2. Instalar y actualizar

Necesitas Node.js instalado (incluye npm). Luego instala Vexi de forma global:

```
npm install -g vexi-cli
```

Para actualizar a la última versión:

```
npm install -g vexi-cli@latest
```

> ⚠️ **Windows: `vexi update` puede fallar.** Puede aparecer `spawn EINVAL` al ejecutar `vexi update`. Es un comportamiento conocido de versiones recientes de Node.js. La solución fiable es ejecutar el comando npm directamente (arriba) en lugar de `vexi update` — escrito en la terminal, siempre funciona.

Comprueba tu versión instalada en cualquier momento:

```
vexi --version
```

## 3. Conectar una IA con `vexi setup`

`vexi setup` es la forma limpia y recomendada de configurar tu IA. Parte de la **URL** del endpoint: sin adivinar — detecta el proveedor, obtiene la lista de modelos en vivo, te deja elegir y verifica la conexión con una petición real antes de guardar — así una clave o URL incorrecta falla en el setup, no en tu primer chat.

```
vexi setup
```

Pide tres cosas, en orden — **URL → clave → modelo**:

```
? Paste your endpoint URL  › https://openrouter.ai/api/v1
  Detected: OpenRouter
? Paste your API key       › sk-or-...
  Fetching available models…
? Choose a model           › deepseek/deepseek-chat-v3:free
  Verifying connection…
  ✓ Verified — got a live response
  ✓ Saved — run `vexi` to start
```

> 💡 **Por qué setup es mejor que pegar una clave:** el primer arranque intenta *adivinar* el proveedor por el prefijo de la clave, que es ambiguo (`sk-` puede ser OpenAI, DeepSeek o Kimi). `vexi setup` elimina la adivinanza y muestra la lista real de modelos. Úsalo siempre que configures o cambies de proveedor.

## 4. URLs de los proveedores

Una URL de endpoint **no es una página que abras en el navegador** — es la dirección que pegas en `vexi setup`. Nunca la *ves* en la web del proveedor; obtienes la **clave** en la web y la **URL** en la tabla de abajo (o en la documentación del proveedor).

| Proveedor | URL del endpoint | ¿Plan gratis? |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | ✓ |
| Groq | `https://api.groq.com/openai/v1` | ✓ |
| DeepSeek | `https://api.deepseek.com/v1` | ✓ |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | ✓ |
| Cerebras | `https://api.cerebras.ai/v1` | ✓ |
| Ollama (local) | `http://localhost:11434/v1` | ✓ |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | ✕ |
| OpenAI | `https://api.openai.com/v1` | ✕ |
| Kimi (Moonshot) — intl | `https://api.moonshot.ai/v1` | prueba |

> 💡 **Lo más simple — una clave para todo:** con una sola clave de **OpenRouter** llegas a GLM, DeepSeek, Kimi, Claude, Gemini y más — solo cambia el modelo. Quédate en `https://openrouter.ai/api/v1` y casi nunca volverás a usar `vexi setup`.

> ⚠️ **Kimi: clave y región coincidentes.** Kimi (Moonshot) tiene dos regiones distintas. Una clave de `platform.kimi.ai` solo funciona con `api.moonshot.ai`; una de `platform.moonshot.cn` solo con `api.moonshot.cn`. Mezclarlas provoca un bucle infinito de «vuelve a introducir tu clave».

## 5. Elegir modelos gratis o de pago

En OpenRouter, los modelos que terminan en `:free` no cuestan nada. El resto cobra de tus créditos por token.

> 💡 **Regla:** elige solo modelos que terminen en `:free`, o usa el plan gratuito de un proveedor (Groq, Gemini, Cerebras). Así nunca gastas dinero.

La contrapartida: los modelos gratis son más flojos. Pueden **inventar archivos inexistentes**, cambiar de idioma o ignorar instrucciones. Si un modelo alucina o no obedece, es el *modelo*, no Vexi — cambia a uno más potente (el plan gratis de DeepSeek es un buen salto; GLM 5.2 es una opción de pago barata).

## 6. `vexi` vs `vexi setup` — uso diario

`vexi setup` **configura** (qué IA usar). `vexi` lo **usa** (chatear y programar). Configuras una vez; ejecutas muchas. Tu configuración se guarda y persiste — *no* ejecutas setup antes de cada sesión.

```
# once (or when switching models)
vexi setup

# every time you want to work
vexi
```

Ejecutar `vexi` inicia el chat interactivo. La línea de estado muestra tu configuración de un vistazo:

```
project salik · provider OpenRouter · model deepseek/deepseek-chat-v3:free · lang en
```

En el prompt `>`, escribe tu petición en lenguaje natural. Comandos de la sesión: `/help /model /clear /undo /redo /history /push /usage /exit`.

## 7. Cambiar de proveedor o modelo

| Quiero… | Haz esto |
|---|---|
| Cambiar de proveedor | `vexi setup` |
| Cambiar modelo, mismo proveedor | `/model <id>` |
| Usar lo configurado | `vexi` |

Dentro de una sesión, cambia el modelo al instante sin volver a introducir la clave:

```
/model z-ai/glm-5.2
```

> ⚠️ **Nota:** `/model` acepta cualquier texto sin verificarlo contra la lista — un error no se nota hasta que la API rechaza tu siguiente mensaje. Copia el identificador exacto (el sufijo `:free` y cualquier prefijo `vendor/` deben coincidir).

## 8. Skills personalizados (reglas del proyecto)

Los skills son archivos markdown en `.vexi/skills/` dentro de tu proyecto. En cada sesión se inyectan como reglas que el modelo debe seguir — ideal para «usa siempre comandos de Windows» o «responde en árabe». Ojo: `.vexi/skills` son **dos carpetas anidadas**, y cada archivo debe terminar en `.md`.

**Gestionar skills:**

```
vexi skill add ./my-rules.md              # from a local file
vexi skill add https://github.com/u/repo  # from a GitHub repo
vexi skill list                           # show active skills
vexi skill remove my-rules                # remove by NAME (no .md)
```

> ⚠️ **Crea el archivo, no pegues comandos dentro.** En Windows, la forma fiable es ejecutar un comando que *escriba el archivo por ti* — no abras el Bloc de notas para pegar el comando dentro. Todo lo que está entre `@'` y `'@` es el contenido; el resto es el comando que lo guarda.

```powershell
New-Item -ItemType Directory -Force -Path ".vexi\skills" | Out-Null
@'
# Project Conventions
- Use Windows PowerShell commands only (no touch, ls, rm, cat, &&).
- Reply in Arabic by default.
- Explain only the real files in this project; never invent files.
'@ | Set-Content -Path ".vexi\skills\rules.md" -Encoding UTF8
```

## 9. Añadir servidores MCP

Los servidores MCP dan herramientas extra al modelo. El cliente MCP de Vexi ejecuta un **comando local** (stdio). Forma general:

```
vexi mcp add <name> <command> [args...]
vexi mcp list
vexi mcp remove <name>
```

Un servidor MCP **remoto** (una URL, como Higgsfield) no se puede añadir directamente, porque Vexi solo habla stdio. Usa el puente `mcp-remote` — instálalo una vez y apunta Vexi a él:

```
npm install -g mcp-remote
vexi mcp add higgsfield mcp-remote https://mcp.higgsfield.ai/mcp
```

> ❌ **Error: `unknown option '-y'`.** Si usas `npx -y`, el analizador de Vexi toma `-y` como opción propia y falla. Solución: instala `mcp-remote` globalmente (arriba) para quitar `npx -y` — o pon `--` antes: `vexi mcp add name npx -- -y mcp-remote <url>`.

En el primer arranque tras añadirlo, el puente abre el navegador para iniciar sesión y autorizar. Nota: manejar bien muchas herramientas requiere un modelo capaz — los gratis suelen fallar, y los resultados multimedia vuelven como URLs en la terminal.

## 10. Explicar código en tu idioma

`vexi explain` escribe la explicación de un archivo o carpeta. El árabe se abre como página HTML de derecha a izquierda en el navegador:

```
vexi explain index.html --ar     # Arabic (opens RTL HTML)
vexi explain src/ --fr           # French
vexi explain app.py --es         # Spanish
```

> 💡 **La bandera manda — pásala siempre.** La bandera de idioma (`--ar`) tiene prioridad sobre todo. Sin ella, el comando usa el idioma de la sesión y un modelo flojo puede desviarse. Nota: los skills *no* controlan `explain` — solo la bandera.

## 11. Replay — exportar una sesión

Cada chat se graba en `.vexi/sessions/`. `vexi replay` **no** vuelve a ejecutar nada — convierte una sesión guardada en una página HTML animada para ver (reproducir/pausar, velocidad, botón «exportar vídeo»). Ideal para demos.

```
vexi replay              # list recorded sessions
vexi replay --export     # export latest as animated HTML
vexi replay --export --lang ar   # right-to-left Arabic replay
```

## 12. Dentro de la carpeta `.vexi`

Cada proyecto tiene una carpeta `.vexi/`. Esto es lo que contiene:

| Elemento | Qué es |
|---|---|
| `sessions/` | Chats grabados — los lee `vexi replay`. |
| `snapshots/` | Historial de deshacer/rehacer. Vexi copia archivos aquí antes de editar, así `/undo` funciona sin git. No borrar mientras trabajas. |
| `skills/` | Tus archivos de convenciones (`.md`) — inyectados en cada sesión. |
| `project.json` | Datos del análisis del proyecto y configuración. |

> 💡 **Una carpeta skills vacía es normal.** Si quitas tu último skill, la carpeta `skills` queda vacía — es esperado, no un error. Añade un skill de nuevo para recuperarla.

## 13. Solución de problemas

- ❌ **`spawn EINVAL` en `vexi update` (Windows)** — ejecuta `npm install -g vexi-cli@latest` directamente en la terminal en vez de `vexi update`.
- ❌ **Bucle «¿reintroducir tu clave?»** — el proveedor rechazó la clave. Causa común: endpoint incorrecto para esa clave (p. ej. clave Kimi `.ai` con la URL `.cn`). Vuelve a ejecutar `vexi setup` con la URL de la región correcta, o revisa el saldo.
- ❌ **`'touch' no se reconoce` (Windows)** — el modelo emitió un comando Unix. Añade un skill que exija solo comandos de Windows PowerShell. El archivo suele crearse con el segundo comando válido; comprueba antes de darlo por fallido.
- ❌ **El árabe aparece como cuadros (□□□)** — no es un error; la consola clásica de Windows PowerShell no tiene glifos árabes. Lee el árabe con `vexi explain … --ar` (se abre en el navegador y se ve perfecto), o usa la app moderna Windows Terminal.
- ❌ **El modelo inventa archivos / cambia de idioma** — es un modelo gratis flojo, no Vexi. Cambia a uno más potente con `vexi setup` o `/model` (p. ej. `deepseek/deepseek-chat-v3:free` o de pago `z-ai/glm-5.2`).
- ❌ **`unknown option '-y'` al añadir MCP** — instala `mcp-remote` globalmente y quita `npx -y`, o inserta `--` antes de los argumentos.
- ⚠️ **Mantén tus claves privadas** — una clave API es una contraseña. Nunca la compartas en capturas ni grabaciones de pantalla. Si se expone una clave, elimínala en la consola del proveedor y crea una nueva.

---
---

<a id="português"></a>
# 🇵🇹 Português

## 1. O que é o Vexi (e o que não é)

Vexi é o **agente** — a ferramenta que lê seus arquivos, escreve código e conversa no seu terminal. Ele **não tem um cérebro de IA próprio.** Conecta-se a um modelo hospedado em outro lugar (OpenRouter, Groq, DeepSeek…) usando uma chave de API.

> **Ideia central:** pense num navegador. O Chrome não contém sites — ele só se *conecta* a eles. O Vexi é igual: não contém IA, ele se conecta a uma.

Existem **dois tipos de "grátis"** aqui, e confundi-los causa quase toda a confusão inicial:

- **O Vexi como ferramenta** → grátis (open source, instalado de graça via npm).
- **O modelo de IA** → grátis somente se o provedor que você conectar oferecer um plano gratuito.

## 2. Instalar e atualizar

Você precisa do Node.js instalado (que inclui o npm). Depois instale o Vexi globalmente:

```
npm install -g vexi-cli
```

Para atualizar para a versão mais recente:

```
npm install -g vexi-cli@latest
```

> ⚠️ **Windows: `vexi update` pode falhar.** Pode aparecer `spawn EINVAL` ao rodar `vexi update`. É um comportamento conhecido em versões recentes do Node.js. A solução confiável é rodar o comando npm diretamente (acima) em vez de `vexi update` — digitado no terminal, sempre funciona.

Verifique sua versão instalada a qualquer momento:

```
vexi --version
```

## 3. Conectar uma IA com `vexi setup`

`vexi setup` é a maneira limpa e recomendada de configurar sua IA. Ela parte da **URL** do endpoint: sem adivinhação — detecta o provedor, busca a lista de modelos ao vivo, deixa você escolher e verifica a conexão com uma requisição real antes de salvar — assim uma chave ou URL errada falha no setup, não no seu primeiro chat.

```
vexi setup
```

Ela pede três coisas, em ordem — **URL → chave → modelo**:

```
? Paste your endpoint URL  › https://openrouter.ai/api/v1
  Detected: OpenRouter
? Paste your API key       › sk-or-...
  Fetching available models…
? Choose a model           › deepseek/deepseek-chat-v3:free
  Verifying connection…
  ✓ Verified — got a live response
  ✓ Saved — run `vexi` to start
```

> 💡 **Por que setup é melhor que colar uma chave:** o primeiro início tenta *adivinhar* o provedor pelo prefixo da chave, que é ambíguo (`sk-` pode ser OpenAI, DeepSeek ou Kimi). O `vexi setup` elimina a adivinhação e mostra a lista real de modelos. Use-o sempre que configurar ou trocar de provedor.

## 4. URLs dos provedores

Uma URL de endpoint **não é uma página que você abre no navegador** — é o endereço que você cola no `vexi setup`. Você nunca a *vê* no site do provedor; você pega a **chave** no site e a **URL** na tabela abaixo (ou na documentação do provedor).

| Provedor | URL do endpoint | Plano grátis? |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | ✓ |
| Groq | `https://api.groq.com/openai/v1` | ✓ |
| DeepSeek | `https://api.deepseek.com/v1` | ✓ |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | ✓ |
| Cerebras | `https://api.cerebras.ai/v1` | ✓ |
| Ollama (local) | `http://localhost:11434/v1` | ✓ |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | ✕ |
| OpenAI | `https://api.openai.com/v1` | ✕ |
| Kimi (Moonshot) — intl | `https://api.moonshot.ai/v1` | teste |

> 💡 **O mais simples — uma chave para tudo:** com uma única chave da **OpenRouter** você alcança GLM, DeepSeek, Kimi, Claude, Gemini e mais — basta trocar o modelo. Fique em `https://openrouter.ai/api/v1` e raramente voltará a usar o `vexi setup`.

> ⚠️ **Kimi: chave e região correspondentes.** Kimi (Moonshot) tem duas regiões distintas. Uma chave de `platform.kimi.ai` só funciona com `api.moonshot.ai`; uma de `platform.moonshot.cn` só com `api.moonshot.cn`. Misturá-las causa um loop infinito de "insira sua chave novamente".

## 5. Escolher modelos grátis ou pagos

Na OpenRouter, modelos terminados em `:free` não custam nada. O resto cobra dos seus créditos por token.

> 💡 **Regra:** escolha apenas modelos terminados em `:free`, ou use o plano gratuito de um provedor (Groq, Gemini, Cerebras). Assim você nunca gasta dinheiro.

O custo: modelos grátis são mais fracos. Podem **inventar arquivos que não existem**, trocar de idioma ou ignorar instruções. Se um modelo alucina ou não obedece, o problema é o *modelo*, não o Vexi — troque por um mais forte (o plano grátis do DeepSeek é um bom passo; o GLM 5.2 é uma opção paga barata).

## 6. `vexi` vs `vexi setup` — uso diário

`vexi setup` **configura** (qual IA usar). `vexi` o **usa** (conversar e programar). Você configura uma vez; roda muitas. A configuração é salva e persiste — você *não* roda setup antes de cada sessão.

```
# once (or when switching models)
vexi setup

# every time you want to work
vexi
```

Rodar `vexi` inicia o chat interativo. A linha de status mostra sua configuração num relance:

```
project salik · provider OpenRouter · model deepseek/deepseek-chat-v3:free · lang en
```

No prompt `>`, digite seu pedido em linguagem natural. Comandos da sessão: `/help /model /clear /undo /redo /history /push /usage /exit`.

## 7. Trocar de provedor ou modelo

| Eu quero… | Faça isto |
|---|---|
| Trocar de provedor | `vexi setup` |
| Trocar modelo, mesmo provedor | `/model <id>` |
| Usar o que está configurado | `vexi` |

Dentro de uma sessão, troque o modelo na hora sem reinserir a chave:

```
/model z-ai/glm-5.2
```

> ⚠️ **Nota:** `/model` aceita qualquer texto sem verificar na lista — um erro de digitação só aparece quando a API rejeita sua próxima mensagem. Copie o identificador exato (o sufixo `:free` e qualquer prefixo `vendor/` devem bater).

## 8. Skills personalizados (regras do projeto)

Skills são arquivos markdown em `.vexi/skills/` dentro do seu projeto. Em cada sessão são injetados como regras que o modelo deve seguir — ótimos para "sempre usar comandos do Windows" ou "responder em árabe". Note que `.vexi/skills` são **duas pastas aninhadas**, e cada arquivo deve terminar em `.md`.

**Gerenciar skills:**

```
vexi skill add ./my-rules.md              # from a local file
vexi skill add https://github.com/u/repo  # from a GitHub repo
vexi skill list                           # show active skills
vexi skill remove my-rules                # remove by NAME (no .md)
```

> ⚠️ **Crie o arquivo, não cole comandos nele.** No Windows, a forma confiável é rodar um comando que *escreve o arquivo para você* — não abra o Bloco de Notas para colar o comando dentro. Tudo entre `@'` e `'@` é o conteúdo; o resto é o comando que salva.

```powershell
New-Item -ItemType Directory -Force -Path ".vexi\skills" | Out-Null
@'
# Project Conventions
- Use Windows PowerShell commands only (no touch, ls, rm, cat, &&).
- Reply in Arabic by default.
- Explain only the real files in this project; never invent files.
'@ | Set-Content -Path ".vexi\skills\rules.md" -Encoding UTF8
```

## 9. Adicionar servidores MCP

Servidores MCP dão ferramentas extras ao modelo. O cliente MCP do Vexi roda um **comando local** (stdio). Forma geral:

```
vexi mcp add <name> <command> [args...]
vexi mcp list
vexi mcp remove <name>
```

Um servidor MCP **remoto** (uma URL, como o Higgsfield) não pode ser adicionado diretamente, porque o Vexi só fala stdio. Use a ponte `mcp-remote` — instale-a uma vez e aponte o Vexi para ela:

```
npm install -g mcp-remote
vexi mcp add higgsfield mcp-remote https://mcp.higgsfield.ai/mcp
```

> ❌ **Erro: `unknown option '-y'`.** Se você usar `npx -y`, o parser do Vexi captura o `-y` como opção própria e falha. Solução: instale o `mcp-remote` globalmente (acima) para remover o `npx -y` — ou coloque `--` antes: `vexi mcp add name npx -- -y mcp-remote <url>`.

No primeiro início após adicionar, a ponte abre seu navegador para login e autorização. Nota: conduzir bem muitas ferramentas exige um modelo capaz — os grátis costumam falhar, e resultados de mídia voltam como URLs no terminal.

## 10. Explicar código no seu idioma

`vexi explain` escreve a explicação de um arquivo ou pasta. O árabe abre como página HTML da direita para a esquerda no navegador:

```
vexi explain index.html --ar     # Arabic (opens RTL HTML)
vexi explain src/ --fr           # French
vexi explain app.py --es         # Spanish
```

> 💡 **A flag vence — sempre a passe.** A flag de idioma (`--ar`) tem prioridade sobre tudo. Sem ela, o comando usa o idioma da sessão e um modelo fraco pode desviar. Nota: skills *não* controlam o `explain` — só a flag controla.

## 11. Replay — exportar uma sessão

Cada chat é gravado em `.vexi/sessions/`. `vexi replay` **não** executa nada de novo — transforma uma sessão salva em uma página HTML animada para assistir (reproduzir/pausar, velocidade, botão "exportar vídeo"). Ótimo para demos.

```
vexi replay              # list recorded sessions
vexi replay --export     # export latest as animated HTML
vexi replay --export --lang ar   # right-to-left Arabic replay
```

## 12. Dentro da pasta `.vexi`

Cada projeto tem uma pasta `.vexi/`. Veja o que há nela:

| Item | O que é |
|---|---|
| `sessions/` | Chats gravados — lidos pelo `vexi replay`. |
| `snapshots/` | Histórico de desfazer/refazer. O Vexi copia arquivos aqui antes de editar, então `/undo` funciona sem git. Não apague enquanto trabalha. |
| `skills/` | Seus arquivos de convenções (`.md`) — injetados em cada sessão. |
| `project.json` | Dados da varredura do projeto e configuração. |

> 💡 **Uma pasta skills vazia é normal.** Se você remover seu último skill, a pasta `skills` fica vazia — isso é esperado, não um bug. Adicione um skill de novo para recuperá-la.

## 13. Solução de problemas

- ❌ **`spawn EINVAL` no `vexi update` (Windows)** — rode `npm install -g vexi-cli@latest` diretamente no terminal em vez de `vexi update`.
- ❌ **Loop "inserir a chave novamente?"** — o provedor rejeitou a chave. Causa comum: endpoint errado para essa chave (ex.: chave Kimi `.ai` com a URL `.cn`). Rode `vexi setup` de novo com a URL da região certa, ou verifique o saldo.
- ❌ **`'touch' não reconhecido` (Windows)** — o modelo emitiu um comando Unix. Adicione um skill exigindo apenas comandos do Windows PowerShell. O arquivo costuma ser criado pelo segundo comando válido; verifique antes de supor falha.
- ❌ **O árabe aparece como quadrados (□□□)** — não é bug; o console clássico do Windows PowerShell não tem glifos árabes. Leia o árabe via `vexi explain … --ar` (abre no navegador e renderiza perfeitamente), ou use o app moderno Windows Terminal.
- ❌ **O modelo inventa arquivos / muda de idioma** — é um modelo grátis fraco, não o Vexi. Troque por um mais forte com `vexi setup` ou `/model` (ex.: `deepseek/deepseek-chat-v3:free` ou pago `z-ai/glm-5.2`).
- ❌ **`unknown option '-y'` ao adicionar MCP** — instale o `mcp-remote` globalmente e remova o `npx -y`, ou insira `--` antes dos argumentos.
- ⚠️ **Mantenha suas chaves privadas** — uma chave de API é uma senha. Nunca a compartilhe em capturas ou gravações de tela. Se uma chave for exposta, apague-a no painel do provedor e crie uma nova.

---

*Vexi documentation — built from real first-run experience. https://vexi.pro*
