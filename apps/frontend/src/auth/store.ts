import { useStore } from "zustand";
import { createAuthStore, type AuthStore } from "./index";

export const authStore = createAuthStore();

export function useAuth<T>(selector: (s: AuthStore) => T): T {
  return useStore(authStore, selector);
}
