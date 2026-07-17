export type UserRole = "guest" | "owner";

export class AuthConfigurationError extends Error {
  constructor() {
    super("Mac側にOWNER_PINが設定されていません。");
    this.name = "AuthConfigurationError";
  }
}

export async function authenticateRequest(request: Request): Promise<UserRole | null> {
  const ownerPin = ownerAccessCode();
  if (!ownerPin) throw new AuthConfigurationError();

  const supplied = request.headers.get("x-remote-pin")?.trim();
  if (!supplied) return null;
  const guestPin = process.env.GUEST_PIN?.trim();
  return resolveRole(supplied, ownerPin, guestPin);
}

export function ownerAccessCodeIsConfigured(): boolean {
  return Boolean(ownerAccessCode());
}

function ownerAccessCode(): string | undefined {
  return process.env.OWNER_PIN?.trim() || process.env.REMOTE_PIN?.trim() || undefined;
}

export async function resolveRole(
  supplied: string,
  ownerPin: string,
  guestPin?: string,
): Promise<UserRole | null> {
  if (await constantTimeEqual(supplied, ownerPin)) return "owner";
  if (guestPin && (await constantTimeEqual(supplied, guestPin))) return "guest";
  return null;
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}
