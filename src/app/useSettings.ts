import { useCallback, useState } from "react";
import { type AppSettings, loadSettings, saveSettings } from "../settings/settings";

/** App settings, persisted on every change. `storageOk` is false when the browser refuses to store them. */
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [storageOk, setStorageOk] = useState(true);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    setStorageOk(saveSettings(next));
  }, []);

  return { settings, updateSettings, storageOk };
}
