export type PowerToggleState = "off" | "on" | "unknown";

type CommandControl = {
  command: string;
};

export type PowerToggle<T extends CommandControl> = {
  control: T;
  label: "OFF" | "ON" | "不明";
  nextLabel: "OFF" | "ON";
  state: PowerToggleState;
};

export function resolvePowerToggle<T extends CommandControl>(
  device: { controls: T[]; isInfrared?: boolean; type: string },
  power?: string,
): PowerToggle<T> | null {
  if (!supportsPowerToggle(device)) return null;

  const normalizedPower = power?.toLowerCase();
  const state: PowerToggleState =
    normalizedPower === "on" || normalizedPower === "off" ? normalizedPower : "unknown";
  const nextCommand = state === "on" ? "turnOff" : "turnOn";
  const control = device.controls.find((item) => item.command === nextCommand);
  if (!control) return null;

  return {
    control,
    label: state === "unknown" ? "不明" : state === "on" ? "ON" : "OFF",
    nextLabel: state === "on" ? "OFF" : "ON",
    state,
  };
}

function supportsPowerToggle(device: { isInfrared?: boolean; type: string }): boolean {
  if (device.isInfrared) return false;
  return /^(Bot|Light|Color Bulb|Plug(?: Mini)?)/i.test(device.type);
}
