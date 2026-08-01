import { SESSION_DURATION_SECONDS } from "./config";

type SessionPayload = {
  version: 1;
  issuedAt: number;
  expiresAt: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    return null;
  }

  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

async function importSigningKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function createSessionToken(
  secret: string,
  now = Date.now(),
): Promise<string> {
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  }

  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = {
    version: 1,
    issuedAt,
    expiresAt: issuedAt + SESSION_DURATION_SECONDS,
  };
  const encodedPayload = encodeBase64Url(
    encoder.encode(JSON.stringify(payload)),
  );
  const key = await importSigningKey(secret, "sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload),
  );

  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token || token.length > 2_048 || !secret || secret.length < 32) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [encodedPayload, encodedSignature] = parts;
  const payloadBytes = decodeBase64Url(encodedPayload);
  const signatureBytes = decodeBase64Url(encodedSignature);
  if (!payloadBytes || !signatureBytes) return false;

  try {
    const key = await importSigningKey(secret, "verify");
    const signatureIsValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(encodedPayload),
    );
    if (!signatureIsValid) return false;

    const payload = JSON.parse(
      decoder.decode(payloadBytes),
    ) as Partial<SessionPayload>;
    const currentTime = Math.floor(now / 1000);

    return (
      payload.version === 1 &&
      Number.isSafeInteger(payload.issuedAt) &&
      Number.isSafeInteger(payload.expiresAt) &&
      payload.issuedAt! <= currentTime + 60 &&
      payload.expiresAt! > currentTime &&
      payload.expiresAt! - payload.issuedAt! === SESSION_DURATION_SECONDS
    );
  } catch {
    return false;
  }
}
