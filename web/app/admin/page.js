import { requireAdmin } from "@/lib/admin";
import { loadAdminData } from "@/lib/adminData";
import SiteHeader from "../SiteHeader";
import AdminDashboard from "./AdminDashboard";

export const metadata = {
  title: "Admin — Dynasty Singularity",
  robots: { index: false, follow: false },
};

// Founder-only control room (lib/admin.js: anyone else gets a 404). Read-only figures from Supabase and Stripe, plus the
// publishing forms that used to be the database editor and CSV imports.
export default async function AdminPage() {
  await requireAdmin();
  const d = await loadAdminData();
  return (
    <div className="auth-page">
      <SiteHeader />
      <AdminDashboard d={d} />
    </div>
  );
}
