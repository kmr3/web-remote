import { ownerAccessCodeIsConfigured } from "./auth";

const BASE_URL = "https://api.switch-bot.com";

export type DeviceControl = {
  command: "lock" | "press" | "turnOff" | "turnOn" | "unlock";
  label: string;
  tone: "danger" | "neutral" | "primary";
};

export type RemoteDevice = {
  batteryPercentage?: number;
  controls: DeviceControl[];
  deviceId: string;
  isInfrared: boolean;
  lockState?: string;
  name: string;
  power?: string;
  provider: "sesame" | "switchbot";
  type: string;
};

export type RemoteScene = {
  sceneId: string;
  name: string;
};

type SwitchBotDevice = {
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  enableCloudService?: boolean;
  remoteType?: string;
};

type SwitchBotResponse<T> = {
  body?: T;
  message?: string;
  statusCode?: number;
};

type DeviceListBody = {
  deviceList?: SwitchBotDevice[];
  infraredRemoteList?: SwitchBotDevice[];
};

type SceneBody = {
  sceneId?: string;
  sceneName?: string;
};

export class SwitchBotApiError extends Error {
  constructor(
    readonly kind: "api" | "auth" | "configuration" | "network" | "rate-limit",
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "SwitchBotApiError";
  }
}

export async function listHome(): Promise<{
  devices: RemoteDevice[];
  scenes: RemoteScene[];
}> {
  const [deviceBody, sceneBody] = await Promise.all([
    requestSwitchBot<DeviceListBody>("/v1.1/devices"),
    requestSwitchBot<SceneBody[]>("/v1.1/scenes"),
  ]);

  const physical = (deviceBody.deviceList ?? []).map((device) => toRemoteDevice(device, false));
  const infrared = (deviceBody.infraredRemoteList ?? []).map((device) =>
    toRemoteDevice(device, true),
  );

  const devices = [...physical, ...infrared].filter(
    (device): device is RemoteDevice => device !== null,
  );
  const devicesWithBotModes = await Promise.all(devices.map(resolveBotControls));

  return {
    devices: devicesWithBotModes,
    scenes: (Array.isArray(sceneBody) ? sceneBody : [])
      .filter((scene) => scene.sceneId && scene.sceneName)
      .map((scene) => ({ name: scene.sceneName!, sceneId: scene.sceneId! })),
  };
}

export async function getDeviceStatus(deviceId: string): Promise<{
  deviceMode?: string;
  lockState?: string;
  power?: string;
}> {
  const body = await requestSwitchBot<Record<string, unknown>>(
    `/v1.1/devices/${encodeURIComponent(deviceId)}/status`,
  );

  return {
    deviceMode: typeof body.deviceMode === "string" ? body.deviceMode : undefined,
    lockState: typeof body.lockState === "string" ? body.lockState : undefined,
    power: typeof body.power === "string" ? body.power : undefined,
  };
}

export async function sendDeviceCommand(
  deviceId: string,
  command: DeviceControl["command"],
): Promise<void> {
  await requestSwitchBot(`/v1.1/devices/${encodeURIComponent(deviceId)}/commands`, {
    body: { command, commandType: "command", parameter: "default" },
    method: "POST",
  });
}

export async function executeScene(sceneId: string): Promise<void> {
  await requestSwitchBot(`/v1.1/scenes/${encodeURIComponent(sceneId)}/execute`, {
    body: {},
    method: "POST",
  });
}

