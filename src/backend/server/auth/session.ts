import { cookies } from "next/headers";
import { db, WalletAuthType, WalletChain, WalletProvider } from "@/backend/server/db/client";

const SESSION_COOKIE = "copytrade_session";

export interface SessionUser {
  id: string;
  primaryAddress: string | null;
}

function deriveVaultAddress(address: string, chain: WalletChain) {
  if (chain === WalletChain.SOLANA) {
    return `${address.slice(0, 24)}vault`;
  }

  return `0x${address.replace(/^0x/, "").slice(0, 34)}vault`;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return null;
  }

  const user = await db.findUserById(sessionId);

  return user ?? null;
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Wallet session required");
  }

  return user;
}

export async function createWalletSession(input: {
  address: string;
  chain: WalletChain;
  provider: WalletProvider;
  label?: string;
}) {
  const normalizedAddress = input.address.trim();

  const user = await db.upsertUserByPrimaryAddress({
    primaryAddress: normalizedAddress,
    displayName: input.label,
  });

  const existingConnection = await db.findWalletConnectionByComposite(
    normalizedAddress,
    input.chain,
    input.provider
  );

  if (!existingConnection) {
    await db.createWalletConnection({
      userId: user.id,
      address: normalizedAddress,
      chain: input.chain,
      provider: input.provider,
      authType: WalletAuthType.SIGNED_MESSAGE,
      label: input.label,
      authorizationScope: "wallet_connect",
    });
  } else {
    await db.updateWalletConnection(existingConnection.id, {
      isActive: true,
      lastVerifiedAt: new Date().toISOString(),
      label: input.label ?? existingConnection.label,
    });
  }

  const existingVault = await db.findTradingVaultByAddress(
    user.id,
    deriveVaultAddress(normalizedAddress, input.chain),
    input.chain
  );

  if (!existingVault) {
    await db.createTradingVault({
      userId: user.id,
      walletConnectionId: existingConnection?.id || null,
      chain: input.chain,
      address: deriveVaultAddress(normalizedAddress, input.chain),
      funderAddress: input.chain === WalletChain.EVM ? normalizedAddress : null,
      label: `${input.label || input.provider} Vault`,
      authType: WalletAuthType.VAULT_DELEGATION,
      metadataJson: JSON.stringify({
        sourceAddress: normalizedAddress,
        executionMode: input.chain === WalletChain.EVM ? "polymarket_polygon" : "cross_chain_identity",
      }),
    });
  }

  cookies().set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return user;
}

export function clearWalletSession() {
  cookies().delete(SESSION_COOKIE);
}
