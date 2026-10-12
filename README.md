# Slush Filmmaker

Browser-native founder film studio. Bring a website or idea, shape a storyboard with Sophie (AI partner), edit scenes in the studio.

## Setup

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Studio**.

Optional `.env` (server keys only — image gen / agent tools use founder BYOK in **Connections**):

```
OPENAI_API_KEY=
FAL_AI_KEY=
```

## Studio

1. Paste OpenAI key in **Connections** → Sophie + website/storyboard tools unlock
2. Paste fal.ai key → scene still generation
3. Chat Sophie: analyze site, propose storyboard, edit timeline, start a new project (lands in **Editor**)
4. **Export** in Editor → downloads a WebM of scene stills + captions

## Stack

Next.js · React · WebMCP tools in the visible UI · BYOK OpenAI + fal.ai
