import { redirect } from "next/navigation";
import AuthCard from "../login/AuthCard";
import { subscriberByToken, unsubscribe } from "@/lib/emailList";
import { maskEmail } from "@/lib/emailRules";

export const metadata = {
  title: "Unsubscribe — Dynasty Singularity",
  robots: { index: false, follow: false },
};

// The link at the bottom of every newsletter (/unsubscribe?t=TOKEN). It asks for one click rather than unsubscribing on
// page load: mail scanners open links in emails, and a GET that unsubscribed would take people off the list by accident.
async function confirmUnsubscribe(formData) {
  "use server";
  const token = String(formData.get("t") || "");
  await unsubscribe(token);
  redirect(`/unsubscribe?t=${encodeURIComponent(token)}&done=1`);
}

export default async function UnsubscribePage({ searchParams }) {
  const params = await searchParams;
  const token = typeof params?.t === "string" ? params.t : "";
  const sub = await subscriberByToken(token);

  if (!sub) {
    return <AuthCard eyebrow="Email" title="This link isn't valid." sub="It may be incomplete. Use the unsubscribe link from your most recent email, or contact us and we'll remove you." />;
  }
  if (sub.unsubscribed_at) {
    return (
      <AuthCard eyebrow="Email" title="You're unsubscribed." sub={`${maskEmail(sub.email)} won't get the newsletter any more. Changed your mind? Sign up again on the home page.`} />
    );
  }
  return (
    <AuthCard eyebrow="Email" title="Unsubscribe from the newsletter?" sub={`${maskEmail(sub.email)} will stop getting the weekly email.`}>
      <form action={confirmUnsubscribe} className="auth-form">
        <input type="hidden" name="t" value={token} />
        <div className="auth-actions">
          <button className="btn-primary">Unsubscribe</button>
        </div>
      </form>
    </AuthCard>
  );
}
