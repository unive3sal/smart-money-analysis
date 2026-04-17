import { recoverTypedDataAddress } from "viem";
import { Chain, SignatureType, type ApiKeyCreds } from "@polymarket/clob-client";
import { db, PolymarketAuthState, WalletChain } from "@/backend/server/db/client";
import type { TradingVaultRecord, WalletConnectionRecord } from "@/backend/server/db/types";
import { getPolymarketService } from "@/backend/services/polymarket/client";
import type { WalletPolymarketAuthStatus } from "@/backend/services/polymarket/types";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

const REAUTH_TTL_MS = 1000 * 60 * 10;
const DEFAULT_CREDENTIAL_TTL_MS = 1000 * 60 * 60 * 12;
const POLYMARKET_AUTH_MESSAGE = "This message attests that I control the given wallet";

function normalizeState(state: PolymarketAuthState): WalletPolymarketAuthStatus["state"] {
  return state === PolymarketAuthState.AUTHORIZED
    ? "authorized"
    : state === PolymarketAuthState.REQUIRES_REAUTH
      ? "requires_reauth"
      : "unauthorized";
}

function toStatus(wallet: WalletConnectionRecord): WalletPolymarketAuthStatus {
  return {
    state: normalizeState(wallet.polymarketAuthState),
    walletAddress: wallet.address,
    chain: wallet.chain,
    provider: wallet.provider,
    hasCachedCredentials: Boolean(
      wallet.polymarketApiKeyEncrypted &&
      wallet.polymarketApiSecretEncrypted &&
      wallet.polymarketApiPassphraseEncrypted
    ),
    credentialsExpireAt: wallet.polymarketApiCredsExpiresAt,
    lastDerivedAt: wallet.polymarketApiCredsLastDerivedAt,
    reauthMessage: wallet.polymarketReauthMessage,
    requestedAt: wallet.polymarketReauthRequestedAt,
  };
}

function parseExpiry(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildTypedData(address: `0x${string}`, nonce: number) {
  return {
    domain: {
      name: "ClobAuthDomain",
      version: "1",
      chainId: Chain.POLYGON,
    },
    types: {
      ClobAuth: [
        { name: "address", type: "address" },
        { name: "timestamp", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "message", type: "string" },
      ],
    },
    primaryType: "ClobAuth" as const,
    message: {
      address,
      timestamp: `${Math.floor(Date.now() / 1000)}`,
      nonce,
      message: POLYMARKET_AUTH_MESSAGE,
    },
  };
}

async function requireWallet(walletConnectionId: string) {
  const wallet = await db.findWalletConnectionById(walletConnectionId);
  if (!wallet) {
    throw new Error("Wallet connection not found");
  }

  return wallet;
}

async function getLinkedVault(wallet: WalletConnectionRecord) {
  return db.findTradingVaultByWalletConnectionId(wallet.id);
}

async function persistCredentialCache(wallet: WalletConnectionRecord, creds: ApiKeyCreds, expiresAt: string) {
  await db.updateWalletConnection(wallet.id, {
    polymarketAuthState: PolymarketAuthState.AUTHORIZED,
    polymarketApiKeyEncrypted: encryptSecret(creds.key),
    polymarketApiSecretEncrypted: encryptSecret(creds.secret),
    polymarketApiPassphraseEncrypted: encryptSecret(creds.passphrase),
    polymarketApiCredsLastDerivedAt: new Date().toISOString(),
    polymarketApiCredsExpiresAt: expiresAt,
    polymarketReauthMessage: null,
    polymarketReauthNonce: null,
    polymarketReauthRequestedAt: null,
  });

  const vault = await getLinkedVault(wallet);
  if (vault) {
    await db.updateTradingVault(vault.id, {
      polymarketAuthState: PolymarketAuthState.AUTHORIZED,
      polymarketApiKeyEncrypted: encryptSecret(creds.key),
      polymarketApiSecretEncrypted: encryptSecret(creds.secret),
      polymarketApiPassphraseEncrypted: encryptSecret(creds.passphrase),
      polymarketApiCredsLastDerivedAt: new Date().toISOString(),
      polymarketApiCredsExpiresAt: expiresAt,
    });
  }
}

async function markReauthRequired(wallet: WalletConnectionRecord) {
  await db.updateWalletConnection(wallet.id, {
    polymarketAuthState: PolymarketAuthState.REQUIRES_REAUTH,
    polymarketReauthMessage: null,
    polymarketReauthNonce: null,
    polymarketReauthRequestedAt: null,
  });

  const vault = await getLinkedVault(wallet);
  if (vault) {
    await db.updateTradingVault(vault.id, {
      polymarketAuthState: PolymarketAuthState.REQUIRES_REAUTH,
    });
  }
}

export async function getWalletPolymarketAuthStatus(walletConnectionId: string) {
  const wallet = await requireWallet(walletConnectionId);
  return toStatus(wallet);
}

export async function requestWalletPolymarketReauth(walletConnectionId: string) {
  const wallet = await requireWallet(walletConnectionId);

  if (wallet.chain !== WalletChain.EVM) {
    throw new Error("Polymarket execution is only supported for EVM wallets");
  }

  const requestedAt = Date.now();
  const nonce = Math.floor(requestedAt / 1000);
  const typedData = buildTypedData(wallet.address as `0x${string}`, nonce);

  await db.updateWalletConnection(wallet.id, {
    polymarketAuthState: PolymarketAuthState.REQUIRES_REAUTH,
    polymarketReauthMessage: JSON.stringify(typedData),
    polymarketReauthNonce: nonce,
    polymarketReauthRequestedAt: new Date(requestedAt).toISOString(),
  });

  const vault = await getLinkedVault(wallet);
  if (vault) {
    await db.updateTradingVault(vault.id, {
      polymarketAuthState: PolymarketAuthState.REQUIRES_REAUTH,
    });
  }

  return {
    walletConnectionId: wallet.id,
    message: typedData,
    status: toStatus({
      ...wallet,
      polymarketAuthState: PolymarketAuthState.REQUIRES_REAUTH,
      polymarketReauthMessage: JSON.stringify(typedData),
      polymarketReauthNonce: nonce,
      polymarketReauthRequestedAt: new Date(requestedAt).toISOString(),
    }),
  };
}

export async function authorizeWalletPolymarketCredentials(input: {
  walletConnectionId: string;
  signature: `0x${string}`;
  expiresInMs?: number;
}) {
  const wallet = await requireWallet(input.walletConnectionId);

  if (wallet.chain !== WalletChain.EVM) {
    throw new Error("Polymarket execution is only supported for EVM wallets");
  }

  if (!wallet.polymarketReauthMessage || !wallet.polymarketReauthRequestedAt || wallet.polymarketReauthNonce === null) {
    throw new Error("Polymarket reauthorization was not requested for this wallet");
  }

  const requestedAt = Date.parse(wallet.polymarketReauthRequestedAt);
  if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > REAUTH_TTL_MS) {
    throw new Error("Polymarket reauthorization request expired. Request a new signature.");
  }

  const typedData = JSON.parse(wallet.polymarketReauthMessage) as ReturnType<typeof buildTypedData>;
  const recoveredAddress = await recoverTypedDataAddress({
    ...typedData,
    signature: input.signature,
  });

  if (recoveredAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("Polymarket authorization signature does not match the selected wallet");
  }

  const signer = getPolymarketService().createDelegatedSigner({
    accountAddress: wallet.address as `0x${string}`,
    signTypedData: async () => input.signature,
  });

  const creds = await getPolymarketService().createOrDeriveApiCredentials({
    signer,
    signatureType: SignatureType.EOA,
  });

  const expiresAt = new Date(Date.now() + (input.expiresInMs ?? DEFAULT_CREDENTIAL_TTL_MS)).toISOString();
  await persistCredentialCache(wallet, creds, expiresAt);

  return {
    status: await getWalletPolymarketAuthStatus(wallet.id),
  };
}

