import type { RemoteDevice } from "./switchbot";

export type BatchActionInput = {
  deviceIds: string[];
  name: string;
};

export function batchEligibleDevices(devices: RemoteDevice[]): RemoteDevice[] {
  return devices.filter(
    (device) =>
      device.provider === "switchbot" &&
      device.controls.some((control) => control.command === "turnOff"),
  );
}

export function normalizeBatchActionInput(name: unknown, deviceIds: unknown): BatchActionInput {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 40) {
    throw new TypeError("一括操作名は1〜40文字で入力してください。");
  }
  if (!Array.isArray(deviceIds) || deviceIds.length === 0 || deviceIds.length > 30) {
    throw new TypeError("一括OFFする機器を1〜30台選択してください。");
  }

  const normalizedDeviceIds = [
    ...new Set(
      deviceIds.map((deviceId) => {
        if (typeof deviceId !== "string" || !deviceId.trim()) {
          throw new TypeError("一括操作の対象機器が不正です。");
        }
        return deviceId.trim();
      }),
    ),
  ];
  return { deviceIds: normalizedDeviceIds, name: name.trim() };
}
