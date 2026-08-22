import { createStore } from "zustand/vanilla";
import { requestOtp, verifyOtp, checkSession, logoutRequest } from "./api";
import { loadSession, saveSession, clearSession, type PersistedSession } from "../storage/session";
import { pullLevelStats } from "../sync/pull";
import { mergeRemoteLevelStats } from "../storage/levelStats";

// ─── States ────────────────────────────────────────────────────────────────────

export type AuthIdle = { type: "idle" };

export type AuthEnteringEmail = {
  type: "enteringEmail";
  submitting: boolean;
  error: string | null;
};

export type AuthEnteringCode = {
  type: "enteringCode";
  email: string;
  submitting: boolean;
  error: string | null;
};

export type AuthLoggedIn = { type: "loggedIn"; token: string; email: string };

export type AuthState = AuthIdle | AuthEnteringEmail | AuthEnteringCode | AuthLoggedIn;

// ─── Store ─────────────────────────────────────────────────────────────────────

export type AuthStore = {
  state: AuthState;

  /**
   * When the last LevelStats pull+merge completed, or null if none yet.
   * Components rendering local LevelStats (e.g. LevelSelection) should
   * depend on this to know when to re-read local storage — the merge
   * happens in the background after login, so a one-time read on mount
   * can miss it.
   */
  levelStatsSyncedAt: number | null;

  /** Begin the login flow. Valid from: Idle. */
  startLogin: () => void;

  /** Request an OTP for an email. Valid from: EnteringEmail. */
  requestCode: (email: string) => Promise<void>;

  /** Verify the OTP and, on success, log in. Valid from: EnteringCode. */
  verifyCode: (code: string) => Promise<void>;

  /** Log out and forget the session. Valid from: LoggedIn. */
  logout: () => void;

  /** Abandon the login flow and return to Idle. */
  cancel: () => void;

  /** Confirm a persisted session is still valid server-side; clears it if not. */
  restoreSession: () => Promise<void>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function stateFromPersisted(session: PersistedSession | null): AuthState {
  return session ? { type: "loggedIn", token: session.token, email: session.email } : { type: "idle" };
}

/** Pull the User's remote LevelStats and merge them into local storage. Best-effort. */
async function syncFromRemote(token: string, onSynced: () => void): Promise<void> {
  const remote = await pullLevelStats(token);
  if (remote) {
    mergeRemoteLevelStats(remote);
    onSynced();
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createAuthStore() {
  return createStore<AuthStore>((set, get) => ({
    state: stateFromPersisted(loadSession()),
    levelStatsSyncedAt: null,

    startLogin() {
      const { state } = get();
      if (state.type !== "idle") return;
      set({ state: { type: "enteringEmail", submitting: false, error: null } });
    },

    async requestCode(email) {
      const { state } = get();
      if (state.type !== "enteringEmail") return;
      set({ state: { ...state, submitting: true, error: null } });

      const result = await requestOtp(email);
      // The user may have cancelled (or moved on) while this was in flight —
      // don't resurrect a login flow they already backed out of.
      if (get().state.type !== "enteringEmail") return;

      if (result.ok) {
        set({ state: { type: "enteringCode", email, submitting: false, error: null } });
      } else {
        set({ state: { type: "enteringEmail", submitting: false, error: result.error } });
      }
    },

    async verifyCode(code) {
      const { state } = get();
      if (state.type !== "enteringCode") return;
      set({ state: { ...state, submitting: true, error: null } });

      const result = await verifyOtp(state.email, code);
      if (get().state.type !== "enteringCode") return;

      if (result.ok) {
        saveSession({ token: result.token, email: state.email });
        set({ state: { type: "loggedIn", token: result.token, email: state.email } });
        void syncFromRemote(result.token, () => set({ levelStatsSyncedAt: Date.now() }));
      } else {
        set({ state: { ...state, submitting: false, error: result.error } });
      }
    },

    logout() {
      const { state } = get();
      if (state.type !== "loggedIn") return;
      void logoutRequest(state.token);
      clearSession();
      set({ state: { type: "idle" } });
    },

    cancel() {
      set({ state: { type: "idle" } });
    },

    async restoreSession() {
      const { state } = get();
      if (state.type !== "loggedIn") return;

      const valid = await checkSession(state.token);
      if (!valid) {
        clearSession();
        set({ state: { type: "idle" } });
      } else {
        void syncFromRemote(state.token, () => set({ levelStatsSyncedAt: Date.now() }));
      }
    },
  }));
}
