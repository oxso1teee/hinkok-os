import type { Metadata } from "next";

import { BrainDashboard } from "@/components/brain/brain-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getBrainDashboardData } from "@/lib/brain/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brain",
};

export default async function BrainPage() {
  await requireSession();
  const data = await getBrainDashboardData();
  return <BrainDashboard data={data} />;
}