export async function createSignature(
  token: string,
  secret: string,
  timestamp: number,
  nonce: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${token}${timestamp}${nonce}`),
  );

  return bytesToBase64(new Uint8Array(signature));
}

async function requestSwitchBot<T = unknown>(
  path: string,
  init: { body?: unknown; method?: "GET" | "POST" } = {},
): Promise<T> {
  const token = process.env.SWITCHBOT_TOKEN?.trim();
  const secret = process.env.SWITCHBOT_SECRET?.trim();
  if (!token || !secret) {
    throw new SwitchBotApiError(
      "configuration",
      "Mac側にSwitchBotのTokenとSecretが設定されていません。",
    );
  }

  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const sign = await createSignature(token, secret, timestamp, nonce);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        Authorization: token,
        "Content-Type": "application/json; charset=utf-8",
        nonce,
        sign,
        t: String(timestamp),
      },
      method: init.method ?? "GET",
    });
  } catch {
    throw new SwitchBotApiError("network", "SwitchBotに接続できませんでした。");
  }

  const payload = await parseResponse<T>(response);
  if (response.status === 401 || response.status === 403) {
    throw new SwitchBotApiError("auth", "SwitchBotの認証に失敗しました。", response.status);
  }
  if (response.status === 429) {
    throw new SwitchBotApiError("rate-limit", "SwitchBot APIの利用上限に達しました。", 429);
  }
  if (!response.ok) {
    throw new SwitchBotApiError(
      "api",
      payload.message || "SwitchBot APIでエラーが発生しました。",
      response.status,
    );
  }

  const statusCode = Number(payload.statusCode);
  if (Number.isFinite(statusCode) && statusCode !== 100) {
    const kind = statusCode === 401 || statusCode === 403 ? "auth" : "api";
    throw new SwitchBotApiError(
      kind,
      payload.message || "SwitchBot APIでエラーが発生しました。",
      statusCode,
    );
  }

  return (payload.body ?? {}) as T;
}

async function parseResponse<T>(response: Response): Promise<SwitchBotResponse<T>> {
  try {
    return (await response.json()) as SwitchBotResponse<T>;
  } catch {
    return {};
  }
}

function toRemoteDevice(device: SwitchBotDevice, isInfrared: boolean): RemoteDevice | null {
  const deviceId = device.deviceId?.trim();
  const name = device.deviceName?.trim();
  const type = (isInfrared ? device.remoteType : device.deviceType)?.trim();
  if (!deviceId || !name || !type) return null;

  return {
    controls: controlsFor(type, isInfrared, device.enableCloudService !== false),
    deviceId,
    isInfrared,
    name,
    provider: "switchbot",
    type,
  };
}

export function controlsFor(
  type: string,
  isInfrared: boolean,
  cloudEnabled: boolean,
  deviceMode?: string,
): DeviceControl[] {
  if (!cloudEnabled) return [];
  if (/^DIY\s+Others/i.test(type)) return [];

  if (type === "Bot") {
    if (deviceMode === "switchMode") {
      return [
        { command: "turnOn", label: "ON", tone: "primary" },
        { command: "turnOff", label: "OFF", tone: "neutral" },
      ];
    }
    if (deviceMode === "pressMode" || deviceMode === "customizeMode") {
      return [{ command: "press", label: "押す", tone: "primary" }];
    }
    return [
      { command: "press", label: "押す", tone: "primary" },
      { command: "turnOn", label: "ON", tone: "primary" },
      { command: "turnOff", label: "OFF", tone: "neutral" },
    ];
  }

  if (/^Curtain/i.test(type) || /^Blind Tilt/i.test(type)) {
    return [
      { command: "turnOn", label: "開く", tone: "primary" },
      { command: "turnOff", label: "閉じる", tone: "neutral" },
    ];
  }

  if (/Lock/i.test(type)) {
    const controls: DeviceControl[] = [{ command: "lock", label: "施錠", tone: "neutral" }];
    if (ownerAccessCodeIsConfigured()) {
      controls.push({ command: "unlock", label: "解錠", tone: "danger" });
    }
    return controls;
  }

  if (isInfrared || /(Plug|Light|Bulb|Humidifier|Purifier|Fan|Vacuum)/i.test(type)) {
    return [
      { command: "turnOn", label: "ON", tone: "primary" },
      { command: "turnOff", label: "OFF", tone: "neutral" },
    ];
  }

  return [];
}

async function resolveBotControls(device: RemoteDevice): Promise<RemoteDevice> {
  if (device.type !== "Bot" || device.controls.length === 0) return device;

  try {
    const status = await getDeviceStatus(device.deviceId);
    return {
      ...device,
      controls: controlsFor(device.type, false, true, status.deviceMode),
      power: status.power,
    };
  } catch {
    return device;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
