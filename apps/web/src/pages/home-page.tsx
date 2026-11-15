import { SystemStatus } from '@/features/system-status/system-status';

export function HomePage() {
  return (
    <section className="max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">System status</h1>
        <p className="text-sm text-muted-foreground">
          Connectivity between this app, the API and the database.
        </p>
      </header>
      <div className="rounded-md border bg-card p-4">
        <SystemStatus />
      </div>
    </section>
  );
}
