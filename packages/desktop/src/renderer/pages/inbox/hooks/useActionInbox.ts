import useSWR from 'swr';
import { useCallback, useEffect, useRef } from 'react';
import { inbox } from '@/common/adapter/ipcBridge';
import type { ActionInboxCardDto } from '@/common/types/inbox';

export const INBOX_SWR_KEY = '/api/inbox';

export function useActionInbox() {
  const { data, error, isLoading, mutate } = useSWR(
    INBOX_SWR_KEY,
    () => inbox.list.invoke(),
    {
      revalidateOnFocus: true,
      dedupingInterval: 1500,
    }
  );

  const resolvingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubAdded = inbox.itemAdded.on(() => {
      void mutate();
    });

    const unsubResolved = inbox.itemResolved.on((event) => {
      void mutate((current) => {
        if (!current) return current;
        const items = current.items.map((card) =>
          card.id === event.id
            ? {
                ...card,
                status: 'resolved' as const,
                resolved_by: event.resolved_by,
                resolved_at: Date.now(),
              }
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

  const resolveCard = useCallback(
    async (id: string, action: string, payload?: unknown) => {
      if (resolvingIdsRef.current.has(id)) {
        return; // anti-double-click guard
      }
      resolvingIdsRef.current.add(id);

      // 1. Optimistic UI update: mark card resolved & decrement pending count immediately
      await mutate(
        (current) => {
          if (!current) return current;
          const items = current.items.map((card) =>
            card.id === id
              ? {
                  ...card,
                  status: 'resolved' as const,
                  resolved_by: 'desktop' as const,
                  resolution_result: action,
                  resolved_at: Date.now(),
                }
              : card
          );
          return {
            items,
            pending_count: items.filter((c) => c.status === 'pending').length,
          };
        },
        { revalidate: false }
      );

      // 2. Call backend resolve endpoint
      try {
        await inbox.resolve.invoke({ id, action, payload });
      } catch (err) {
        console.error(`Failed to resolve Action Inbox card ${id}:`, err);
      } finally {
        resolvingIdsRef.current.delete(id);
        void mutate();
      }
    },
    [mutate]
  );

  return {
    items: data?.items ?? [],
    pendingCount: data?.pending_count ?? 0,
    isLoading,
    error,
    resolveCard,
    mutate,
  };
}
