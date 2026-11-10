import useSWR from 'swr';
import { useEffect } from 'react';
import { inbox } from '@/common/adapter/ipcBridge';

export const INBOX_SWR_KEY = '/api/inbox';

export function useInboxPendingCount(): number {
  const { data, mutate } = useSWR(INBOX_SWR_KEY, () => inbox.list.invoke(), {
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });

  useEffect(() => {
    const unsubAdded = inbox.itemAdded.on(() => {
      void mutate();
    });
    const unsubResolved = inbox.itemResolved.on((event) => {
      void mutate((current) => {
        if (!current) return current;
        const items = current.items.map((card) =>
          card.id === event.id
            ? { ...card, status: 'resolved' as const, resolved_by: event.resolved_by, resolved_at: Date.now() }
            : card
        );
        return {
          items,
          pending_count: items.filter((c) => c.status === 'pending').length,
        };
      }, { revalidate: true });
    });

    return () => {
      unsubAdded();
      unsubResolved();
    };
  }, [mutate]);

  return data?.pending_count ?? 0;
}
