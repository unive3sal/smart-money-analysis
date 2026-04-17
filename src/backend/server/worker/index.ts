import { logError, logInfo } from "@/backend/observability";
import { runCopytradeWorkerCycle } from "@/backend/services/copytrade/engine";
import { refreshWorkerLeaderboardSnapshot } from "@/backend/server/worker/seed";

async function main() {
  await refreshWorkerLeaderboardSnapshot();
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
