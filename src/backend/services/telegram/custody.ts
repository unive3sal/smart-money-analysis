import {
  AnalysisSignal,
  WalletAuthType,
  WalletChain,
  WalletProvider,
  db,
} from "@/backend/server/db/client";
import type { ActorContext } from "@/backend/server/auth/actor";
import { provisionTelegramUser, requireActorUser } from "@/backend/server/auth/actor";

function deriveTelegramVaultAddress(walletAddress: string, chain: WalletChain) {
  if (chain === WalletChain.SOLANA) {
    return `${walletAddress.slice(0, 20)}tgvault`;
  }

  const normalized = walletAddress.replace(/^0x/, "").slice(0, 32);
  return `0x${normalized}tgva1t`;
}

export interface TelegramCustodySetupInput {
  actor: ActorContext;
  walletAddress: string;
  chain?: WalletChain;
  provider?: WalletProvider;
  label?: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export async function setupTelegramCustody(input: TelegramCustodySetupInput) {
  if (input.actor.channel !== "telegram" || !input.actor.telegramUserId || !input.actor.chatId) {
    throw new Error("Telegram custody setup requires a Telegram actor context");
  }

  const chain = input.chain || WalletChain.EVM;
  const provider = input.provider || (chain === WalletChain.SOLANA ? WalletProvider.PHANTOM : WalletProvider.METAMASK);
  const walletAddress = input.walletAddress.trim();

  const { user } = await provisionTelegramUser({
    telegramUserId: input.actor.telegramUserId,
    chatId: input.actor.chatId,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
    walletAddress,
    chain,
    provider,
    label: input.label,
  });

  const walletConnection = await db.findWalletConnectionByComposite(walletAddress, chain, provider)
    || await db.createWalletConnection({
      userId: user.id,
      address: walletAddress,
      chain,
      provider,
      authType: WalletAuthType.VAULT_DELEGATION,
      label: input.label || "Telegram Wallet",
      authorizationScope: "telegram_custody",
    });

  const vaultAddress = deriveTelegramVaultAddress(walletAddress, chain);
  const tradingVault = await db.findTradingVaultByAddress(user.id, vaultAddress, chain)
    || await db.createTradingVault({
      userId: user.id,
      walletConnectionId: walletConnection.id,
      chain,
      address: vaultAddress,
      funderAddress: walletAddress,
      label: `${input.label || provider} Telegram Vault`,
      authType: WalletAuthType.VAULT_DELEGATION,
      status: "provisioned",
      metadataJson: JSON.stringify({
        source: "telegram",
        custodyMode: "telegram_native_mvp",
        advisoryOnly: true,
      }),
    });

  const custody = await db.upsertTelegramCustody({
    userId: user.id,
    telegramUserId: input.actor.telegramUserId,
    walletConnectionId: walletConnection.id,
    tradingVaultId: tradingVault.id,
    walletAddress,
    chain,
    provider,
    vaultAddress,
    label: input.label || "Telegram Custody",
    status: "provisioned",
    executionMode: "advisory_brokered",
    isSimulated: true,
    isExecutionEnabled: false,
    metadataJson: JSON.stringify({
      stopLossSupported: true,
      takeProfitSupported: true,
      requiredSignal: AnalysisSignal.BUY,
    }),
  });

  return {
    user,
    walletConnection,
    tradingVault,
    custody,
  };
}

export async function getTelegramCustodySummary(actor: ActorContext) {
  const resolved = await requireActorUser(actor);
  const [wallets, vaults, custody] = await Promise.all([
    db.listWalletConnections(resolved.userId),
    db.listTradingVaults(resolved.userId),
    db.findTelegramCustodyByUserId(resolved.userId),
  ]);

  return {
    userId: resolved.userId,
    wallets,
    vaults,
    custody,
  };
}
