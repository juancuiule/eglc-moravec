import { OtpForm } from "@/components/OtpForm";
import { redirect } from "next/navigation";

export default async function OtpPage(props: {
  searchParams: Promise<{ email?: string; code?: string }>;
}) {
  const searchParams = await props.searchParams;
  if (searchParams.email) {
    return <OtpForm email={searchParams.email} code={searchParams.code} />;
  } else {
    redirect("/login");
  }
}
