import { logError, logInfo } from "@/lib/observability";
import { runCopytradeWorkerCycle } from "@/services/copytrade/engine";
import { seedLeaderboardSnapshot } from "@/server/worker/seed";

async function main() {
  await seedLeaderboardSnapshot();
  const results = await runCopytradeWorkerCycle();

  logInfo("Copytrade worker cycle completed", {
    operation: "copytrade_worker_cycle",
    outcome: "success",
    processed_tasks: results.length,
  });

  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  logError("Copytrade worker failed", error, {
    operation: "copytrade_worker_cycle",
    outcome: "error",
  });
  process.exit(1);
});
