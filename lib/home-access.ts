import type { PublishedSelection } from "../db/selection";
import type { UserRole } from "./auth";
import type { RemoteDevice, RemoteScene } from "./switchbot";

type HomeInventory = {
  devices: RemoteDevice[];
  scenes: RemoteScene[];
};

export function buildHomeResponse(
  available: HomeInventory,
  selection: PublishedSelection,
  role: UserRole,
) {
  const selectedDeviceIds = new Set(selection.deviceIds);
  const selectedSceneIds = new Set(selection.sceneIds);
  const selectedDevices = available.devices.filter((device) =>
    selectedDeviceIds.has(device.deviceId),
  );
  const common = {
    devices:
      role === "guest"
        ? selectedDevices.map((device) => ({
            ...device,
            controls: device.controls.filter((control) => control.command !== "unlock"),
          }))
        : selectedDevices,
    role,
    scenes: available.scenes.filter((scene) => selectedSceneIds.has(scene.sceneId)),
  };

  if (role === "guest") return common;
  return {
    ...common,
    availableDevices: available.devices,
    availableScenes: available.scenes,
    selectedDeviceIds: selection.deviceIds,
    selectedSceneIds: selection.sceneIds,
  };
}
