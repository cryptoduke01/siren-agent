import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State
} from "../lib/elizaTypes.js";
import { gatherWhaleActivity } from "../lib/orchestrator.js";

export const fetchWhaleActivityAction: Action = {
  name: "FETCH_WHALE_ACTIVITY",
  description:
    "Fetch recent Solana whale movements for monitored wallets using Helius transaction history.",
  similes: ["CHECK_ONCHAIN_FLOWS", "FETCH_SOLANA_WHALES", "GET_WHALE_ACTIVITY"],
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const whaleActivity = await gatherWhaleActivity(runtime);
    const text =
      whaleActivity.length > 0
        ? `Fetched ${whaleActivity.length} whale activity items. Latest venue: ${whaleActivity[0].venue}.`
        : "No whale movements matched the configured filters.";

    if (callback) {
      await callback({ text });
    }

    return {
      text,
      success: true,
      data: { whaleActivity }
    };
  },
  examples: []
};
