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
// can give the outbox a bounded dying-token push and wipe local data —
// without auth importing sync code (cycle). Called with the pre-clear
// token; resolves once the wipe and push attempt have settled, so logout
// can revoke the token only after the push had its shot. (Internal order
// is snapshot → wipe → push-from-memory; see the engine's comment.)
let logoutHook: ((token: string) => Promise<void>) | null = null;
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
      const token = state.token;
      clearSession();
      set({ state: { type: "logged-out" } });
      void get().ensureSession();
      // Sequenced in the background: the outbox gets a bounded shot at
      // pushing pending rows under the account token, then the token is
      // revoked server-side. Firing Api.logout concurrently would let the
      // revoke race ahead of the push and 401 it — discarding runs that
      // never left the device.
      void Promise.resolve(logoutHook?.(token)).finally(() => {
        void Api.logout(token).catch(() => {
          // best-effort; local logout proceeds regardless of network state
        });
      });
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
