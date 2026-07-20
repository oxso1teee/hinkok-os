import type { Metadata } from "next";

import { HomeDashboard } from "@/components/home/home-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getHomeDashboardData } from "@/lib/home/data";
import { getPersonalSettings } from "@/lib/settings/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  await requireSession();
  const [data, settingsResult] = await Promise.all([
    getHomeDashboardData(),
    getPersonalSettings(),
  ]);

  return (
    <HomeDashboard
      data={settingsResult.dataStatus === "unavailable" ? { ...data, dataStatus: "partial" } : data}
      settings={settingsResult.settings}
    />
  );
}
