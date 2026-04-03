import type { Plugin } from "./lib/elizaTypes.js";
import { fetchSignalsAction } from "./actions/fetchSignals.js";
import { fetchWhaleActivityAction } from "./actions/fetchWhaleActivity.js";
import { postUpdateAction } from "./actions/postUpdate.js";
import { synthesizeIntelligenceAction } from "./actions/synthesizeIntelligence.js";
import { loadConfig } from "./lib/config.js";
import { fetchJson } from "./lib/http.js";
import { runBroadcastCycle } from "./lib/orchestrator.js";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let startupTriggered = false;

type TextModelParams = {
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  onStreamChunk?: (chunk: string) => void | Promise<void>;
};

function getTextModelName(runtime: Parameters<NonNullable<Plugin["init"]>>[1], size: "small" | "large") {
  const preferredKey = size === "large" ? "OPENAI_LARGE_MODEL" : "OPENAI_SMALL_MODEL";
  return (
    runtime?.getSetting?.(preferredKey) ??
    runtime?.getSetting?.("MODEL_NAME") ??
    process.env[preferredKey] ??
    process.env.MODEL_NAME ??
    "Qwen3.5-27B-AWQ-4bit"
  );
}

async function generateChatText(
  runtime: Parameters<NonNullable<Plugin["init"]>>[1],
  size: "small" | "large",
  rawParams: Record<string, unknown>
): Promise<string> {
  const params = rawParams as TextModelParams;
  const config = loadConfig(runtime);
  const model = getTextModelName(runtime, size);
  const prompt = String(params.prompt ?? "");
  const maxTokens =
    typeof params.maxOutputTokens === "number"
      ? params.maxOutputTokens
      : typeof params.maxTokens === "number"
        ? params.maxTokens
        : 512;

  const response = await fetchJson<{
    choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
  }>(`${config.openAiApiUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(runtime?.character?.system
          ? [
              {
                role: "system",
                content: runtime.character.system
              }
            ]
          : []),
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: params.temperature ?? 0.7,
      max_tokens: maxTokens,
      frequency_penalty: params.frequencyPenalty ?? 0.7,
      presence_penalty: params.presencePenalty ?? 0.7,
      stop: params.stopSequences ?? []
    })
  });

  const choice = response.choices?.[0]?.message;
  const text = choice?.content?.trim();
  const reasoning = choice?.reasoning?.trim();
  const output = text || reasoning || "";

  if (output && params.onStreamChunk) {
    await params.onStreamChunk(output);
  }

  if (!output) {
    throw new Error(`No text content returned for ${model}`);
  }

  return output;
}

export const sirenAgentPlugin: Plugin = {
  name: "plugin-siren-agent",
  description:
    "SirenAgent's data pipeline for Solana whale monitoring, prediction market divergence, synthesis, and broadcasting.",
  priority: 100,
  actions: [
    fetchSignalsAction,
    fetchWhaleActivityAction,
    synthesizeIntelligenceAction,
    postUpdateAction
  ],
  providers: [],
  evaluators: [],
  models: {
    TEXT_SMALL: async (runtime, params) =>
      generateChatText(runtime, "small", params),
    TEXT_LARGE: async (runtime, params) =>
      generateChatText(runtime, "large", params)
  },
  init: async (_config, runtime) => {
    const settings = loadConfig(runtime);
    const logger = runtime?.logger ?? console;

    if (!settings.autoRun || startupTriggered) {
      return;
    }

    startupTriggered = true;
    logger.info?.(
      `SirenAgent autopilot enabled. Running every ${settings.reportIntervalMinutes} minutes.`
    );

    const runCycle = async () => {
      try {
        await runBroadcastCycle(runtime);
      } catch (error) {
        logger.error?.(
          `SirenAgent broadcast cycle failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    };

    await runCycle();
    intervalHandle = setInterval(runCycle, settings.reportIntervalMinutes * 60 * 1000);
  }
};

export default sirenAgentPlugin;
