import type { Metadata } from "next";

import { CrmDashboard } from "@/components/crm/crm-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getCrmDashboardData } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM",
};

export default async function CrmPage() {
  await requireSession();
  const data = await getCrmDashboardData();

  return <CrmDashboard data={data} />;
}
