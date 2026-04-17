import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";

const ENCRYPTION_SECRET = process.env.APP_ENCRYPTION_SECRET || process.env.LLM_PROXY_TOKEN || "local-dev-secret";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey() {
  return createHash("sha256").update(ENCRYPTION_SECRET).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(":");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted payload");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
