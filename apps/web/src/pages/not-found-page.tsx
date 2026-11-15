import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/page-state';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        title="Page not found"
        description="The address may be mistyped, or the page may have moved."
        action={
          <Button asChild variant="outline">
            <Link to="/">Go to the start page</Link>
          </Button>
        }
      />
    </div>
  );
}
