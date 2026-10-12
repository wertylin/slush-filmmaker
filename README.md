# Slush Filmmaker

**A browser-native film studio where founders turn one idea (or one photo) into a watchable film, co-editing with an AI agent on the same timeline.**

No desktop app. No render farm. No separate agent sandbox. Everything runs in the browser — the founder and the AI share one visible studio, one timeline, one source of truth.

---

## Why browser-native

Slush Filmmaker is built as a **fully browser-based** studio:

- **Same surface** — the human edits what they see; the agent acts on that same UI, not a hidden backend copy
- **Client-side export** — scene stills + captions become a downloadable WebM in the browser
- **BYOK** — OpenAI and fal.ai keys live in the founder’s browser (`localStorage`); usage stays theirs
- **Zero install** — open the URL, paste keys in Connections, start a film

---

## WebMCP — the agent surface

[WebMCP](https://github.com/webmachinelearning/webmcp) is the core integration layer. Sophie (and any compatible browser agent) doesn’t guess UI state — she calls **registered tools** that map 1:1 to studio actions.

```
Founder ↔ Visible Studio UI ↔ WebMCP tools ↔ Sophie / external agent
                ↑
         one timeline, one project
```

### Design principles

1. **Single source of truth** — UI clicks and WebMCP tools hit the same actions/store
2. **Propose → review → apply** — storyboard changes go through a visible proposal flow before mutating the timeline
3. **Discoverable tools** — agents read `get_studio_state` / `get_timeline` before advising; no invented scene IDs
4. **Human in the loop** — paid generation and proposal apply stay explicit

### Tool surface (selected)

| Area | Tools |
|------|--------|
| Entry | `list_templates`, `preview_template`, `open_studio`, `start_film_creation` |
| State | `get_studio_state`, `get_timeline`, `open_studio_tab`, `select_scene` |
| Story | `analyze_website`, `propose_storyboard`, `review_proposal`, `apply_proposal` |
| Edit | `propose_timeline_edits`, `new_project` |
| Media | `list_fal_models`, `generate_scene_image` |

See [`WEBMCP-AGENT-REQUESTS.md`](./WEBMCP-AGENT-REQUESTS.md) for agent-facing notes and [`prompts/sophie.md`](./prompts/sophie.md) for Sophie’s tool discipline.

---

## Flow

1. Open **Studio** → paste OpenAI (+ fal.ai) keys in **Connections**
2. Chat Sophie: analyze a site / idea, propose a storyboard, land in **Editor**
3. Co-edit the timeline — founder and agent on the same scenes
4. Generate stills (fal BYOK) → **Export** → WebM download

---

## Setup

```bash
npm i
npm run dev
```

→ [http://localhost:3000](http://localhost:3000)

Optional server `.env` (see `.env.example`). Image gen and agent chat use founder BYOK in **Connections**; server keys are optional.

```
OPENAI_API_KEY=
FAL_AI_KEY=
DATABASE_URL=          # Neon — projects / prompts persistence
DATABASE_URL_UNPOOLED=
```

---

## Stack

**Next.js · React · WebMCP · BYOK OpenAI + fal.ai · Neon (optional persistence)**

Built for agents that can see the page — and for founders who never leave the browser.
