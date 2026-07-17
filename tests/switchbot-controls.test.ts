import { describe, expect, it } from "vitest";

import { controlsFor } from "../lib/switchbot";

describe("Bot controls", () => {
  it("uses ON/OFF commands for switch mode", () => {
    expect(controlsFor("Bot", false, true, "switchMode").map((item) => item.command)).toEqual([
      "turnOn",
      "turnOff",
    ]);
  });

  it("uses press for press mode", () => {
    expect(controlsFor("Bot", false, true, "pressMode").map((item) => item.command)).toEqual([
      "press",
    ]);
  });

  it("does not expose controls when cloud access is disabled", () => {
    expect(controlsFor("Bot", false, false, "switchMode")).toEqual([]);
  });

  it("exposes ON/OFF controls for a DIY air conditioner", () => {
    expect(controlsFor("DIY Air Conditioner", true, true).map((item) => item.command)).toEqual([
      "turnOn",
      "turnOff",
    ]);
  });

  it("keeps DIY Others restricted to configured scenes", () => {
    expect(controlsFor("DIY Others", true, true)).toEqual([]);
  });
});
