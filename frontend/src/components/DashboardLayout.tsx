import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Clock,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react';

const SidebarLink = ({
  icon: Icon,
  label,
  to,
  active = false,
}: {
  icon: React.ElementType;
  label: string;
  to: string;
  active?: boolean;
}) => (
  <Link
    to={to}
    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? 'bg-primary/10 font-medium text-primary'
        : 'text-muted-foreground hover:text-foreground'
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </Link>
);

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 hidden h-screen w-56 flex-col border-r border-border bg-surface-elevated p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2 pt-2">
          <span className="h-2 w-2 rounded-full bg-primary glow-primary" />
          <span className="text-sm font-semibold text-foreground">
            FocalPoint
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          <SidebarLink
            icon={BarChart3}
            label="Dashboard"
            to="/dashboard"
            active={pathname === '/dashboard'}
          />
          <SidebarLink
            icon={Clock}
            label="Sessions"
            to="/dashboard/sessions"
            active={pathname.startsWith('/dashboard/sessions')}
          />
          <SidebarLink
            icon={SettingsIcon}
            label="Settings"
            to="/dashboard/settings"
            active={pathname.startsWith('/dashboard/settings')}
          />
        </nav>

        <Link
          to="/login"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Link>
      </aside>

      {/* Mobile header */}
      <header className="flex items-center justify-between border-b border-border bg-surface-elevated p-4 md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-sm font-semibold text-foreground">
            FocalPoint
          </span>
        </Link>
        <nav className="flex gap-3 text-xs">
          <Link
            to="/dashboard"
            className={
              pathname === '/dashboard'
                ? 'text-primary'
                : 'text-muted-foreground'
            }
          >
            Overview
          </Link>
          <Link
            to="/dashboard/sessions"
            className={
              pathname.startsWith('/dashboard/sessions')
                ? 'text-primary'
                : 'text-muted-foreground'
            }
          >
            Sessions
          </Link>
          <Link
            to="/dashboard/settings"
            className={
              pathname.startsWith('/dashboard/settings')
                ? 'text-primary'
                : 'text-muted-foreground'
            }
          >
            Settings
          </Link>
        </nav>
      </header>

      {/* Main content */}
      <main className="md:ml-56">
        <div className="mx-auto max-w-5xl p-6 md:p-10">{children}</div>
      </main>
    </div>
  );
};

export default DashboardLayout;
