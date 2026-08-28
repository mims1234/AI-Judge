import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { listStaff } from "@/lib/server/staff";
import { getSessionUser } from "@/lib/server/session";
import { getTrafficStats } from "@/lib/server/traffic";
import { canAccessAdmin, canManageStaff } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const user = await getSessionUser();
  if (!user || !canAccessAdmin(user)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return { title: "Admin", robots: { index: false, follow: false } };
}

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user || !canAccessAdmin(user)) notFound();

  return (
    <AdminDashboard
      initial={getTrafficStats(30)}
      staff={listStaff()}
      canManageStaff={canManageStaff(user)}
    />
  );
}
