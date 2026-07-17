import { createSesameSign } from "./sesame-sign";
import type { DeviceControl, RemoteDevice } from "./switchbot";

const BASE_URL = "https://app.candyhouse.co/api/sesame2";
const MAX_ATTEMPTS = 3;

type SesameCommand = Extract<DeviceControl["command"], "lock" | "unlock">;

type SesameConfiguration = {
  apiKey: string;
  deviceId: string;
  historyTag: string;
  secretKey: string;
};

type SesameStatusResponse = {
  batteryPercentage?: unknown;
  CHSesame2Status?: unknown;
  timestamp?: unknown;
};

export type SesameStatus = {
  batteryPercentage?: number;
  lockState: "locked" | "moved" | "unlocked";
  timestamp?: number;
};

export class SesameApiError extends Error {
  constructor(
    readonly kind: "api" | "auth" | "configuration" | "device" | "network" | "rate-limit",
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "SesameApiError";
  }
}

export function configuredSesameDevice(): RemoteDevice | null {
  if (!sesameConfigurationIsPresent()) return null;
  const configuration = readConfiguration();
  return {
    controls: [
      { command: "lock", label: "施錠", tone: "neutral" },
      { command: "unlock", label: "解錠", tone: "danger" },
    ],
    deviceId: configuration.deviceId,
    isInfrared: false,
    name: process.env.SESAME_DEVICE_NAME?.trim() || "玄関",
    provider: "sesame",
    type: "SESAME Smart Lock",
  };
}

export function isConfiguredSesameDevice(deviceId: string): boolean {
  return Boolean(process.env.SESAME_DEVICE_UUID?.trim() === deviceId);
}

export async function getSesameStatus(): Promise<SesameStatus> {
  const configuration = readConfiguration();
  const body = await requestSesame<SesameStatusResponse>(
    `/${encodeURIComponent(configuration.deviceId)}`,
    configuration,
  );
  const lockState = body.CHSesame2Status;
  if (lockState !== "locked" && lockState !== "unlocked" && lockState !== "moved") {
    throw new SesameApiError("api", "SESAMEから有効な鍵状態を取得できませんでした。");
  }

  return {
    batteryPercentage:
      typeof body.batteryPercentage === "number" ? body.batteryPercentage : undefined,
    lockState,
    timestamp: typeof body.timestamp === "number" ? body.timestamp : undefined,
  };
}

export async function sendSesameCommand(command: SesameCommand): Promise<void> {
  const configuration = readConfiguration();
  const payload = await buildSesameCommandPayload(
    command,
    configuration.secretKey,
    configuration.historyTag,
  );
  await requestSesame(`/${encodeURIComponent(configuration.deviceId)}/cmd`, configuration, {
    body: payload,
    method: "POST",
  });
}

export async function buildSesameCommandPayload(
  command: SesameCommand,
  secretKey: string,
  historyTag: string,
  timestamp = Math.floor(Date.now() / 1000),
): Promise<{ cmd: 82 | 83; history: string; sign: string }> {
  const historyBytes = new TextEncoder().encode(historyTag);
  if (historyBytes.length > 21) {
    throw new SesameApiError("configuration", "SESAME_HISTORY_TAGは21バイト以内にしてください。");
  }

  return {
    cmd: command === "lock" ? 82 : 83,
    history: bytesToBase64(historyBytes),
    sign: await createSesameSign(secretKey, timestamp),
  };
}

async function requestSesame<T = unknown>(
  path: string,
  configuration: SesameConfiguration,
  init: { body?: unknown; method?: "GET" | "POST" } = {},
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": configuration.apiKey,
        },
        method: init.method ?? "GET",
      });
    } catch {
      if (attempt < MAX_ATTEMPTS - 1) {
        await retryDelay(attempt);
        continue;
      }
      throw new SesameApiError("network", "SESAMEクラウドに接続できませんでした。");
    }

    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS - 1) {
      await retryDelay(attempt);
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new SesameApiError("auth", "SESAMEのAPIキーが無効です。", response.status);
    }
    if (response.status === 404) {
      throw new SesameApiError("device", "SESAMEのUUIDが見つかりません。", 404);
    }
    if (response.status === 429) {
      throw new SesameApiError("rate-limit", "SESAME APIの利用上限に達しました。", 429);
    }
    if (!response.ok) {
      throw new SesameApiError("api", "SESAME APIでエラーが発生しました。", response.status);
    }
    return payload as T;
  }

  throw new SesameApiError("network", "SESAMEクラウドに接続できませんでした。");
}

function readConfiguration(): SesameConfiguration {
  const apiKey = process.env.SESAME_API_KEY?.trim();
  const deviceId = process.env.SESAME_DEVICE_UUID?.trim();
  const secretKey = process.env.SESAME_SECRET_KEY?.trim();
  if (!apiKey || !deviceId || !secretKey) {
    throw new SesameApiError("configuration", "Mac側のSESAME設定が不足しています。");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
    throw new SesameApiError("configuration", "SESAME_DEVICE_UUIDの形式が正しくありません。");
  }
  if (!/^[0-9a-f]{32}$/i.test(secretKey)) {
    throw new SesameApiError("configuration", "SESAME_SECRET_KEYは32桁のhexで入力してください。");
  }

  return {
    apiKey,
    deviceId,
    historyTag: process.env.SESAME_HISTORY_TAG?.trim() || "WebRemote",
    secretKey,
  };
}

function sesameConfigurationIsPresent(): boolean {
  return Boolean(
    process.env.SESAME_API_KEY?.trim() ||
    process.env.SESAME_DEVICE_UUID?.trim() ||
    process.env.SESAME_SECRET_KEY?.trim(),
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300 * 3 ** attempt));
}
