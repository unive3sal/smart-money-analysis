import { ExecutionStatus, PositionSide, TaskStatus, db } from "@/backend/server/db/client";
import { resolveWalletPolymarketCredentials } from "@/backend/services/polymarket/auth";
import { getPolymarketService } from "@/backend/services/polymarket/client";
import type { BrokeredExecutionPreparePayload, BrokeredExecutionView } from "@/backend/services/polymarket/types";

function parseMetadata(metadataJson: string | null) {
  if (!metadataJson) {
    return null;
  }

  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toExecutionView(execution: {
  id: string;
  taskId: string;
  marketId: string;
  tokenId: string;
  side: PositionSide;
  status: ExecutionStatus;
  orderType: string;
  price: number;
  size: number;
  executedPrice: number | null;
  transactionHash: string | null;
  rejectionReason: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}): BrokeredExecutionView {
  const metadata = parseMetadata(execution.metadataJson);
  const preparePayload = metadata?.preparePayload && typeof metadata.preparePayload === "object"
    ? metadata.preparePayload as BrokeredExecutionPreparePayload
    : null;

  return {
    id: execution.id,
    taskId: execution.taskId,
    status: execution.status.toLowerCase(),
    marketId: execution.marketId,
    tokenId: execution.tokenId,
    side: execution.side,
    orderType: execution.orderType,
    price: execution.price,
    size: execution.size,
    executedPrice: execution.executedPrice,
    transactionHash: execution.transactionHash,
    rejectionReason: execution.rejectionReason,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    metadata,
    preparePayload,
  };
}

async function requireOwnedTask(taskId: string, userId: string) {
  const task = await db.findCopyTradeTask(taskId, userId);
  if (!task) {
    throw new Error("Copy trade task not found");
  }

  return task;
}

export async function listBrokeredExecutions(userId: string, status?: ExecutionStatus) {
  const executions = await db.listCopyTradeExecutionsForUser(userId, status);
  return executions.map(toExecutionView);
}

export async function getBrokeredExecution(executionId: string, userId: string) {
  const execution = await db.findCopyTradeExecutionById(executionId);
  if (!execution) {
    throw new Error("Copy trade execution not found");
  }

  await requireOwnedTask(execution.taskId, userId);
  return toExecutionView(execution);
}

export async function cancelBrokeredExecution(executionId: string, userId: string) {
  const execution = await db.findCopyTradeExecutionById(executionId);
  if (!execution) {
    throw new Error("Copy trade execution not found");
  }

  await requireOwnedTask(execution.taskId, userId);

  if (execution.status !== ExecutionStatus.PENDING) {
    throw new Error("Only pending executions can be cancelled");
  }

  const updated = await db.updateCopyTradeExecution(executionId, {
    status: ExecutionStatus.CANCELLED,
    rejectionReason: "Cancelled by user",
  });

  return toExecutionView(updated);
}

export async function prepareBrokeredExecution(executionId: string, userId: string) {
  const execution = await db.findCopyTradeExecutionById(executionId);
  if (!execution) {
    throw new Error("Copy trade execution not found");
  }

  const task = await requireOwnedTask(execution.taskId, userId);

  if (task.status !== TaskStatus.ACTIVE) {
    throw new Error("Task must be active to prepare a brokered execution");
  }

  if (execution.status !== ExecutionStatus.PENDING) {
    throw new Error("Only pending executions can be prepared");
  }

  const metadata = parseMetadata(execution.metadataJson) || {};
  const preparePayload = metadata.preparePayload;
  if (!preparePayload || typeof preparePayload !== "object") {
    throw new Error("Execution prepare payload is unavailable");
  }

  return {
    execution: toExecutionView(execution),
    preparePayload: preparePayload as BrokeredExecutionPreparePayload,
  };
}

export async function submitBrokeredExecution(input: {
  executionId: string;
  userId: string;
  signedOrder?: Record<string, unknown> | null;
  transactionHash?: string | null;
  orderId?: string | null;
  venueStatus?: string | null;
  executedPrice?: number | null;
}) {
  const execution = await db.findCopyTradeExecutionById(input.executionId);
  if (!execution) {
    throw new Error("Copy trade execution not found");
  }

  const task = await requireOwnedTask(execution.taskId, input.userId);

  if (execution.status !== ExecutionStatus.PENDING) {
    throw new Error("Only pending executions can be submitted");
  }

  if (!task.walletConnectionId) {
    throw new Error("Execution wallet is missing for this task");
  }

  if (!input.signedOrder) {
    throw new Error("Signed order payload is required");
  }

  const creds = await resolveWalletPolymarketCredentials(task.walletConnectionId);
  if (!creds) {
    throw new Error("Polymarket credentials need to be refreshed before submission");
  }

  const metadata = parseMetadata(execution.metadataJson) || {};
  const wallet = task.walletConnection || await db.findWalletConnectionById(task.walletConnectionId);
  if (!wallet) {
    throw new Error("Execution wallet connection not found");
  }

  const signer = getPolymarketService().createDelegatedSigner({
    accountAddress: wallet.address as `0x${string}`,
    signTypedData: async () => {
      throw new Error("Server-side delegated signer cannot sign browser-owned orders");
    },
  });

  const response = await getPolymarketService().createAuthenticatedClient({
    signer,
    creds,
    signatureType: 0,
    funder: task.tradingVault?.funderAddress || undefined,
  }).postOrder(input.signedOrder as never);

  const transactionHash =
    input.transactionHash ||
    (Array.isArray(response?.transactionsHashes) ? response.transactionsHashes[0] || null : null) ||
    execution.transactionHash;
  const updated = await db.updateCopyTradeExecution(input.executionId, {
    status: ExecutionStatus.SUBMITTED,
    transactionHash,
    executedPrice: input.executedPrice ?? execution.executedPrice,
    metadataJson: JSON.stringify({
      ...metadata,
      submission: {
        signedOrder: input.signedOrder,
        orderId: input.orderId || response?.orderID || null,
        venueStatus: input.venueStatus || response?.status || null,
        venueResponse: response || null,
        submittedAt: new Date().toISOString(),
      },
    }),
  });

  return toExecutionView(updated);
}
