import type { Metadata } from "next";

import { JournalDashboard } from "@/components/journal/journal-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getJournalDashboardData } from "@/lib/journal/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Journal",
};

export default async function JournalPage() {
  await requireSession();
  const data = await getJournalDashboardData();
  return <JournalDashboard data={data} />;
}
