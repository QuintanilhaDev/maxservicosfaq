import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { MetricsClient } from "./MetricsClient";

export default async function MetricsPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/admin/login");
  }

  return <MetricsClient currentUser={{ username: session!.username, isMaster: session!.isMaster }} />;
}
