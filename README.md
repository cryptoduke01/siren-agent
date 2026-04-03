# SirenAgent

SirenAgent is a decentralized DeFi intelligence agent built with ElizaOS and prepared for deployment on Nosana.

It watches Solana activity, compares prediction-market pricing across Kalshi and Polymarket, synthesizes the signal into a short market brief, and can broadcast updates to Twitter/X and Telegram.

## What It Does

- Monitors whale-sized Solana flows with Helius and RPC data
- Normalizes crypto market odds from Kalshi and Polymarket
- Flags divergence between matching market narratives
- Generates a concise intelligence report with a conviction label
- Formats short social posts and longer Telegram-ready summaries

## Stack

- ElizaOS 1.7.x runtime
- Local workspace plugin: `plugin-siren-agent`
- Nosana-hosted OpenAI-compatible inference endpoint
- Qwen chat model for synthesis and agent replies
- Qwen embedding endpoint for Eliza memory
- Docker + Nosana job definition for deployment

## Repo Layout

```text
.
├── characters/agent.character.json
├── plugin-siren-agent/
│   ├── src/actions/
│   ├── src/providers/
│   ├── src/lib/
│   └── src/plugin.ts
├── nos_job_def/nosana_eliza_job_definition.json
├── scripts/run-siren-report.mjs
├── Dockerfile
└── .env.example
```

## Local Setup

### 1. Install

```bash
pnpm install
```

### 2. Configure env

```bash
cp .env.example .env
```

Important variables:

```env
OPENAI_API_KEY=nosana
OPENAI_BASE_URL=https://.../v1
OPENAI_LARGE_MODEL=Qwen3.5-27B-AWQ-4bit
OPENAI_SMALL_MODEL=Qwen3.5-27B-AWQ-4bit
OPENAI_EMBEDDING_URL=https://.../v1
OPENAI_EMBEDDING_API_KEY=nosana
OPENAI_EMBEDDING_MODEL=Qwen3-Embedding-0.6B
OPENAI_EMBEDDING_DIMENSIONS=1024
MODEL_NAME=Qwen3.5-27B-AWQ-4bit
SIREN_USE_MOCK_DATA=true
SIREN_DRY_RUN_BROADCAST=true
SIREN_AUTORUN=false
```

`SIREN_USE_MOCK_DATA=true` is the fastest way to verify the full pipeline before wiring live APIs.

### 3. Start the agent

```bash
pnpm dev
```

The local Eliza client runs at `http://localhost:3000`.

## Smoke Test

Generate a Siren report without opening the UI:

```bash
pnpm siren:report
```

Generate and broadcast using configured Telegram/Twitter credentials:

```bash
pnpm siren:report -- --broadcast
```

## Verified Local Flow

This repo has been verified locally for:

- plugin build with `pnpm build:plugin`
- TypeScript check with `tsc --noEmit`
- Eliza server boot on port `3000`
- session-based HTTP messaging through `/api/messaging/sessions/:id/messages`
- direct Siren report generation in mock mode

Note:

- The Nosana endpoint worked reliably through raw `chat/completions`
- The stock `@elizaos/plugin-openai` path used the OpenAI Responses API, which was incompatible with this endpoint for chat replies
- `plugin-siren-agent` now overrides `TEXT_SMALL` and `TEXT_LARGE` with direct chat-completions calls while leaving embeddings to the OpenAI plugin

## Deployment

1. Build and publish your image:

```bash
docker build -t your-dockerhub-user/siren-agent:latest .
docker push your-dockerhub-user/siren-agent:latest
```

2. Update the image field in `nos_job_def/nosana_eliza_job_definition.json`

3. Fill production env values:

- `HELIUS_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TWITTER_API_KEY`
- `TWITTER_API_SECRET`
- `TWITTER_ACCESS_TOKEN`
- `TWITTER_ACCESS_SECRET`
- set `SIREN_USE_MOCK_DATA=false`
- set `SIREN_AUTORUN=true`

## Submission Notes

SirenAgent is intentionally narrow instead of generic:

- one clear use case
- continuous autonomous operation on Nosana
- market divergence as the core signal
- immediate utility through public update channels

That focus is the main product bet for the Nosana x ElizaOS challenge.
