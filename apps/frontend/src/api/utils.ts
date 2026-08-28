import { API_URL } from "@/env";

export type RequestOptions = {
  method: "GET" | "POST";
  token?: string;
  body?: unknown;
};

export async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (
    (body && typeof body.error === "string" ? body.error : null) ??
    "request_failed"
  );
}

/** Every backend call goes through this — the one place headers get built. */
export async function request(
  path: string,
  options: RequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  return fetch(`${API_URL}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/** Like `request`, but throws on a non-ok response and parses the JSON body. */
export async function requestJson<T>(
  path: string,
  options: RequestOptions,
): Promise<T> {
  const res = await request(path, options);
  if (!res.ok) throw new Error(await errorFrom(res));
  return (await res.json()) as T;
}

/** Like `request`, but throws on a non-ok response and discards the body. */
export async function requestVoid(
  path: string,
  options: RequestOptions,
): Promise<void> {
  const res = await request(path, options);
  if (!res.ok) throw new Error(await errorFrom(res));
}
