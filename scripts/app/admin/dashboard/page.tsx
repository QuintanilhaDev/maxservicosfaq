import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/admin/login");
  }

  return (
    <DashboardClient
      currentUser={{ username: session!.username, isMaster: session!.isMaster }}
    />
  );
}
