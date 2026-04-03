import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config();

const characterPath = resolve("characters/agent.character.json");
const character = JSON.parse(readFileSync(characterPath, "utf8"));

const hasTwitter = Boolean(
  process.env.TWITTER_API_KEY?.trim() &&
    (process.env.TWITTER_API_SECRET_KEY?.trim() ||
      process.env.TWITTER_API_SECRET?.trim()) &&
    process.env.TWITTER_ACCESS_TOKEN?.trim() &&
    (process.env.TWITTER_ACCESS_TOKEN_SECRET?.trim() ||
      process.env.TWITTER_ACCESS_SECRET?.trim())
);

character.plugins = [
  "@elizaos/plugin-sql",
  "@elizaos/plugin-bootstrap",
  "@elizaos/plugin-openai",
  "@elizaos/plugin-telegram",
  ...(hasTwitter ? ["@elizaos/plugin-twitter"] : []),
  "plugin-siren-agent"
];

character.clients = ["direct", "telegram", ...(hasTwitter ? ["twitter"] : [])];
character.modelProvider = "openai";
character.settings = character.settings ?? {};
character.settings.model =
  process.env.MODEL_NAME?.trim() ||
  process.env.OPENAI_LARGE_MODEL?.trim() ||
  character.settings.model ||
  "Qwen3.5-27B-AWQ-4bit";

if (!Array.isArray(character.lore) || character.lore.length === 0) {
  character.lore = [
    "Built from a Solana-native operator's workflow for spotting market dislocations.",
    "Inspired by Siren, an event-driven trading terminal that favors signal over noise.",
    "Runs on decentralized infrastructure so the agent can stay online without a laptop."
  ];
}

writeFileSync(characterPath, `${JSON.stringify(character, null, 2)}\n`);
console.log(`sync-character: Eliza character written (twitter plugin: ${hasTwitter})`);
