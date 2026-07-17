import { describe, expect, it } from "vitest";

import { resolvePowerToggle } from "../lib/power-toggle";

const controls = [
  { command: "turnOn", label: "ON" },
  { command: "turnOff", label: "OFF" },
];

describe("resolvePowerToggle", () => {
  it("turns an on light off", () => {
    expect(resolvePowerToggle({ controls, isInfrared: false, type: "Light" }, "on")).toMatchObject({
      control: { command: "turnOff" },
      label: "ON",
      state: "on",
    });
  });

  it("shows an unknown light state and uses ON as the first action", () => {
    expect(resolvePowerToggle({ controls, isInfrared: false, type: "Light" })).toMatchObject({
      control: { command: "turnOn" },
      label: "不明",
      nextLabel: "ON",
      state: "unknown",
    });
  });

  it("does not turn an air conditioner into a power toggle", () => {
    expect(resolvePowerToggle({ controls, type: "Air Conditioner" }, "off")).toBeNull();
  });

  it("keeps both controls visible for an infrared light", () => {
    expect(resolvePowerToggle({ controls, isInfrared: true, type: "Light" }, "on")).toBeNull();
  });
});
