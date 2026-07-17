import { AesCmac } from "aes-cmac";

export async function createSesameSign(
  secretKeyHex: string,
  timestamp = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = hexToBytes(secretKeyHex, "SESAME_SECRET_KEY", 16);
  const message = sesameTimestampMessage(timestamp);
  const cmac = await new AesCmac(key).calculate(message);
  return bytesToHex(cmac);
}

export async function calculateAesCmac(keyHex: string, messageHex: string): Promise<string> {
  const key = hexToBytes(keyHex, "key");
  const message = hexToBytes(messageHex, "message");
  return bytesToHex(await new AesCmac(key).calculate(message));
}

export function sesameTimestampMessage(timestamp: number): Uint8Array {
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffff) {
    throw new TypeError("timestamp must be a 32-bit unsigned Unix timestamp");
  }

  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, timestamp, true);
  return bytes.slice(1, 4);
}

function hexToBytes(value: string, name: string, expectedLength?: number): Uint8Array {
  const normalized = value.trim();
  if (!/^(?:[0-9a-f]{2})*$/i.test(normalized)) {
    throw new TypeError(`${name} must be an even-length hexadecimal string`);
  }

  const bytes = Uint8Array.from(
    normalized ? normalized.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)) : [],
  );
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new TypeError(`${name} must be ${expectedLength} bytes`);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
