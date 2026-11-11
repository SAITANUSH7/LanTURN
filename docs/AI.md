# AI layer

LanTURN is **rules-first**: every AI feature has a deterministic fallback, so the site works with no API keys.
When one or more providers are configured, they are tried in order; if all fail, the rules engine answers and the
response says `source: "rules"` (the UI shows a "Rules engine" badge versus an AI badge).

## Providers

All except Anthropic use the OpenAI-style `POST {baseUrl}/chat/completions`. Set a key to enable a provider.

| Name (`AI_PROVIDER`) | Key env | Default base URL | Default model |
|---|---|---|---|
| `deepseek` | `DEEPSEEK_API_KEY` | `https://api.deepseek.com` | `deepseek-flash` |
| `kimi` | `MOONSHOT_API_KEY` | `https://api.moonshot.ai/v1` | `kimi-k2-turbo-preview` |
| `nvidia` | `NVIDIA_API_KEY` | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` |
| `opencode` | `OPENCODE_API_KEY` | `https://opencode.ai/zen/v1` | `deepseek-v4-flash-free` |
| `gemini` | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| `groq` | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| `openrouter` | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` | `openrouter/auto` |
| `openai` | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `anthropic` | `ANTHROPIC_API_KEY` | `https://api.anthropic.com/v1` | `claude-haiku-4-5` |
| `custom` | `LLM_API_KEY` (optional) + `LLM_BASE_URL` | any OpenAI-compatible server (Ollama, LM Studio, vLLM) | `LLM_MODEL` |

A comma-separated list (`NVIDIA_MODEL=a,b,c`) tries each model in turn on that provider.

Model names change often. Override any provider with `<NAME>_MODEL` and `<NAME>_BASE_URL`
(for example `DEEPSEEK_MODEL=...`, `NVIDIA_MODEL=...`). Defaults for DeepSeek, Kimi, NVIDIA and OpenCode were taken from
their docs when this was written; Gemini, Groq, OpenRouter and OpenAI defaults are from general knowledge, so verify them.

`AI_PROVIDER=auto` (default) uses every configured provider in `AI_PRIORITY` order. Failures (HTTP errors, timeouts,
output that fails validation twice) move on to the next provider, then to the rules engine.

Security: keys stay on the server; the browser never calls a provider (CSP `connect-src 'self'`). Untrusted text
(resumes, chat, applicant data) is wrapped in `<data>` tags with an instruction to ignore embedded commands, and every
JSON reply is validated with zod. Each user has a daily quota (`AI_DAILY_QUOTA`).

## Features and endpoints

| Feature | Endpoint(s) | Fallback without AI |
|---|---|---|
| Career DNA radar (student) | `GET/POST /api/career/dna` | Dimensions from skill categories + resume score |
| Skill Arena (3 open questions, medals) | `POST /api/arena/tests`, `POST /api/arena/tests/:id/submit`, `GET /api/arena/medals` | Template questions; grading never awards above "basic" |
| Cover letter | `POST /api/jobs/:id/cover-letter` | Template from matched/missing skills |
| Interview prep | `POST /api/jobs/:id/interview-prep` | Questions from required skills |
| Career coach chat (threads) | `GET /api/chat/threads`, `GET/DELETE /api/chat/threads/:id`, `POST /api/chat/messages` | Short guidance from skill gaps / resume score |
| Employer hiring assistant | same chat endpoints, employer role | Top candidates by match score. Contact details are never sent to the model |
| Job description writer | `POST /api/employer/ai/job-description` | Template |
| Company DNA | `GET/POST /api/employer/ai/company-dna` | Dimensions from job requirements |
| Notifications | `GET /api/notifications`, `/unread-count`, `POST /read-all`, `/:id/read` | n/a (in-app only) |

Medal rule: all 3 answers judged correct awards the tier medal (advanced = gold, intermediate = silver, beginner = bronze);
anything else is "basic".

## Notifications

In-app only. Created on: new application (employer), status change (student), job closed (applicants).
Email delivery is not implemented; add a mailer inside `src/notify.js` if needed.

## Where the Android generator scripts went

The teammate repo's ~60 `.py` scripts generate Kotlin/Compose files for an Android app. They do not drive any
backend, so they are not copied. Their screens map to web pages here: student home and badge, Career AI chat
(`/student/coach`), notifications (`/notifications`), employer dashboard, jobs, applicants and AI (`/employer/*`).
