'use client';

import { useAccount } from '@/contexts/account-context';
import { AdminDashboard } from '@/components/dashboards/admin-dashboard';
import { AccountDashboard } from '@/components/dashboards/account-dashboard';

export default function Dashboard() {
  const { isAdmin } = useAccount();

  return isAdmin ? <AdminDashboard /> : <AccountDashboard />;
}
