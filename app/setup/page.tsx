import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "@/app/setup/setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await prisma.familySetting.findUnique({ where: { id: 1 } })) redirect("/");
  return <SetupForm />;
}
