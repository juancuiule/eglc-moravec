import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/storage/session";
import LoginLayout from "./layout";

const { cookiesMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

function setSession(session: { token: string; email: string | null } | null) {
  const value = session
    ? encodeURIComponent(JSON.stringify(session))
    : undefined;
  cookiesMock.mockResolvedValue({
    get: vi.fn((name: string) =>
      name === SESSION_COOKIE && value ? { value } : undefined,
    ),
  });
}

describe("login layout", () => {
  it.each(["login", "OTP"])(
    "lets an anonymous user reach the %s page to upgrade",
    async () => {
      setSession({ token: "anonymous-token", email: null });
      const child = <div>Upgrade account</div>;

      await expect(LoginLayout({ children: child })).resolves.toBe(child);
      expect(redirectMock).not.toHaveBeenCalled();
    },
  );

  it("redirects a verified user away from login routes", async () => {
    setSession({ token: "verified-token", email: "player@example.com" });

    await LoginLayout({ children: <div>Login</div> });

    expect(redirectMock).toHaveBeenCalledWith("/");
  });
});
