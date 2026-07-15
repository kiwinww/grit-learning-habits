import type { Metadata } from "next";
import { AdminPortal } from "@/app/admin/admin-portal";

export const metadata: Metadata = { title: "家长后台" };

export default function AdminPage() {
  return <AdminPortal />;
}
