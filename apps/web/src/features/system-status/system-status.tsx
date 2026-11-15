import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useHealth } from './use-health';

/** Shows API and database connectivity. Status is always paired with text, never colour alone. */
export function SystemStatus() {
  const { data, isPending, isError } = useHealth();

  if (isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking system status…
      </p>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="size-4" aria-hidden />
        API unreachable. Start it with <code>npm run dev:api</code>.
      </p>
    );
  }

  const databaseOk = data.database === 'ok';
  return (
    <p
      role="status"
      className={`flex items-center gap-2 text-sm ${databaseOk ? 'text-primary' : 'text-warning'}`}
    >
      {databaseOk ? (
        <CheckCircle2 className="size-4" aria-hidden />
      ) : (
        <AlertTriangle className="size-4" aria-hidden />
      )}
      API online · Database {databaseOk ? 'connected' : 'unavailable'}
    </p>
  );
}
