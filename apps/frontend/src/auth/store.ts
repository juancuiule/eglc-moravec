import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { Api } from "../api/Api";
import { getOrCreateDeviceId } from "../storage/deviceId";
import {
  clearSession,
  loadSession,
  saveSession,
  type PersistedSession,
} from "../storage/session";

export type AuthLoggedOut = {
  type: "logged-out";
};

export type AuthAnonymous = {
  type: "anonymous";
  token: string;
};

export type AuthLoggedIn = {
  type: "logged-in";
  token: string;
  email: string;
};

export type AuthState = AuthLoggedOut | AuthAnonymous | AuthLoggedIn;

export function authToken(state: AuthState): string | null {
  return state.type === "logged-out" ? null : state.token;
}

export type AuthStore = {
  state: AuthState;
  hydrate: () => void;
  ensureSession: () => Promise<void>;
  ensureSessionToken: () => Promise<string | null>;
  loginAnonymous: (session: { token: string }) => void;
  login: (session: { token: string; email: string }) => void;
  logout: () => void;
  // Drop the current session without calling Api.logout — used when the
  // backend has already rejected the token (401). The next ensureSession
  // re-mints an anonymous session against the stable device id.
  invalidateSession: () => void;
};

// Registered by the local-first sync engine (local/syncEngine.ts) so logout
// can best-effort flush the outbox with the dying token and then wipe local
// data — without auth importing sync code (cycle). Called with the pre-clear
// token, before the anonymous session is re-established.
let logoutHook: ((token: string) => void) | null = null;
export function setLogoutHook(hook: typeof logoutHook): void {
  logoutHook = hook;
}

function stateFromPersisted(session: PersistedSession | null): AuthState {
  if (!session) return { type: "logged-out" };
  return session.email === null
    ? { type: "anonymous", token: session.token }
    : { type: "logged-in", token: session.token, email: session.email };
}

export function createAuthStore() {
  return createStore<AuthStore>((set, get) => ({
    state: { type: "logged-out" },

    hydrate() {
      set({ state: stateFromPersisted(loadSession()) });
    },

    async ensureSession() {
      if (get().state.type !== "logged-out") return;
      try {
        const deviceId = getOrCreateDeviceId();
        const session = await Api.registerDevice(deviceId);
        if (get().state.type !== "logged-out") return;
        get().loginAnonymous({ token: session.token });
      } catch {
        // Best-effort. AuthBoot and result persistence can retry later.
      }
    },

    async ensureSessionToken() {
      await get().ensureSession();
      return authToken(get().state);
    },

    loginAnonymous(session) {
      saveSession({ token: session.token, email: null });
      set({ state: { type: "anonymous", token: session.token } });
    },

    login(session) {
      saveSession(session);
      set({
        state: {
          type: "logged-in",
          token: session.token,
          email: session.email,
        },
      });
    },

    logout() {
      const { state } = get();
      if (state.type !== "logged-in") return;
      // The outbox flush fires before Api.logout invalidates the token —
      // still a race (nothing is awaited), but it gives pending rows their
      // best shot at landing under the account identity.
      logoutHook?.(state.token);
      void Api.logout(state.token).catch(() => {
        // best-effort; local logout proceeds regardless of network state
      });
      clearSession();
      set({ state: { type: "logged-out" } });
      void get().ensureSession();
    },

    invalidateSession() {
      clearSession();
      set({ state: { type: "logged-out" } });
    },
  }));
}

export const authStore = createAuthStore();

export function useAuth<T>(selector: (s: AuthStore) => T): T {
  return useStore(authStore, selector);
}
