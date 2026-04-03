import "dotenv/config";
import { buildSirenReport, broadcastReport } from "../plugin-siren-agent/dist/lib/orchestrator.js";

const shouldBroadcast = process.argv.includes("--broadcast");

async function main() {
  const report = await buildSirenReport();

  console.log(JSON.stringify(report, null, 2));

  if (shouldBroadcast) {
    const result = await broadcastReport(report);
    console.log(JSON.stringify({ broadcast: result }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
