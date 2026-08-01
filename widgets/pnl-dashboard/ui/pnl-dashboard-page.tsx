import type { PnlDashboardReport } from "@/entities/pnl-report";
import { LogoutButton } from "@/features/auth";
import { PnlDashboard } from "@/features/pnl-dashboard";

export function PnlDashboardPage({ report }: { report: PnlDashboardReport }) {
  return (
    <div className="site-shell">
      <PnlDashboard headerAction={<LogoutButton />} report={report} />
    </div>
  );
}
