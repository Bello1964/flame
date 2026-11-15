import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@carbon/shared';
import { apiGet } from '@/lib/api-client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    // 503 still carries a HealthResponse describing what is unavailable.
    queryFn: ({ signal }) => apiGet<HealthResponse>('/health', { acceptStatuses: [503], signal }),
    refetchInterval: 30_000,
  });
}
