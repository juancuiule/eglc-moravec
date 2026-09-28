import { OtpForm } from "@/components/OtpForm";
import { redirect } from "next/navigation";

export default async function OtpPage(props: {
  searchParams: Promise<{ email?: string; code?: string }>;
}) {
  const searchParams = await props.searchParams;
  // Only the email round-trips through the URL — a ?code= param would land
  // the OTP in browser history and server logs for no benefit (it expires
  // in 5 minutes anyway).
  if (searchParams.email) {
    return <OtpForm email={searchParams.email} />;
  } else {
    redirect("/login");
  }
}
