import type { Metadata } from "next";

import { HealthDashboard } from "@/components/health/health-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getHealthDashboardData } from "@/lib/health/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Health",
};

export default async function HealthPage() {
  await requireSession();
  const data = await getHealthDashboardData();
  return <HealthDashboard data={data} />;
}
