import { Outlet } from 'react-router';

export function AppLayout() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border border-b md:border-b-0 md:border-r">
        <div className="px-5 py-4">
          <p className="text-sm font-semibold tracking-wide">Carbon Accounting</p>
          <p className="text-xs opacity-75">Emissions management</p>
        </div>
      </aside>
      <main className="px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
