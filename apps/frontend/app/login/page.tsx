import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, parseSessionCookie } from "@/storage/session";
import { Centered } from "@/components/Centered";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  // proxy.ts has already validated this cookie (or cleared it) before this
  // route ever renders — a plain presence check here is enough, no need to
  // hit the backend again. Redirecting server-side means a returning,
  // already-logged-in player never sees the login form flash on screen.
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  if (session) redirect("/");

  return (
    <Centered>
      <LoginForm />
    </Centered>
  );
}
