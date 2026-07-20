import type { Metadata } from "next";

import { SettingsDashboard } from "@/components/settings/settings-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getPersonalSettings } from "@/lib/settings/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  await requireSession();
  const data = await getPersonalSettings();
  return <SettingsDashboard initialSettings={data.settings} dataStatus={data.dataStatus} />;
}
