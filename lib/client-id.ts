export type ClientCryptoSource = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

let fallbackSequence = 0;

function bytesToHex(values: Uint8Array) {
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function createIdempotencyKey(source: ClientCryptoSource | undefined = globalThis.crypto as ClientCryptoSource | undefined) {
  try {
    const value = source?.randomUUID?.();
    if (value) return value;
  } catch {
    // Continue with the compatibility paths below.
  }

  try {
    if (source?.getRandomValues) {
      const values = new Uint8Array(16);
      source.getRandomValues(values);
      return `client-${bytesToHex(values)}`;
    }
  } catch {
    // Very old embedded browsers can expose an unusable crypto object.
  }

  fallbackSequence = (fallbackSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `client-${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
