/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import type {
  CompactTeamContextRequest,
  CompactTeamContextResponse,
  SlotContextStatusDto,
  SwitchTeamModelsRequest,
  SwitchTeamModelsResponse,
  TeamContextStatusResponse,
} from '@/common/types/team/teamHubTypes';
import { getTeamHubBridge } from './bridgeSafe';

export function resolveSlotContextLevel(
  usagePercent: number,
  rawLevel?: 'normal' | 'warning' | 'critical'
): 'normal' | 'warning' | 'critical' {
  if (usagePercent >= 85 || rawLevel === 'critical') return 'critical';
  if (usagePercent >= 70 || rawLevel === 'warning') return 'warning';
  return 'normal';
}

export function useTeamContextAndModels(
  teamId?: string | null,
  fallbackStatus?: TeamContextStatusResponse
) {
  const swrKey = teamId ? `team-hub/context-status/${teamId}` : null;

  const {
    data: fetchedStatus,
    isLoading,
    mutate: mutateStatus,
  } = useSWR<TeamContextStatusResponse | undefined>(
    swrKey,
    async () => {
      if (!teamId) return undefined;
      const hub = getTeamHubBridge();
      if (!hub?.contextStatus?.invoke) return undefined;
      try {
        return await hub.contextStatus.invoke({ team_id: teamId });
      } catch {
        return undefined;
      }
    },
    { revalidateOnFocus: false, fallbackData: fallbackStatus }
  );

  // Scoped SWR handle for revalidating `team/${teamId}` without named SWR imports
  const { mutate: mutateTeamCache } = useSWR(teamId ? `team/${teamId}` : null);

  const [compacting, setCompacting] = useState(false);
  const [switchingModels, setSwitchingModels] = useState(false);

  const status = fetchedStatus ?? fallbackStatus;

  useEffect(() => {
    if (!teamId) return;
    const hub = getTeamHubBridge();
    if (!hub) return;

    const unsubUsage = hub.contextUsageUpdated?.on((ev) => {
      if (ev.team_id !== teamId) return;
      void mutateStatus(
        (prev) => ({
          team_id: ev.team_id,
          auto_compact_enabled: ev.auto_compact_enabled,
          auto_compact_threshold_pct: prev?.auto_compact_threshold_pct ?? 80,
          slots: ev.slots,
        }),
        false
      );
    });

    const unsubCompacted = hub.contextCompacted?.on((ev) => {
      if (ev.team_id !== teamId) return;
      void mutateStatus();
      void mutateTeamCache();
    });

    const unsubSwitched = hub.modelsSwitched?.on((ev) => {
      if (ev.team_id !== teamId) return;
      void mutateStatus();
      void mutateTeamCache();
    });

    return () => {
      unsubUsage?.();
      unsubCompacted?.();
      unsubSwitched?.();
    };
  }, [mutateStatus, mutateTeamCache, teamId]);

  const slots = useMemo<SlotContextStatusDto[]>(() => status?.slots ?? [], [status?.slots]);

  const slotsBySlotId = useMemo<Record<string, SlotContextStatusDto>>(() => {
    const map: Record<string, SlotContextStatusDto> = {};
    for (const slot of slots) {
      map[slot.slot_id] = slot;
    }
    return map;
  }, [slots]);

  const autoCompactEnabled = status?.auto_compact_enabled ?? true;
  const autoCompactThresholdPct = status?.auto_compact_threshold_pct ?? 80;

  const { maxUsagePercent, avgUsagePercent, highestLevel } = useMemo(() => {
    if (slots.length === 0) {
      return {
        maxUsagePercent: 0,
        avgUsagePercent: 0,
        highestLevel: 'normal' as const,
      };
    }
    let maxPct = 0;
    let sumPct = 0;
    let topLevel: 'normal' | 'warning' | 'critical' = 'normal';

    for (const s of slots) {
      const pct = Math.max(0, Math.round(s.usage_percent));
      if (pct > maxPct) maxPct = pct;
      sumPct += pct;
      const lvl = resolveSlotContextLevel(pct, s.level);
      if (lvl === 'critical') {
        topLevel = 'critical';
      } else if (lvl === 'warning' && topLevel === 'normal') {
        topLevel = 'warning';
      }
    }

    return {
      maxUsagePercent: maxPct,
      avgUsagePercent: Math.round(sumPct / slots.length),
      highestLevel: topLevel,
    };
  }, [slots]);

  const compactTeam = useCallback(
    async (
      opts?: Omit<CompactTeamContextRequest, 'team_id'>
    ): Promise<CompactTeamContextResponse | undefined> => {
      if (!teamId) return undefined;
      const hub = getTeamHubBridge();
      if (!hub?.compact?.invoke) return undefined;
      setCompacting(true);
      try {
        const res = await hub.compact.invoke({
          team_id: teamId,
          ...(opts ?? {}),
        });
        await Promise.all([mutateStatus(), mutateTeamCache()]);
        return res;
      } finally {
        setCompacting(false);
      }
    },
    [mutateStatus, mutateTeamCache, teamId]
  );

  const toggleAutoCompact = useCallback(
    async (enabled: boolean): Promise<CompactTeamContextResponse | undefined> => {
      if (!teamId) return undefined;
      const hub = getTeamHubBridge();
      if (!hub?.compact?.invoke) return undefined;

      await mutateStatus(
        (prev) =>
          prev
            ? { ...prev, auto_compact_enabled: enabled }
            : {
                team_id: teamId,
                auto_compact_enabled: enabled,
                auto_compact_threshold_pct: 80,
                slots: [],
              },
        false
      );

      const res = await hub.compact.invoke({
        team_id: teamId,
        mode: 'prefs_only',
        auto_compact_enabled: enabled,
      });
      await mutateStatus();
      return res;
    },
    [mutateStatus, teamId]
  );

  const switchModels = useCallback(
    async (
      opts: Omit<SwitchTeamModelsRequest, 'team_id'>
    ): Promise<SwitchTeamModelsResponse | undefined> => {
      if (!teamId) return undefined;
      const hub = getTeamHubBridge();
      if (!hub?.switchModels?.invoke) return undefined;
      setSwitchingModels(true);
      try {
        const res = await hub.switchModels.invoke({
          team_id: teamId,
          ...opts,
        });
        await Promise.all([mutateStatus(), mutateTeamCache()]);
        return res;
      } finally {
        setSwitchingModels(false);
      }
    },
    [mutateStatus, mutateTeamCache, teamId]
  );

  return {
    status,
    slots,
    slotsBySlotId,
    autoCompactEnabled,
    autoCompactThresholdPct,
    maxUsagePercent,
    avgUsagePercent,
    highestLevel,
    isLoading,
    compacting,
    switchingModels,
    compactTeam,
    toggleAutoCompact,
    switchModels,
    refresh: mutateStatus,
  };
}
