/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { ISharedRoom } from '@/common/types/sharedRoom';
import { useAuth } from '@renderer/hooks/context/AuthContext';

export function useSharedRoomList() {
  const { user } = useAuth();
  const userId = user?.id ?? 'system_default_user';

  const { data, isLoading, mutate } = useSWR<ISharedRoom[]>(
    `shared-rooms/${userId}`,
    () => ipcBridge.sharedRoom.list.invoke(),
    {
      revalidateOnFocus: false,
    }
  );

  const rooms = data ?? [];

  useEffect(() => {
    const unsubCreated = ipcBridge.sharedRoom.created.on(() => {
      void mutate();
    });
    const unsubUpdated = ipcBridge.sharedRoom.updated.on(() => {
      void mutate();
    });
    const unsubRemoved = ipcBridge.sharedRoom.removed.on(() => {
      void mutate();
    });
    return () => {
      unsubCreated();
      unsubUpdated();
      unsubRemoved();
    };
  }, [mutate]);

  const removeRoom = useCallback(
    async (id: string) => {
      await ipcBridge.sharedRoom.remove.invoke({ id });
      await mutate();
    },
    [mutate]
  );

  return { rooms, isLoading, mutate, removeRoom };
}
