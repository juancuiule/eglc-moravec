import { randomId } from "../randomId";

const STORAGE_KEY = "moravec:deviceId";

/**
 * A stable id for this browser/device, minted once and kept for as long as
 * localStorage survives — independent of any session token, so a new
 * anonymous session minted after this one expires (or is upgraded away
 * from) still traces back to the same device. Never sent anywhere except
 * POST /auth/device, and never tied to a real identity unless the player
 * chooses to log in.
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = randomId();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}
