import type { Metadata } from "next";

import { OperationsDashboard } from "@/components/operations/operations-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getOperationsDashboardData } from "@/lib/operations/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Status",
};

export default async function OperationsPage() {
  await requireSession();
  const data = await getOperationsDashboardData();
  return <OperationsDashboard data={data} />;
}
