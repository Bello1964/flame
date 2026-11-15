import { SystemStatus } from '@/features/system-status/system-status';

export function HomePage() {
  return (
    <section className="max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">
          Platform scaffold. Organisations, facilities and flare sources come next.
        </p>
      </header>
      <div className="rounded-md border bg-card p-4">
        <h2 className="mb-2 text-sm font-medium">System status</h2>
        <SystemStatus />
      </div>
    </section>
  );
}
