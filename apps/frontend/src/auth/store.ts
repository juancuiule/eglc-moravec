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

/** The session token for any session at all — anonymous or logged in — or null while LoggedOut. */
export function authToken(state: AuthState): string | null {
  return state.type === "logged-out" ? null : state.token;
}

export type AuthStore = {
  state: AuthState;
  hydrate: () => void;
  ensureSession: () => Promise<void>;
  loginAnonymous: (session: { token: string }) => void;
  login: (session: { token: string; email: string }) => void;
  logout: () => void;
};

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
        get().loginAnonymous({ token: session.token });
      } catch {
        // best-effort; trials just stay local-only until this succeeds, same as before this existed
      }
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
      void Api.logout(state.token).catch(() => {
        // best-effort; local logout proceeds regardless of network state
      });
      clearSession();
      set({ state: { type: "logged-out" } });
    },
  }));
}

export const authStore = createAuthStore();

export function useAuth<T>(selector: (s: AuthStore) => T): T {
  return useStore(authStore, selector);
}
