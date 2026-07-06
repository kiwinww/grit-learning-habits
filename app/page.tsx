import { ChildApp } from "@/app/child-app";
import { getAppState } from "@/lib/app-state";

export const dynamic = "force-dynamic";

export default async function Home() {
  const appState = await getAppState();

  return <ChildApp initialState={appState} />;
}
