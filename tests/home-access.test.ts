import { describe, expect, it } from "vitest";

import { buildHomeResponse } from "../lib/home-access";

const inventory = {
  devices: [
    {
      controls: [],
      deviceId: "device-visible",
      isInfrared: false,
      name: "Visible Device",
      provider: "switchbot" as const,
      type: "Bot",
    },
    {
      controls: [],
      deviceId: "device-private",
      isInfrared: false,
      name: "Private Device",
      provider: "switchbot" as const,
      type: "Bot",
    },
  ],
  scenes: [
    { name: "Visible Scene", sceneId: "scene-visible" },
    { name: "Private Scene", sceneId: "scene-private" },
  ],
};

const selection = {
  deviceIds: ["device-visible"],
  sceneIds: ["scene-visible"],
};

describe("home access", () => {
  it("returns only published items to guests", () => {
    const response = buildHomeResponse(inventory, selection, "guest");
    expect(response.devices.map((device) => device.deviceId)).toEqual(["device-visible"]);
    expect(response.scenes.map((scene) => scene.sceneId)).toEqual(["scene-visible"]);
    expect(response).not.toHaveProperty("availableDevices");
    expect(response).not.toHaveProperty("availableScenes");
  });

  it("returns the private inventory only to owners", () => {
    const response = buildHomeResponse(inventory, selection, "owner");
    expect(response).toHaveProperty("availableDevices", inventory.devices);
    expect(response).toHaveProperty("availableScenes", inventory.scenes);
  });

  it("does not expose unlock controls to guests", () => {
    const lockInventory = {
      ...inventory,
      devices: [
        {
          ...inventory.devices[0],
          controls: [
            { command: "lock" as const, label: "施錠", tone: "neutral" as const },
            { command: "unlock" as const, label: "解錠", tone: "danger" as const },
          ],
        },
      ],
    };

    const response = buildHomeResponse(lockInventory, selection, "guest");
    expect(response.devices[0]?.controls.map((control) => control.command)).toEqual(["lock"]);
  });
});
