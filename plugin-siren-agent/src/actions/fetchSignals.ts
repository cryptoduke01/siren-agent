import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State
} from "../lib/elizaTypes.js";
import { gatherSignals } from "../lib/orchestrator.js";

export const fetchSignalsAction: Action = {
  name: "FETCH_SIGNALS",
  description:
    "Fetch Kalshi and Polymarket crypto market data, normalize it, and surface divergences.",
  similes: ["GET_SIGNAL_SNAPSHOT", "CHECK_MARKET_DIVERGENCE", "FETCH_PREDICTION_SIGNALS"],
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const signals = await gatherSignals(runtime);
    const text =
      signals.length > 0
        ? `Fetched ${signals.length} divergence signals. Largest delta: ${signals[0].delta.toFixed(2)}`
        : "No overlapping Kalshi and Polymarket crypto signals were found.";

    if (callback) {
      await callback({ text });
    }

    return {
      text,
      success: true,
      data: { signals }
    };
  },
  examples: []
};
