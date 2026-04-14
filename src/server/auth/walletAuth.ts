import { cookies } from "next/headers";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { recoverMessageAddress } from "viem";
import { WalletChain, WalletProvider } from "@/server/db/client";

const NONCE_COOKIE = "wallet_auth_nonce";
const DEMO_SIGNATURE_PREFIX = "demo:";

export interface WalletAuthNonce {
  nonce: string;
  message: string;
}

export function createWalletAuthNonce(address: string) {
  const nonce = crypto.randomUUID();
  const message = `Authorize Smart Money Analysis copy trading for ${address}. Nonce: ${nonce}`;

  cookies().set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return { nonce, message } satisfies WalletAuthNonce;
}

export async function verifyWalletSignature(input: {
  address: string;
  provider: WalletProvider;
  chain: WalletChain;
  message: string;
  signature: string;
}) {
  const storedNonce = cookies().get(NONCE_COOKIE)?.value;

  if (!storedNonce || !input.message.includes(storedNonce)) {
    return false;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    input.signature === `${DEMO_SIGNATURE_PREFIX}${input.address}` &&
    process.env.ALLOW_DEMO_WALLET_AUTH !== "false"
  ) {
    return true;
  }

  const normalizedAddress = input.address.trim().toLowerCase();

  if (input.chain === WalletChain.EVM) {
    const recoveredAddress = await recoverMessageAddress({
      message: input.message,
      signature: input.signature as `0x${string}`,
    });

    return recoveredAddress.toLowerCase() === normalizedAddress;
  }

  const publicKey = bs58.decode(input.address);
  const signature = bs58.decode(input.signature);
  const message = new TextEncoder().encode(input.message);

  return nacl.sign.detached.verify(message, signature, publicKey);
}

export function clearWalletAuthNonce() {
  cookies().delete(NONCE_COOKIE);
}
