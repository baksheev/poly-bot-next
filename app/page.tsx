import { getPnlDashboard } from "@/entities/pnl-report";
import { requireDashboardSession } from "@/shared/auth/server";
import { PnlDashboardPage } from "@/widgets/pnl-dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireDashboardSession();
  const report = await getPnlDashboard();

  return <PnlDashboardPage report={report} />;
}
