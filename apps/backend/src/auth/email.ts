export async function sendOtpEmail(
  to: string,
  code: string,
  apiKey: string | null,
): Promise<void> {
  if (apiKey === null) {
    console.log(`[dev] OTP for ${to}: ${code}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Moravec <login@elgatoylacaja.com>",
      to,
      subject: "Your Moravec login code",
      text: `Your code is ${code}. It expires in 5 minutes.`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Resend request failed: ${response.status} ${await response.text()}`,
    );
  }
}
