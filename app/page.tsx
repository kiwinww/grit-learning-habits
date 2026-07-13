import { redirect } from "next/navigation";
import { ChildDashboard } from "@/app/child-dashboard";
import { prisma } from "@/lib/prisma";
import { getChildState } from "@/lib/state";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await prisma.familySetting.findUnique({ where: { id: 1 } }))) redirect("/setup");
  return <ChildDashboard initialState={await getChildState()} />;
}
