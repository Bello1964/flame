import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/session';

/**
 * The landing page's main call to action: "Sign in" for visitors, or a way straight into
 * the organisation for someone already signed in. While the session is being checked it
 * shows "Sign in", which is correct for most visitors and harmless for the rest.
 */
export function PrimaryAction() {
  const session = useSession();
  const first = session.data?.memberships[0];
  const signedIn = Boolean(session.data);

  return (
    <Button asChild size="lg" className="bg-mint text-forest hover:bg-mint/90">
      <Link to={signedIn ? '/app' : '/login'}>
        {signedIn ? `Open ${first?.organisationName ?? 'Flame'}` : 'Sign in'}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
}
