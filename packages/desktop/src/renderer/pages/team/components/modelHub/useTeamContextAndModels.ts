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
  ConnectedModelsCatalogDto,
  ModelTargetSpec,
  PerSlotModelUpdate,
  SlotContextStatusDto,
  SwitchTeamModelsRequest,
  SwitchTeamModelsResponse,
  TeamContextStatusResponse,
  TeamEconomyMode,
  TeamQuotaPreset,
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

function scoreProModel(text: string): number {
  const lower = text.toLowerCase();
  if (/codex|haiku|flash|mini/.test(lower)) return 60;
  if (/opus|gpt-5\.4|gpt-5|o3|gemini-3\.1-pro|gemini-2\.5-pro|pro-high/.test(lower)) return 100;
  if (/\bpro\b|sonnet-4|sonnet|reasoner|deepseek-r1/.test(lower)) return 80;
  return 20;
}

function scoreFastWorkerModel(text: string): number {
  const lower = text.toLowerCase();
  if (/flash|codex|sonnet|mini|haiku/.test(lower)) return 100;
  if (/\bpro\b|gpt-5/.test(lower)) return 60;
  return 30;
}

export function resolveQuotaPresetTargets(
  catalog: ConnectedModelsCatalogDto | undefined,
  preset: TeamQuotaPreset
): { leaderTarget?: ModelTargetSpec; workerTarget?: ModelTargetSpec } {
  const cliTargets: ModelTargetSpec[] = [];
  const apiTargets: ModelTargetSpec[] = [];

  for (const agent of catalog?.cli_agents ?? []) {
    for (const model of agent.models ?? []) {
      const target: ModelTargetSpec = {
        backend: agent.backend,
        model_id: model.id,
        label: model.label,
        wallet_type: agent.wallet_type,
      };
      if (agent.wallet_type === 'cli_subscription') {
        cliTargets.push(target);
      } else {
        apiTargets.push(target);
      }
    }
  }

  for (const provider of catalog?.api_providers ?? []) {
    for (const model of provider.models ?? []) {
      apiTargets.push({
        backend: provider.backend,
        provider_id: provider.provider_id,
        model_id: model.id,
        label: model.label,
        wallet_type: 'api_key',
      });
    }
  }

  const pickBest = (
    list: ModelTargetSpec[],
    scorer: (text: string) => number
  ): ModelTargetSpec | undefined => {
    if (list.length === 0) return undefined;
    let best = list[0];
    let bestScore = scorer(`${best.model_id} ${best.label ?? ''}`);
    for (let i = 1; i < list.length; i++) {
      const candidate = list[i];
      const sc = scorer(`${candidate.model_id} ${candidate.label ?? ''}`);
      if (sc > bestScore) {
        best = candidate;
        bestScore = sc;
      }
    }
    return best;
  };

  const bestCliPro = pickBest(cliTargets, scoreProModel);
  const bestCliFast = pickBest(cliTargets, scoreFastWorkerModel);
  const bestApiPro = pickBest(apiTargets, scoreProModel);
  const bestApiFast = pickBest(apiTargets, scoreFastWorkerModel);

  if (preset === 'all_free_cli') {
    const leaderTarget = bestCliPro ?? bestCliFast;
    const workerTarget = bestCliFast ?? bestCliPro;
    return { leaderTarget, workerTarget };
  }

  // 'smart_split': Pro/Opus Lead (preferring strong $0 CLI Pro/Opus first, or Paid API Pro if higher tier) + $0 CLI fast Workers
  let leaderTarget = bestCliPro ?? bestApiPro ?? bestCliFast ?? bestApiFast;
  if (bestApiPro && bestCliPro) {
    const apiScore = scoreProModel(`${bestApiPro.model_id} ${bestApiPro.label ?? ''}`);
    const cliScore = scoreProModel(`${bestCliPro.model_id} ${bestCliPro.label ?? ''}`);
    leaderTarget = apiScore > cliScore ? bestApiPro : bestCliPro;
  }
  const workerTarget = bestCliFast ?? bestCliPro ?? bestApiFast ?? bestApiPro;
  return { leaderTarget, workerTarget };
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
          auto_compact_threshold_pct:
            ev.auto_compact_threshold_pct ?? prev?.auto_compact_threshold_pct ?? 80,
          economy_mode: ev.economy_mode ?? prev?.economy_mode,
          max_context_tokens: ev.max_context_tokens ?? prev?.max_context_tokens,
          tokens_saved_estimate: ev.tokens_saved_estimate ?? prev?.tokens_saved_estimate,
          coalesced_wakes_saved: ev.coalesced_wakes_saved ?? prev?.coalesced_wakes_saved,
          max_turn_hops_per_run: ev.max_turn_hops_per_run ?? prev?.max_turn_hops_per_run,
          auto_fallback_free_cli: ev.auto_fallback_free_cli ?? prev?.auto_fallback_free_cli,
          total_wakeup_turns: ev.total_wakeup_turns ?? prev?.total_wakeup_turns,
          total_input_tokens: ev.total_input_tokens ?? prev?.total_input_tokens,
          total_output_tokens: ev.total_output_tokens ?? prev?.total_output_tokens,
          total_cached_read_tokens: ev.total_cached_read_tokens ?? prev?.total_cached_read_tokens,
          total_estimated_cost_usd: ev.total_estimated_cost_usd ?? prev?.total_estimated_cost_usd,
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
  const economyMode: TeamEconomyMode = status?.economy_mode ?? 'lean';
  const maxContextTokens = status?.max_context_tokens ?? 160000;
  const tokensSavedEstimate = status?.tokens_saved_estimate ?? 0;
  const coalescedWakesSaved = status?.coalesced_wakes_saved ?? 0;

  const {
    totalWakeupTurns,
    totalInputTokens,
    totalOutputTokens,
    totalCachedReadTokens,
    totalEstimatedCostUsd,
    kvCacheHitPct,
  } = useMemo(() => {
    let slotTurns = 0;
    let slotInput = 0;
    let slotOutput = 0;
    let slotCached = 0;
    let slotCost = 0;
    for (const s of slots) {
      slotTurns += Math.max(0, s.wakeup_turns ?? 0);
      slotInput += Math.max(0, s.input_tokens_total ?? 0);
      slotOutput += Math.max(0, s.output_tokens_total ?? 0);
      slotCached += Math.max(0, s.cached_read_tokens_total ?? 0);
      slotCost += Math.max(0, s.estimated_cost_usd ?? 0);
    }
    const resolvedInput = Math.max(0, status?.total_input_tokens ?? slotInput);
    const resolvedOutput = Math.max(0, status?.total_output_tokens ?? slotOutput);
    const resolvedCached = Math.max(0, status?.total_cached_read_tokens ?? slotCached);
    const resolvedTurns = Math.max(0, status?.total_wakeup_turns ?? slotTurns);
    const resolvedCost = Math.max(0, status?.total_estimated_cost_usd ?? slotCost);
    const promptTotal = resolvedInput + resolvedCached;
    const hitPct = promptTotal > 0 ? Math.round((resolvedCached / promptTotal) * 100) : 0;
    return {
      totalWakeupTurns: resolvedTurns,
      totalInputTokens: resolvedInput,
      totalOutputTokens: resolvedOutput,
      totalCachedReadTokens: resolvedCached,
      totalEstimatedCostUsd: resolvedCost,
      kvCacheHitPct: hitPct,
    };
  }, [
    slots,
    status?.total_cached_read_tokens,
    status?.total_estimated_cost_usd,
    status?.total_input_tokens,
    status?.total_output_tokens,
    status?.total_wakeup_turns,
  ]);

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
          ...opts,
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

  const updateEconomyPrefs = useCallback(
    async (prefs: {
      economy_mode?: TeamEconomyMode;
      max_context_tokens?: number;
    }): Promise<CompactTeamContextResponse | undefined> => {
      if (!teamId) return undefined;
      const hub = getTeamHubBridge();
      if (!hub?.compact?.invoke) return undefined;

      await mutateStatus(
        (prev) =>
          prev
            ? {
                ...prev,
                ...(prefs.economy_mode ? { economy_mode: prefs.economy_mode } : {}),
                ...(prefs.max_context_tokens != null
                  ? { max_context_tokens: prefs.max_context_tokens }
                  : {}),
              }
            : {
                team_id: teamId,
                auto_compact_enabled: true,
                auto_compact_threshold_pct: 80,
                economy_mode: prefs.economy_mode ?? 'lean',
                max_context_tokens: prefs.max_context_tokens ?? 160000,
                slots: [],
              },
        false
      );

      const res = await hub.compact.invoke({
        team_id: teamId,
        mode: 'prefs_only',
        ...prefs,
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

  const applyQuotaPreset = useCallback(
    async (
      preset: TeamQuotaPreset,
      catalog?: ConnectedModelsCatalogDto,
      forceInterrupt?: boolean
    ): Promise<SwitchTeamModelsResponse | undefined> => {
      if (!teamId) return undefined;
      const hub = getTeamHubBridge();
      if (!hub) return undefined;
      setSwitchingModels(true);
      try {
        if (hub.applyQuotaPreset?.invoke) {
          try {
            const res = await hub.applyQuotaPreset.invoke({
              team_id: teamId,
              preset,
              force_interrupt: forceInterrupt,
            });
            await Promise.all([mutateStatus(), mutateTeamCache()]);
            return res;
          } catch (err: unknown) {
            const status = (err as { status?: number })?.status;
            const errMsg = String((err as Error)?.message ?? err ?? '');
            const isFallbackable =
              err instanceof TypeError ||
              status === 404 ||
              status === 405 ||
              /\b(404|405)\b|not\s+found|not\s+implemented/i.test(errMsg);
            if (!isFallbackable || !hub.switchModels?.invoke) {
              throw err;
            }
          }
        }

        if (!hub.switchModels?.invoke) return undefined;
        const { leaderTarget, workerTarget } = resolveQuotaPresetTargets(catalog, preset);
        const updates: PerSlotModelUpdate[] = [];
        for (const s of slots) {
          const isLeader = s.role === 'leader';
          const chosen = isLeader ? (leaderTarget ?? workerTarget) : (workerTarget ?? leaderTarget);
          if (chosen) {
            updates.push({ slot_id: s.slot_id, target: chosen });
          }
        }
        const res = await hub.switchModels.invoke({
          team_id: teamId,
          preset,
          ...(updates.length > 0 ? { scope: 'slots', updates } : {}),
          force_interrupt: forceInterrupt,
        });
        await Promise.all([mutateStatus(), mutateTeamCache()]);
        return res;
      } finally {
        setSwitchingModels(false);
      }
    },
    [mutateStatus, mutateTeamCache, slots, teamId]
  );

  return {
    status,
    slots,
    slotsBySlotId,
    autoCompactEnabled,
    autoCompactThresholdPct,
    economyMode,
    maxContextTokens,
    tokensSavedEstimate,
    coalescedWakesSaved,
    totalWakeupTurns,
    totalInputTokens,
    totalOutputTokens,
    totalCachedReadTokens,
    totalEstimatedCostUsd,
    kvCacheHitPct,
    maxUsagePercent,
    avgUsagePercent,
    highestLevel,
    isLoading,
    compacting,
    switchingModels,
    compactTeam,
    toggleAutoCompact,
    updateEconomyPrefs,
    switchModels,
    applyQuotaPreset,
    refresh: mutateStatus,
  };
}
