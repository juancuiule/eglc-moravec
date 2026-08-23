import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { Api } from "../api/Api";
import { loadSession, saveSession, clearSession, type PersistedSession } from "../storage/session";

// ─── States ────────────────────────────────────────────────────────────────────

export type AuthLoggedOut = { type: "loggedOut" };
export type AuthLoggedIn = { type: "loggedIn"; token: string; email: string };

export type AuthState = AuthLoggedOut | AuthLoggedIn;

// ─── Store ─────────────────────────────────────────────────────────────────────

export type AuthStore = {
  state: AuthState;

  /** Record a successful login: persists the session and moves to LoggedIn. */
  login: (session: PersistedSession) => void;

  /** Log out and forget the session. Valid from: LoggedIn. */
  logout: () => void;

  /** Confirm a persisted session is still valid server-side; clears it if not. */
  restoreSession: () => Promise<void>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function stateFromPersisted(session: PersistedSession | null): AuthState {
  return session ? { type: "loggedIn", token: session.token, email: session.email } : { type: "loggedOut" };
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createAuthStore() {
  return createStore<AuthStore>((set, get) => ({
    state: stateFromPersisted(loadSession()),

    login(session) {
      saveSession(session);
      set({ state: { type: "loggedIn", token: session.token, email: session.email } });
    },

    logout() {
      const { state } = get();
      if (state.type !== "loggedIn") return;
      void Api.logout(state.token).catch(() => {
        // best-effort; local logout proceeds regardless of network state
      });
      clearSession();
      set({ state: { type: "loggedOut" } });
    },

    async restoreSession() {
      const { state } = get();
      if (state.type !== "loggedIn") return;

      const valid = await Api.checkSession(state.token);
      if (!valid) {
        clearSession();
        set({ state: { type: "loggedOut" } });
      }
    },
  }));
}

export const authStore = createAuthStore();

export function useAuth<T>(selector: (s: AuthStore) => T): T {
  return useStore(authStore, selector);
}
