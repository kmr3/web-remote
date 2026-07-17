import { describe, expect, it } from "vitest";

import { batchEligibleDevices, normalizeBatchActionInput } from "../lib/batch-actions";
import type { RemoteDevice } from "../lib/switchbot";

const devices: RemoteDevice[] = [
  {
    controls: [
      { command: "turnOn", label: "ON", tone: "primary" },
      { command: "turnOff", label: "OFF", tone: "neutral" },
    ],
    deviceId: "light",
    isInfrared: true,
    name: "Light",
    provider: "switchbot",
    type: "Light",
  },
  {
    controls: [{ command: "lock", label: "施錠", tone: "neutral" }],
    deviceId: "sesame",
    isInfrared: false,
    name: "Front Door",
    provider: "sesame",
    type: "SESAME Smart Lock",
  },
];

describe("batch OFF actions", () => {
  it("offers only SwitchBot devices with turnOff support", () => {
    expect(batchEligibleDevices(devices).map((device) => device.deviceId)).toEqual(["light"]);
  });

  it("normalizes a name and removes duplicate device ids", () => {
    expect(normalizeBatchActionInput(" Night OFF ", ["light", "light"])).toEqual({
      deviceIds: ["light"],
      name: "Night OFF",
    });
  });

  it("requires at least one target device", () => {
    expect(() => normalizeBatchActionInput("Night OFF", [])).toThrow(/1〜30台/);
  });
});
