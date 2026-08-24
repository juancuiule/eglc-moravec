import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { Api } from "../api/Api";
import { loadSession, saveSession, clearSession, type PersistedSession } from "../storage/session";
import { getOrCreateDeviceId } from "../storage/deviceId";

// Session *validation* against the backend happens in proxy.ts, before
// "/" or "/login" ever render — not here. By the time this store hydrates,
// any session cookie present is already known-good (or already cleared).

// ─── States ────────────────────────────────────────────────────────────────────

export type AuthLoggedOut = { type: "loggedOut" };
/** A low-friction device-id identity, minted automatically — no email ever given (ADR-0009). */
export type AuthAnonymous = { type: "anonymous"; token: string };
export type AuthLoggedIn = { type: "loggedIn"; token: string; email: string };

export type AuthState = AuthLoggedOut | AuthAnonymous | AuthLoggedIn;

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

  /**
   * If hydrate() left state at LoggedOut (no session cookie at all), mints
   * a fresh anonymous session so trials always have somewhere to sync to,
   * even before the player ever gives an email. Best-effort: a failed
   * request just leaves the player LoggedOut, same as before this existed.
   */
  ensureSession: () => Promise<void>;

  /** Record a newly-minted anonymous session. */
  loginAnonymous: (session: { token: string }) => void;

  /** Record a successful login: persists the session and moves to LoggedIn. */
  login: (session: { token: string; email: string }) => void;

  /** Log out and forget the session. Valid from: LoggedIn. */
  logout: () => void;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function stateFromPersisted(session: PersistedSession | null): AuthState {
  if (!session) return { type: "loggedOut" };
  return session.email === null
    ? { type: "anonymous", token: session.token }
    : { type: "loggedIn", token: session.token, email: session.email };
}

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createAuthStore() {
  return createStore<AuthStore>((set, get) => ({
    state: { type: "loggedOut" },

    hydrate() {
      set({ state: stateFromPersisted(loadSession()) });
    },

    async ensureSession() {
      if (get().state.type !== "loggedOut") return;
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
