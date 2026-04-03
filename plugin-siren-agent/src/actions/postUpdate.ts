import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State
} from "../lib/elizaTypes.js";
import {
  broadcastReport,
  buildSirenReport,
  getLastReport
} from "../lib/orchestrator.js";

export const postUpdateAction: Action = {
  name: "POST_UPDATE",
  description:
    "Format the latest SirenAgent intelligence report and broadcast it to Telegram and Twitter/X.",
  similes: ["BROADCAST_SIGNAL", "POST_SIREN_UPDATE", "SEND_MARKET_UPDATE"],
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const report = getLastReport() ?? (await buildSirenReport(runtime));
    const broadcast = await broadcastReport(report, runtime);
    const text = `Broadcast complete. Telegram: ${broadcast.telegramPosted}. Twitter: ${broadcast.twitterPosted}.`;

    if (callback) {
      await callback({ text });
    }

    return {
      text,
      success: true,
      data: {
        report,
        broadcast
      }
    };
  },
  examples: []
};
