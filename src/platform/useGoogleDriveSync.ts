import { useEffect } from "react";
import { getGoogleAccountStatus, pushDriveSnapshot, restoreDriveSnapshot } from "./google-client";
import { collectReadVerseSnapshot, markSnapshotUpdated } from "./storage";

export function useGoogleDriveSync() {
  useEffect(() => {
    let active = true;
    let connected = false;
    let timer = 0;

    async function initialise() {
      try {
        const account = await getGoogleAccountStatus();
        connected = account.connected;
        if (!connected) return;
        const restored = await restoreDriveSnapshot();
        if (restored && active && sessionStorage.getItem("readverse.remote-restored") !== "1") {
          sessionStorage.setItem("readverse.remote-restored", "1");
          window.location.reload();
        }
      } catch (error) {
        console.warn("ReadVerse Google sync initialisation failed", error);
      }
    }

    async function push() {
      if (!connected || !active) return;
      try {
        const snapshot = collectReadVerseSnapshot();
        const result = await pushDriveSnapshot(snapshot);
        markSnapshotUpdated(result.updatedAt);
      } catch (error) {
        console.warn("ReadVerse Google sync failed", error);
      }
    }

    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void push(), 1800);
    }

    window.addEventListener("readverse:state-changed", schedule);
    void initialise();
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("readverse:state-changed", schedule);
    };
  }, []);
}
