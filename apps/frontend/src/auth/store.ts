import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { Api } from "../api/Api";
import { loadSession, saveSession, clearSession, type PersistedSession } from "../storage/session";

// Session *validation* against the backend happens in proxy.ts, before
// "/" or "/login" ever render — not here. By the time this store hydrates,
// any session cookie present is already known-good (or already cleared).

// ─── States ────────────────────────────────────────────────────────────────────

export type AuthLoggedOut = { type: "loggedOut" };
export type AuthLoggedIn = { type: "loggedIn"; token: string; email: string };

export type AuthState = AuthLoggedOut | AuthLoggedIn;

// ─── Store ─────────────────────────────────────────────────────────────────────

export type AuthStore = {
  state: AuthState;

  /**
   * Read the persisted session cookie (if any) into state. Must run
   * client-side, after mount — `document` isn't available during SSR, and
   * reading it at store-creation time (module-eval time) would make the
   * client's first render disagree with the server-rendered HTML, breaking
   * hydration. Until this runs, state reads as LoggedOut everywhere. A
   * synchronous local parse, not a network call — validation already
   * happened in proxy.ts before this page rendered.
   */
  hydrate: () => void;

  /** Record a successful login: persists the session and moves to LoggedIn. */
  login: (session: PersistedSession) => void;

  /** Log out and forget the session. Valid from: LoggedIn. */
  logout: () => void;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function stateFromPersisted(session: PersistedSession | null): AuthState {
  return session ? { type: "loggedIn", token: session.token, email: session.email } : { type: "loggedOut" };
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createAuthStore() {
  return createStore<AuthStore>((set, get) => ({
    state: { type: "loggedOut" },

    hydrate() {
      set({ state: stateFromPersisted(loadSession()) });
    },

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
  }));
}

export const authStore = createAuthStore();

export function useAuth<T>(selector: (s: AuthStore) => T): T {
  return useStore(authStore, selector);
}
