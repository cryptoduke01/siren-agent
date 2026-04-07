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

character.settings = character.settings ?? {};
character.settings.model =
  process.env.MODEL_NAME?.trim() ||
  process.env.OPENAI_LARGE_MODEL?.trim() ||
  character.settings.model ||
  "Qwen3.5-27B-AWQ-4bit";

// ElizaOS 1.7.x JSON schema rejects clients, modelProvider, lore — merge lore into bio instead.
const loreLines = [
  "Built from a Solana-native operator's workflow for spotting market dislocations.",
  "Inspired by Siren, an event-driven trading terminal that favors signal over noise.",
  "Runs on decentralized infrastructure so the agent can stay online without a laptop."
];

const existingLore = Array.isArray(character.lore) ? character.lore : [];
character.bio = Array.isArray(character.bio) ? [...character.bio] : [];
for (const line of [...existingLore, ...loreLines]) {
  if (line && !character.bio.includes(line)) {
    character.bio.push(line);
  }
}

delete character.clients;
delete character.modelProvider;
delete character.lore;

writeFileSync(characterPath, `${JSON.stringify(character, null, 2)}\n`);
console.log(
  `sync-character: Eliza character written (twitter plugin: ${hasTwitter}; clients/plugins only — no unsupported JSON keys)`
);
