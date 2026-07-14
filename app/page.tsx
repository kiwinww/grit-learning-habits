import { redirect } from "next/navigation";
import { ChildDashboard } from "@/app/child-dashboard";
import { prisma } from "@/lib/prisma";
import { getChildState } from "@/lib/state";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await prisma.familySetting.findUnique({ where: { id: 1 } }))) redirect("/setup");
  const initialState = await getChildState();
  const store = await cookies();
  const previousMessage = Number(store.get("family_hero_message")?.value ?? -1);
  const messageChoices = initialState.family.heroMessages.map((_, index) => index).filter((index) => index !== previousMessage);
  const heroMessageIndex = messageChoices[Math.floor(Math.random() * messageChoices.length)] ?? 0;
  return <ChildDashboard heroMessageIndex={heroMessageIndex} initialState={initialState} />;
}
