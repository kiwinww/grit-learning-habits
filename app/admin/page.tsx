import { AdminApp } from "@/app/admin/admin-app";
import { getAdminState } from "@/lib/app-state";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const state = await getAdminState();

  return <AdminApp initialState={state} />;
}
