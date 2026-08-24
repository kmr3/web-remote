import {
  deleteBatchAction,
  readBatchAction,
  readBatchActions,
  saveBatchAction,
} from "@/db/batch-actions";
import { isPublished, readPublishedSelection, replacePublishedSelection } from "@/db/selection";
import { readDevicePowerStates, saveDevicePowerState } from "@/db/device-power-state";
import {
  AccessExpiredError,
  authenticateRequest,
  AuthConfigurationError,
  type UserRole,
} from "@/lib/auth";
import { batchEligibleDevices, normalizeBatchActionInput } from "@/lib/batch-actions";
import { buildHomeResponse } from "@/lib/home-access";
import {
  configuredSesameDevice,
  getSesameStatus,
  isConfiguredSesameDevice,
  sendSesameCommand,
  SesameApiError,
} from "@/lib/sesame";
import {
  executeScene,
  getDeviceStatus,
  listHome,
  sendDeviceCommand,
  SwitchBotApiError,
  type DeviceControl,
} from "@/lib/switchbot";

const ALLOWED_COMMANDS = new Set<DeviceControl["command"]>([
  "lock",
  "press",
  "turnOff",
  "turnOn",
  "unlock",
]);

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (authorization instanceof Response) return authorization;

  const url = new URL(request.url);
  try {
    if (url.searchParams.get("action") === "status") {
      const deviceId = requiredValue(url.searchParams.get("deviceId"), "deviceId");
      if (!(await isPublished("device", deviceId))) return notPublishedResponse();
      if (isConfiguredSesameDevice(deviceId)) return Response.json(await getSesameStatus());
      return Response.json(await getDeviceStatus(deviceId));
    }

    return Response.json(await homeResponse(authorization.role));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorize(request);
  if (authorization instanceof Response) return authorization;

  try {
    const payload = (await request.json()) as {
      action?: unknown;
      actionId?: unknown;
      command?: unknown;
      deviceId?: unknown;
      deviceIds?: unknown;
      name?: unknown;
      sceneId?: unknown;
      sceneIds?: unknown;
    };

    if (payload.action === "save-batch-action") {
      if (authorization.role !== "owner") return ownerOnlyResponse();
      const input = normalizeBatchActionInput(payload.name, payload.deviceIds);
      const available = await listAvailableHome(false);
      const eligibleIds = new Set(
        batchEligibleDevices(available.devices).map((device) => device.deviceId),
      );
      if (input.deviceIds.some((deviceId) => !eligibleIds.has(deviceId))) {
        return Response.json(
          { error: "一括OFFに対応していない機器が含まれています。" },
          { status: 400 },
        );
      }
      const actionId =
        typeof payload.actionId === "string" && payload.actionId.trim()
          ? payload.actionId.trim()
          : undefined;
      return Response.json({
        actionId: await saveBatchAction({ ...input, actionId }),
        ok: true,
      });
    }

    if (payload.action === "delete-batch-action") {
      if (authorization.role !== "owner") return ownerOnlyResponse();
      await deleteBatchAction(requiredValue(payload.actionId, "actionId"));
      return Response.json({ ok: true });
    }

    if (payload.action === "run-batch-action") {
      const actionId = requiredValue(payload.actionId, "actionId");
      const batchAction = await readBatchAction(actionId);
      if (!batchAction) {
        return Response.json({ error: "一括操作が見つかりません。" }, { status: 404 });
      }
      const results = await Promise.allSettled(
        batchAction.deviceIds.map(async (deviceId) => {
          await sendDeviceCommand(deviceId, "turnOff");
          await saveDevicePowerState(deviceId, "off");
        }),
      );
      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - successCount;
      const successDeviceIds = batchAction.deviceIds.filter(
        (_deviceId, index) => results[index]?.status === "fulfilled",
      );
      if (failedCount > 0) {
        console.warn(`[SwitchBot] Batch OFF partially failed (${failedCount}/${results.length})`);
      }
      return Response.json({
        failedCount,
        ok: failedCount === 0,
        successCount,
        successDeviceIds,
      });
    }

    if (payload.action === "save-selection") {
      if (authorization.role !== "owner") return ownerOnlyResponse();
      const requestedDeviceIds = stringArray(payload.deviceIds, "deviceIds");
      const requestedSceneIds = stringArray(payload.sceneIds, "sceneIds");
      const available = await listAvailableHome(false);
      const validDeviceIds = new Set(available.devices.map((device) => device.deviceId));
      const validSceneIds = new Set(available.scenes.map((scene) => scene.sceneId));
      await replacePublishedSelection({
        deviceIds: requestedDeviceIds.filter((id) => validDeviceIds.has(id)),
        sceneIds: requestedSceneIds.filter((id) => validSceneIds.has(id)),
      });
      return Response.json({ ok: true });
    }

    if (payload.action === "scene") {
      const sceneId = requiredValue(payload.sceneId, "sceneId");
      if (!(await isPublished("scene", sceneId))) return notPublishedResponse();
      await executeScene(sceneId);
      return Response.json({ ok: true });
    }

    if (payload.action === "command") {
      const command = requiredValue(payload.command, "command") as DeviceControl["command"];
      if (!ALLOWED_COMMANDS.has(command)) {
        return Response.json({ error: "この操作には対応していません。" }, { status: 400 });
      }
      const deviceId = requiredValue(payload.deviceId, "deviceId");
      if (!(await isPublished("device", deviceId))) return notPublishedResponse();
      if (command === "unlock" && authorization.role !== "owner") {
        return ownerOnlyResponse("解錠は管理者だけが実行できます。");
      }
      if (isConfiguredSesameDevice(deviceId)) {
        if (command !== "lock" && command !== "unlock") {
          return Response.json({ error: "このSESAME操作には対応していません。" }, { status: 400 });
        }
        await sendSesameCommand(command);
        return Response.json({ ok: true });
      }
      await sendDeviceCommand(deviceId, command);
      if (command === "turnOn" || command === "turnOff") {
        await saveDevicePowerState(deviceId, command === "turnOn" ? "on" : "off");
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: "操作内容が不正です。" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

async function homeResponse(role: UserRole) {
  const [available, selection, powerStates, batchActions] = await Promise.all([
    listAvailableHome(true),
    readPublishedSelection(),
    readDevicePowerStates(),
    readBatchActions(),
  ]);
  const home = buildHomeResponse(
    {
      ...available,
      devices: available.devices.map((device) => ({
        ...device,
        power: device.power ?? powerStates[device.deviceId],
      })),
    },
    selection,
    role,
  );
  const common = {
    ...home,
    batchActions: batchActions.map((action) => ({
      actionId: action.actionId,
      deviceCount: action.deviceIds.length,
      name: action.name,
    })),
  };
  if (role === "guest") return common;
  return {
    ...common,
    batchActionDefinitions: batchActions,
    batchEligibleDevices: batchEligibleDevices(available.devices),
  };
}

async function listAvailableHome(includeSesameStatus: boolean) {
  const available = await listHome();
  const sesameDevice = configuredSesameDevice();
  if (!sesameDevice) return available;

  if (includeSesameStatus) {
    try {
      const status = await getSesameStatus();
      sesameDevice.batteryPercentage = status.batteryPercentage;
      sesameDevice.lockState = status.lockState;
    } catch (error) {
      logSesameError(error);
    }
  }

  return { ...available, devices: [...available.devices, sesameDevice] };
}

async function authorize(request: Request): Promise<{ role: UserRole } | Response> {
  try {
    const role = await authenticateRequest(request);
    if (role) return { role };
    return Response.json(
      { code: "pin-required", error: "アクセスコードが違います。" },
      { status: 401 },
    );
  } catch (error) {
    if (error instanceof AccessExpiredError) {
      return Response.json({ code: "access-expired", error: error.message }, { status: 410 });
    }
    if (error instanceof AuthConfigurationError) {
      return Response.json({ code: "owner-pin-missing", error: error.message }, { status: 503 });
    }
    throw error;
  }
}

function requiredValue(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > 200) throw new TypeError(`${name} is invalid`);
  return [...new Set(value.map((item) => requiredValue(item, name)))];
}

function ownerOnlyResponse(message = "この設定は管理者だけが変更できます。"): Response {
  return Response.json({ code: "owner-only", error: message }, { status: 403 });
}

function notPublishedResponse(): Response {
  return Response.json(
    { code: "not-published", error: "この項目は利用できません。" },
    { status: 403 },
  );
}

function errorResponse(error: unknown): Response {
  if (error instanceof TypeError) {
    return Response.json({ error: "必要な情報が不足しています。" }, { status: 400 });
  }
  if (error instanceof SwitchBotApiError) {
    console.warn(`[SwitchBot] ${error.kind}: ${error.message} (${error.statusCode ?? "n/a"})`);
    const status =
      error.kind === "rate-limit"
        ? 429
        : error.kind === "configuration" || error.kind === "network"
          ? 503
          : 502;
    return Response.json({ code: error.kind, error: error.message }, { status });
  }
  if (error instanceof SesameApiError) {
    logSesameError(error);
    const status =
      error.kind === "auth"
        ? 401
        : error.kind === "device"
          ? 404
          : error.kind === "rate-limit"
            ? 429
            : error.kind === "configuration" || error.kind === "network"
              ? 503
              : 502;
    return Response.json({ code: `sesame-${error.kind}`, error: error.message }, { status });
  }

  console.error("[SwitchBot] Unexpected server error");
  return Response.json({ error: "予期しないエラーが発生しました。" }, { status: 500 });
}

function logSesameError(error: unknown): void {
  if (error instanceof SesameApiError) {
    console.warn(`[SESAME] ${error.kind}: ${error.message} (${error.statusCode ?? "n/a"})`);
    return;
  }
  console.warn("[SESAME] Unexpected status error");
}
