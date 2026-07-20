import type { Metadata } from "next";

import { BackupDashboard } from "@/components/backup/backup-dashboard";
import { requireSession } from "@/lib/auth/dal";
import { getBackupOverview } from "@/lib/backups/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Backup",
};

export default async function BackupPage() {
  await requireSession();
  const overview = await getBackupOverview();
  return <BackupDashboard overview={overview} />;
}
