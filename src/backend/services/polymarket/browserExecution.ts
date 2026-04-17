import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { Side, SignedOrder, type ApiKeyCreds, type ClobSigner, type SignatureType } from "@polymarket/clob-client";
import { getPolymarketService } from "@/backend/services/polymarket/client";
import type { BrokeredExecutionPreparePayload } from "@/backend/services/polymarket/types";

const publicClient = createPublicClient({ chain: polygon, transport: http() });

export async function buildBrowserSignedOrder(input: {
  preparePayload: BrokeredExecutionPreparePayload;
  signer: ClobSigner;
  creds: ApiKeyCreds;
  signatureType?: SignatureType;
}): Promise<SignedOrder> {
  const service = getPolymarketService();
  const client = service.createAuthenticatedClient({
    signer: input.signer,
    creds: input.creds,
    signatureType: input.signatureType,
    funder: input.preparePayload.funderAddress || undefined,
  });

  return client.createOrder(
    {
      tokenID: input.preparePayload.tokenId,
      side: input.preparePayload.side === "BUY" ? Side.BUY : Side.SELL,
      price: input.preparePayload.price,
      size: input.preparePayload.size,
    },
    {
      tickSize: String(input.preparePayload.metadata.tickSize || "0.01") as "0.1" | "0.01" | "0.001" | "0.0001",
      negRisk: Boolean(input.preparePayload.metadata.negRisk),
    }
  );
}

export async function postBrowserSignedOrder(input: {
  signedOrder: SignedOrder;
  creds: ApiKeyCreds;
  signer: ClobSigner;
  signatureType?: SignatureType;
  funderAddress?: string | null;
}) {
  const service = getPolymarketService();
  const client = service.createAuthenticatedClient({
    signer: input.signer,
    creds: input.creds,
    signatureType: input.signatureType,
    funder: input.funderAddress || undefined,
  });

  return client.postOrder(input.signedOrder);
}

export { publicClient };
