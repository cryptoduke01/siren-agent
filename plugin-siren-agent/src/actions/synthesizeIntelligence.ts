import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State
} from "../lib/elizaTypes.js";
import { buildSirenReport } from "../lib/orchestrator.js";

export const synthesizeIntelligenceAction: Action = {
  name: "SYNTHESIZE_INTELLIGENCE",
  description:
    "Combine on-chain and prediction market data into a concise SirenAgent intelligence report.",
  similes: ["RUN_SIREN_REPORT", "BUILD_INTELLIGENCE_REPORT", "SYNTHESIZE_SIGNAL"],
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const report = await buildSirenReport(runtime);

    if (callback) {
      await callback({ text: report.summary });
    }

    return {
      text: report.summary,
      success: true,
      data: { report }
    };
  },
  examples: []
};
