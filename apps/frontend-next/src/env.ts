const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * The backend URL as seen from wherever this code is running. In the
 * browser that's always the public URL (baked in at build time). On the
 * server it may need to differ: in a Docker Compose deploy the frontend
 * and backend are separate containers on their own network namespaces, so
 * "localhost" from inside the frontend container doesn't reach the
 * backend — API_URL (a runtime-only env var, e.g. "http://backend:3000")
 * overrides it for that case. Defaults to the public URL so deployments
 * that don't need the split (a shared origin, plain `pnpm dev`) don't
 * have to set anything extra.
 */
export const API_URL =
  typeof window === "undefined" ? (process.env.API_URL ?? PUBLIC_API_URL) : PUBLIC_API_URL;
