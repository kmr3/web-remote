"use client";

import {
  AirVent,
  Check,
  CircleDot,
  HousePlug,
  Lightbulb,
  LockKeyhole,
  LogOut,
  MousePointer2,
  Plus,
  Power,
  PowerOff,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UnlockKeyhole,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { resolvePowerToggle } from "../lib/power-toggle";

type DeviceControl = {
  command: "lock" | "press" | "turnOff" | "turnOn" | "unlock";
  label: string;
  tone: "danger" | "neutral" | "primary";
};

type RemoteDevice = {
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

type RemoteScene = { name: string; sceneId: string };

type BatchActionSummary = {
  actionId: string;
  deviceCount: number;
  name: string;
};

type BatchActionDefinition = {
  actionId: string;
  deviceIds: string[];
  name: string;
};

type HomeData = {
  availableDevices?: RemoteDevice[];
  availableScenes?: RemoteScene[];
  batchActionDefinitions?: BatchActionDefinition[];
  batchActions: BatchActionSummary[];
  batchEligibleDevices?: RemoteDevice[];
  devices: RemoteDevice[];
  role: "guest" | "owner";
  scenes: RemoteScene[];
  selectedDeviceIds?: string[];
  selectedSceneIds?: string[];
};

type DeviceStatus = {
  batteryPercentage?: number;
  deviceMode?: string;
  lockState?: string;
  power?: string;
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const PIN_STORAGE_KEY = "switchbot-remote-pin";

export function RemoteApp() {
  const [home, setHome] = useState<HomeData | null>(null);
  const accessCodeRef = useRef("");
  const [pinInput, setPinInput] = useState("");
  const [needsPin, setNeedsPin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [statusByDevice, setStatusByDevice] = useState<Record<string, DeviceStatus>>({});
  const [toast, setToast] = useState("");
  const [managing, setManaging] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit, pinOverride?: string): Promise<T> => {
      const pin = pinOverride ?? accessCodeRef.current;
      const response = await fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(pin ? { "x-remote-pin": pin } : {}),
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new ApiError(payload.error ?? "操作に失敗しました。", response.status, payload.code);
      }
      return payload as T;
    },
    [],
  );

  const loadHome = useCallback(
    async (pinOverride?: string, quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const data = await request<HomeData>("/api/switchbot", undefined, pinOverride);
        setHome(data);
        setStatusByDevice(
          Object.fromEntries(
            data.devices
              .filter(
                (device) =>
                  device.power || device.lockState || device.batteryPercentage !== undefined,
              )
              .map((device) => [
                device.deviceId,
                {
                  batteryPercentage: device.batteryPercentage,
                  lockState: device.lockState,
                  power: device.power,
                },
              ]),
          ),
        );
        setSelectedDeviceIds(data.selectedDeviceIds ?? []);
        setSelectedSceneIds(data.selectedSceneIds ?? []);
        setNeedsPin(false);
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === "pin-required") {
          setNeedsPin(true);
          setHome(null);
          if (pinOverride) setError("アクセスコードが違います。");
        } else {
          setError(cause instanceof Error ? cause.message : "読み込みに失敗しました。");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [request],
  );

  useEffect(() => {
    const savedPin = window.localStorage.getItem(PIN_STORAGE_KEY) ?? "";
    accessCodeRef.current = savedPin;
    const timer = window.setTimeout(() => void loadHome(savedPin), 0);
    return () => window.clearTimeout(timer);
  }, [loadHome]);

  async function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pin = pinInput.trim();
    accessCodeRef.current = pin;
    window.localStorage.setItem(PIN_STORAGE_KEY, pin);
    await loadHome(pin);
  }

  function signOut() {
    window.localStorage.removeItem(PIN_STORAGE_KEY);
    accessCodeRef.current = "";
    setPinInput("");
    setHome(null);
    setError("");
    setManaging(false);
    setNeedsPin(true);
  }

  async function saveSelection() {
    setBusyId("selection");
    try {
      await request("/api/switchbot", {
        body: JSON.stringify({
          action: "save-selection",
          deviceIds: selectedDeviceIds,
          sceneIds: selectedSceneIds,
        }),
        method: "POST",
      });
      await loadHome(undefined, true);
      setManaging(false);
      showToast("表示する項目を更新しました");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "設定を保存できませんでした。", true);
    } finally {
      setBusyId("");
    }
  }

  async function runScene(sceneId: string, name: string) {
    setBusyId(sceneId);
    try {
      await request("/api/switchbot", {
        body: JSON.stringify({ action: "scene", sceneId }),
        method: "POST",
      });
      showToast(`${name}を実行しました`);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "シーンを実行できませんでした。", true);
    } finally {
      setBusyId("");
    }
  }

  async function runBatchAction(batchAction: BatchActionSummary) {
    setBusyId(`batch:${batchAction.actionId}`);
    try {
      const result = await request<{
        failedCount: number;
        successCount: number;
        successDeviceIds: string[];
      }>("/api/switchbot", {
        body: JSON.stringify({
          action: "run-batch-action",
          actionId: batchAction.actionId,
        }),
        method: "POST",
      });
      setStatusByDevice((current) => {
        const next = { ...current };
        for (const deviceId of result.successDeviceIds) {
          next[deviceId] = { ...next[deviceId], power: "off" };
        }
        return next;
      });
      if (result.failedCount > 0) {
        showToast(`${result.successCount}台をOFF、${result.failedCount}台は失敗しました。`, true);
      } else {
        showToast(`${batchAction.name}: ${result.successCount}台をOFFにしました`);
      }
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "一括OFFに失敗しました。", true);
    } finally {
      setBusyId("");
    }
  }

  async function createBatchAction(name: string, deviceIds: string[]): Promise<boolean> {
    setBusyId("batch:create");
    try {
      await request("/api/switchbot", {
        body: JSON.stringify({ action: "save-batch-action", deviceIds, name }),
        method: "POST",
      });
      await loadHome(undefined, true);
      showToast("一括OFFボタンを作成しました");
      return true;
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : "一括OFFボタンを作成できませんでした。",
        true,
      );
      return false;
    } finally {
      setBusyId("");
    }
  }

  async function removeBatchAction(actionId: string) {
    setBusyId(`batch:delete:${actionId}`);
    try {
      await request("/api/switchbot", {
        body: JSON.stringify({ action: "delete-batch-action", actionId }),
        method: "POST",
      });
      await loadHome(undefined, true);
      showToast("一括OFFボタンを削除しました");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "削除できませんでした。", true);
    } finally {
      setBusyId("");
    }
  }

  async function runCommand(device: RemoteDevice, control: DeviceControl) {
    setBusyId(device.deviceId);
    try {
      await request("/api/switchbot", {
        body: JSON.stringify({
          action: "command",
          command: control.command,
          deviceId: device.deviceId,
        }),
        method: "POST",
      });
      setStatusByDevice((current) => ({
        ...current,
        [device.deviceId]: optimisticStatus(
          current[device.deviceId] ?? { power: device.power },
          control.command,
        ),
      }));
      showToast(`${device.name}: ${control.label}`);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "操作に失敗しました。", true);
    } finally {
      setBusyId("");
    }
  }

  async function refreshStatus(device: RemoteDevice) {
    setBusyId(device.deviceId);
    try {
      const status = await request<DeviceStatus>(
        `/api/switchbot?action=status&deviceId=${encodeURIComponent(device.deviceId)}`,
      );
      setStatusByDevice((current) => ({ ...current, [device.deviceId]: status }));
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "状態を取得できませんでした。", true);
    } finally {
      setBusyId("");
    }
  }

  function showToast(message: string, isError = false) {
    setToast(`${isError ? "!" : ""}${message}`);
    window.setTimeout(() => setToast(""), 2800);
  }

  if (needsPin) {
    return (
      <main className="auth-shell">
        <form className="auth-panel" onSubmit={submitPin}>
          <div className="auth-icon" aria-hidden="true">
            <ShieldCheck size={28} />
          </div>
          <h1>SwitchBot Home</h1>
          <label htmlFor="access-code">アクセスコード</label>
          <input
            autoComplete="current-password"
            id="access-code"
            onChange={(event) => setPinInput(event.target.value)}
            type="password"
            value={pinInput}
          />
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "接続中..." : "ログイン"}
          </button>
        </form>
      </main>
    );
  }

  const isOwner = home?.role === "owner";
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">HOME CONTROL</p>
          <h1>SwitchBot Home</h1>
        </div>
        <div className="topbar-actions">
          {isOwner && (
            <button
              aria-label="表示項目を管理"
              className={`icon-button ${managing ? "active" : ""}`}
              onClick={() => setManaging((current) => !current)}
              title="表示項目を管理"
              type="button"
            >
              <Settings2 size={21} />
            </button>
          )}
          <button
            aria-label="再読み込み"
            className="icon-button"
            disabled={refreshing}
            onClick={() => void loadHome(undefined, true)}
            title="再読み込み"
            type="button"
          >
            <RefreshCw className={refreshing ? "spin" : ""} size={21} />
          </button>
          <button
            aria-label="ログアウト"
            className="icon-button"
            onClick={signOut}
            title="ログアウト"
            type="button"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="connection-line">
        <span className={error ? "connection-dot error" : "connection-dot"} />
        <span>{error ? "接続エラー" : loading ? "接続中" : "接続済み"}</span>
        {home && <span className="protected-label">{isOwner ? "管理者" : "利用者"}</span>}
      </div>

      {error && !home ? (
        <section className="error-panel">
          <RotateCcw size={26} />
          <h2>読み込めませんでした</h2>
          <p>{error}</p>
          <button className="secondary-button" onClick={() => void loadHome()} type="button">
            もう一度試す
          </button>
        </section>
      ) : (
        <>
          {isOwner && managing && (
            <SelectionManager
              availableDevices={home.availableDevices ?? []}
              availableScenes={home.availableScenes ?? []}
              batchActionDefinitions={home.batchActionDefinitions ?? []}
              batchEligibleDevices={home.batchEligibleDevices ?? []}
              busy={busyId === "selection"}
              busyId={busyId}
              onCreateBatchAction={createBatchAction}
              onDeleteBatchAction={(actionId) => void removeBatchAction(actionId)}
              onClose={() => setManaging(false)}
              onSave={() => void saveSelection()}
              selectedDeviceIds={selectedDeviceIds}
              selectedSceneIds={selectedSceneIds}
              setSelectedDeviceIds={setSelectedDeviceIds}
              setSelectedSceneIds={setSelectedSceneIds}
            />
          )}

          {(home?.batchActions.length ?? 0) > 0 && (
            <section className="section-block batch-section">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">QUICK OFF</p>
                  <h2>一括操作</h2>
                </div>
                <span className="count">{home?.batchActions.length ?? 0}</span>
              </div>
              <div className="batch-grid">
                {home?.batchActions.map((batchAction) => (
                  <button
                    className="batch-action-button"
                    disabled={busyId === `batch:${batchAction.actionId}`}
                    key={batchAction.actionId}
                    onClick={() => void runBatchAction(batchAction)}
                    type="button"
                  >
                    <PowerOff size={19} />
                    <span>
                      <strong>{batchAction.name}</strong>
                      <small>{batchAction.deviceCount}台</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="section-block scenes-section">
            <div className="section-heading">
              <div>
                <p className="section-kicker">SCENES</p>
                <h2>シーン</h2>
              </div>
              <SectionCount
                count={home?.scenes.length ?? 0}
                isOwner={isOwner}
                onAdd={setManaging}
              />
            </div>
            <div className="scene-grid" aria-busy={loading}>
              {loading && !home
                ? [0, 1, 2, 3].map((item) => <div className="scene-skeleton" key={item} />)
                : home?.scenes.map((scene) => (
                    <button
                      className="scene-button"
                      disabled={busyId === scene.sceneId}
                      key={scene.sceneId}
                      onClick={() => void runScene(scene.sceneId, scene.name)}
                      type="button"
                    >
                      <Sparkles size={18} />
                      <span>{scene.name}</span>
                    </button>
                  ))}
              {!loading && home?.scenes.length === 0 && (
                <p className="empty-message">表示中のシーンはありません</p>
              )}
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="section-kicker">DEVICES</p>
                <h2>デバイス</h2>
              </div>
              <SectionCount
                count={home?.devices.length ?? 0}
                isOwner={isOwner}
                onAdd={setManaging}
              />
            </div>
            <div className="device-list" aria-busy={loading}>
              {loading && !home
                ? [0, 1, 2].map((item) => <div className="device-skeleton" key={item} />)
                : home?.devices.map((device) => {
                    const deviceStatus = statusByDevice[device.deviceId] ?? {
                      batteryPercentage: device.batteryPercentage,
                      lockState: device.lockState,
                      power: device.power,
                    };
                    const powerToggle = resolvePowerToggle(device, deviceStatus.power);
                    const stateLabel = displayStatusLabel(device, deviceStatus);
                    return (
                      <article className="device-card" key={device.deviceId}>
                        <div className="device-main">
                          <div className={`device-icon ${lockIconClass(deviceStatus)}`}>
                            {deviceIcon(device.type)}
                          </div>
                          <div className="device-copy">
                            <h3>{device.name}</h3>
                            <p>
                              {device.type}
                              {stateLabel && (
                                <span className={`device-state ${statusClass(deviceStatus)}`}>
                                  {stateLabel}
                                </span>
                              )}
                              {deviceStatus.batteryPercentage !== undefined && (
                                <span className="device-battery">
                                  電池 {Math.round(deviceStatus.batteryPercentage)}%
                                </span>
                              )}
                            </p>
                          </div>
                          {!device.isInfrared && (
                            <button
                              aria-label={`${device.name}の状態を更新`}
                              className="status-button"
                              disabled={busyId === device.deviceId}
                              onClick={() => void refreshStatus(device)}
                              title="状態を更新"
                              type="button"
                            >
                              <RefreshCw size={17} />
                            </button>
                          )}
                        </div>
                        {powerToggle ? (
                          <div className="device-controls controls-1">
                            <button
                              aria-label={`${device.name}は${powerToggle.label}。タップで${powerToggle.nextLabel}`}
                              className={`control-button power-state-button state-${powerToggle.state}`}
                              disabled={busyId === device.deviceId}
                              onClick={() => void runCommand(device, powerToggle.control)}
                              type="button"
                            >
                              {powerToggle.state === "on" ? (
                                <Power size={18} />
                              ) : powerToggle.state === "off" ? (
                                <PowerOff size={18} />
                              ) : (
                                <CircleDot size={18} />
                              )}
                              <span>{powerToggle.label}</span>
                            </button>
                          </div>
                        ) : device.controls.length > 0 ? (
                          <div className={`device-controls controls-${device.controls.length}`}>
                            {device.controls.map((control) => (
                              <button
                                className={`control-button ${control.tone}`}
                                disabled={busyId === device.deviceId}
                                key={control.command}
                                onClick={() => void runCommand(device, control)}
                                type="button"
                              >
                                {controlIcon(control.command)}
                                <span>{control.label}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="scene-only">
                            {/^DIY\s/i.test(device.type) ? "シーンから操作" : "状態表示のみ"}
                          </p>
                        )}
                      </article>
                    );
                  })}
              {!loading && home?.devices.length === 0 && (
                <p className="empty-message">表示中のデバイスはありません</p>
              )}
            </div>
          </section>
        </>
      )}

      {toast && (
        <div className={`toast ${toast.startsWith("!") ? "toast-error" : ""}`} role="status">
          {toast.replace(/^!/, "")}
        </div>
      )}
    </main>
  );
}

type SelectionManagerProps = {
  availableDevices: RemoteDevice[];
  availableScenes: RemoteScene[];
  batchActionDefinitions: BatchActionDefinition[];
  batchEligibleDevices: RemoteDevice[];
  busy: boolean;
  busyId: string;
  onClose: () => void;
  onCreateBatchAction: (name: string, deviceIds: string[]) => Promise<boolean>;
  onDeleteBatchAction: (actionId: string) => void;
  onSave: () => void;
  selectedDeviceIds: string[];
  selectedSceneIds: string[];
  setSelectedDeviceIds: (ids: string[]) => void;
  setSelectedSceneIds: (ids: string[]) => void;
};

function SelectionManager(props: SelectionManagerProps) {
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [batchDeviceIds, setBatchDeviceIds] = useState<string[]>([]);

  async function submitBatchAction() {
    const created = await props.onCreateBatchAction(batchName, batchDeviceIds);
    if (!created) return;
    setBatchName("");
    setBatchDeviceIds([]);
    setCreatingBatch(false);
  }

  return (
    <section className="manager-section">
      <div className="manager-heading">
        <div>
          <p className="section-kicker">OWNER</p>
          <h2>表示する項目</h2>
        </div>
        <button
          aria-label="閉じる"
          className="status-button"
          onClick={props.onClose}
          title="閉じる"
          type="button"
        >
          <X size={18} />
        </button>
      </div>

      <h3 className="manager-subheading">一括OFFボタン</h3>
      <div className="batch-admin-list">
        {props.batchActionDefinitions.map((batchAction) => (
          <div className="batch-admin-row" key={batchAction.actionId}>
            <span>
              <strong>{batchAction.name}</strong>
              <small>{batchAction.deviceIds.length}台</small>
            </span>
            <button
              aria-label={`${batchAction.name}を削除`}
              className="status-button danger-icon"
              disabled={props.busyId === `batch:delete:${batchAction.actionId}`}
              onClick={() => props.onDeleteBatchAction(batchAction.actionId)}
              title="一括OFFボタンを削除"
              type="button"
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        {props.batchActionDefinitions.length === 0 && (
          <p className="manager-empty">作成済みの一括OFFボタンはありません</p>
        )}
      </div>

      {creatingBatch ? (
        <div className="batch-editor">
          <label htmlFor="batch-name">ボタン名</label>
          <input
            id="batch-name"
            maxLength={40}
            onChange={(event) => setBatchName(event.target.value)}
            placeholder="例: エアコン以外すべてOFF"
            type="text"
            value={batchName}
          />
          <p className="batch-editor-label">OFFにする機器</p>
          <div className="selection-list">
            {props.batchEligibleDevices.map((device) => (
              <SelectionRow
                checked={batchDeviceIds.includes(device.deviceId)}
                key={device.deviceId}
                label={device.name}
                onChange={(checked) =>
                  setBatchDeviceIds(toggleId(batchDeviceIds, device.deviceId, checked))
                }
                secondary={device.type}
              />
            ))}
          </div>
          <div className="batch-editor-actions">
            <button
              className="secondary-button"
              onClick={() => setCreatingBatch(false)}
              type="button"
            >
              キャンセル
            </button>
            <button
              className="save-button"
              disabled={props.busyId === "batch:create"}
              onClick={() => void submitBatchAction()}
              type="button"
            >
              {props.busyId === "batch:create" ? (
                <RefreshCw className="spin" size={18} />
              ) : (
                <Save size={18} />
              )}
              <span>作成</span>
            </button>
          </div>
        </div>
      ) : (
        <button className="new-batch-button" onClick={() => setCreatingBatch(true)} type="button">
          <Plus size={18} />
          <span>一括OFFボタンを作成</span>
        </button>
      )}

      <h3 className="manager-subheading">シーン</h3>
      <div className="selection-list">
        {props.availableScenes.map((scene) => (
          <SelectionRow
            checked={props.selectedSceneIds.includes(scene.sceneId)}
            key={scene.sceneId}
            label={scene.name}
            onChange={(checked) =>
              props.setSelectedSceneIds(toggleId(props.selectedSceneIds, scene.sceneId, checked))
            }
            secondary="シーン"
          />
        ))}
      </div>

      <h3 className="manager-subheading">デバイス</h3>
      <div className="selection-list">
        {props.availableDevices.map((device) => (
          <SelectionRow
            checked={props.selectedDeviceIds.includes(device.deviceId)}
            key={device.deviceId}
            label={device.name}
            onChange={(checked) =>
              props.setSelectedDeviceIds(
                toggleId(props.selectedDeviceIds, device.deviceId, checked),
              )
            }
            secondary={device.type}
          />
        ))}
      </div>

      <button className="save-button" disabled={props.busy} onClick={props.onSave} type="button">
        {props.busy ? <RefreshCw className="spin" size={18} /> : <Save size={18} />}
        <span>{props.busy ? "保存中..." : "保存"}</span>
      </button>
    </section>
  );
}

function SelectionRow(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  secondary: string;
}) {
  return (
    <label className="selection-row">
      <input
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="selection-check" aria-hidden="true">
        {props.checked && <Check size={15} />}
      </span>
      <span className="selection-copy">
        <strong>{props.label}</strong>
        <small>{props.secondary}</small>
      </span>
    </label>
  );
}

function SectionCount(props: { count: number; isOwner: boolean; onAdd: (open: boolean) => void }) {
  if (!props.isOwner) return <span className="count">{props.count}</span>;
  return (
    <button
      aria-label="表示項目を追加"
      className="add-button"
      onClick={() => props.onAdd(true)}
      title="表示項目を追加"
      type="button"
    >
      <Plus size={17} />
      <span>{props.count}</span>
    </button>
  );
}

function toggleId(current: string[], id: string, checked: boolean): string[] {
  if (checked) return current.includes(id) ? current : [...current, id];
  return current.filter((currentId) => currentId !== id);
}

function optimisticStatus(
  current: DeviceStatus | undefined,
  command: DeviceControl["command"],
): DeviceStatus {
  if (command === "turnOn") return { ...current, power: "on" };
  if (command === "turnOff") return { ...current, power: "off" };
  if (command === "lock") return { ...current, lockState: "locked" };
  if (command === "unlock") return { ...current, lockState: "unlocked" };
  return current ?? {};
}

function statusLabel(status: DeviceStatus | undefined): string {
  if (status?.lockState === "unlocked") return "解錠";
  if (status?.lockState === "locked") return "施錠";
  if (status?.lockState) return "状態不明";
  if (status?.power) return status.power.toLowerCase() === "on" ? "オン" : "オフ";
  return "";
}

function displayStatusLabel(device: RemoteDevice, status: DeviceStatus | undefined): string {
  if (device.isInfrared) return "";
  return statusLabel(status);
}

function statusClass(status: DeviceStatus | undefined): string {
  if (status?.lockState === "unlocked") return "unlocked";
  if (status?.lockState === "locked") return "locked";
  return "";
}

function lockIconClass(status: DeviceStatus | undefined): string {
  if (status?.lockState === "locked") return "lock-locked";
  if (status?.lockState === "unlocked") return "lock-unlocked";
  return "";
}

function controlIcon(command: DeviceControl["command"]) {
  if (command === "turnOn") return <Power size={18} />;
  if (command === "turnOff") return <PowerOff size={18} />;
  if (command === "lock") return <LockKeyhole size={18} />;
  if (command === "unlock") return <UnlockKeyhole size={18} />;
  return <MousePointer2 size={18} />;
}

function deviceIcon(type: string) {
  if (/Air Conditioner|Fan|Purifier/i.test(type)) return <AirVent size={21} />;
  if (/Light|Bulb/i.test(type)) return <Lightbulb size={21} />;
  if (/Plug/i.test(type)) return <HousePlug size={21} />;
  if (/Lock/i.test(type)) return <LockKeyhole size={21} />;
  if (/TV|Speaker|Remote/i.test(type)) return <Radio size={21} />;
  return <CircleDot size={21} />;
}