export async function resolveWalletPolymarketCredentials(walletConnectionId: string) {
  const wallet = await requireWallet(walletConnectionId);
  const expiresAt = parseExpiry(wallet.polymarketApiCredsExpiresAt);

  if (
    wallet.polymarketAuthState !== PolymarketAuthState.AUTHORIZED ||
    !wallet.polymarketApiKeyEncrypted ||
    !wallet.polymarketApiSecretEncrypted ||
    !wallet.polymarketApiPassphraseEncrypted ||
    !expiresAt ||
    expiresAt <= Date.now()
  ) {
    await markReauthRequired(wallet);
    return null;
  }

  return {
    key: decryptSecret(wallet.polymarketApiKeyEncrypted),
    secret: decryptSecret(wallet.polymarketApiSecretEncrypted),
    passphrase: decryptSecret(wallet.polymarketApiPassphraseEncrypted),
  } satisfies ApiKeyCreds;
}

export async function getTaskExecutionAuthorization(task: { walletConnectionId?: string | null; tradingVault?: TradingVaultRecord | null; walletConnection?: WalletConnectionRecord | null; }) {
  if (!task.walletConnectionId) {
    return {
      canExecute: false,
      reason: "wallet_missing",
      walletStatus: null,
    };
  }

  const wallet = task.walletConnection || await requireWallet(task.walletConnectionId);
  const walletStatus = toStatus(wallet);

  if (wallet.chain !== WalletChain.EVM) {
    return {
      canExecute: false,
      reason: "unsupported_chain",
      walletStatus,
    };
  }

  if (walletStatus.state !== "authorized") {
    return {
      canExecute: false,
      reason: walletStatus.state === "requires_reauth" ? "wallet_reauth_required" : "wallet_unauthorized",
      walletStatus,
    };
  }

  if (!walletStatus.hasCachedCredentials) {
    return {
      canExecute: false,
      reason: "wallet_credentials_missing",
      walletStatus,
    };
  }

  return {
    canExecute: true,
    reason: null,
    walletStatus,
  };
}
