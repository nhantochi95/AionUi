/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Message, Progress, Switch, Trigger } from '@arco-design/web-react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type {
  CompactTeamContextResponse,
  SlotContextStatusDto,
  TeamEconomyMode,
} from '@/common/types/team/teamHubTypes';
import { resolveSlotContextLevel } from './useTeamContextAndModels';

export function formatCompactTokens(value?: number): string {
  const safe = Math.max(0, Math.round(value ?? 0));
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1)}M`;
  }
  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(1)}K`;
  }
  return String(safe);
}

export function computeKvCacheHitPct(inputTokens?: number, cachedReadTokens?: number): number {
  const safeIn = Math.max(0, inputTokens ?? 0);
  const safeCached = Math.max(0, cachedReadTokens ?? 0);
  const promptTotal = safeIn + safeCached;
  return promptTotal > 0 ? Math.round((safeCached / promptTotal) * 100) : 0;
}

export interface FallbackSlotSummary {
  slot_id: string;
  name: string;
  role: string;
  backend: string;
}

export interface TeamContextCompactPopoverProps {
  children: React.ReactElement;
  disabled?: boolean;
  slots: SlotContextStatusDto[];
  fallbackMembers?: FallbackSlotSummary[];
  autoCompactEnabled: boolean;
  autoCompactThresholdPct?: number;
  economyMode?: TeamEconomyMode;
  maxContextTokens?: number;
  tokensSavedEstimate?: number;
  coalescedWakesSaved?: number;
  totalWakeupTurns?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCachedReadTokens?: number;
  totalEstimatedCostUsd?: number;
  compacting?: boolean;
  onToggleAutoCompact: (enabled: boolean) => Promise<CompactTeamContextResponse | undefined>;
  onUpdateEconomyPrefs?: (prefs: {
    economy_mode?: TeamEconomyMode;
    max_context_tokens?: number;
  }) => Promise<CompactTeamContextResponse | undefined>;
  onCompactAll: () => Promise<CompactTeamContextResponse | undefined>;
  onCompactSlot: (slotId: string) => Promise<CompactTeamContextResponse | undefined>;
  position?: 'bl' | 'br' | 'tl' | 'tr' | 'bottom' | 'top';
}

export const TeamContextCompactPopover: React.FC<TeamContextCompactPopoverProps> = ({
  children,
  disabled = false,
  slots,
  fallbackMembers = [],
  autoCompactEnabled,
  autoCompactThresholdPct = 80,
  economyMode = 'lean',
  maxContextTokens = 160000,
  tokensSavedEstimate = 0,
  coalescedWakesSaved = 0,
  totalInputTokens,
  totalOutputTokens,
  totalCachedReadTokens,
  compacting = false,
  onToggleAutoCompact,
  onUpdateEconomyPrefs,
  onCompactAll,
  onCompactSlot,
  position = 'br',
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [compactingSlotId, setCompactingSlotId] = useState<string | null>(null);
  const [localEconomyMode, setLocalEconomyMode] = useState<TeamEconomyMode>(economyMode);
  const [localMaxTokens, setLocalMaxTokens] = useState<number>(maxContextTokens);

  const activeEconomyMode = onUpdateEconomyPrefs ? economyMode : localEconomyMode;
  const activeMaxTokens = onUpdateEconomyPrefs ? maxContextTokens : localMaxTokens;
  const isSmartCeilingActive = activeMaxTokens <= 160000;

  const handleSelectEconomyMode = async (mode: TeamEconomyMode) => {
    setLocalEconomyMode(mode);
    if (onUpdateEconomyPrefs) {
      await onUpdateEconomyPrefs({ economy_mode: mode });
    }
  };

  const handleToggleCeiling = async (smartCeiling: boolean) => {
    const nextMax = smartCeiling ? 160000 : 200000;
    setLocalMaxTokens(nextMax);
    if (onUpdateEconomyPrefs) {
      await onUpdateEconomyPrefs({ max_context_tokens: nextMax });
    }
  };

  const effectiveSlots: SlotContextStatusDto[] =
    slots.length > 0
      ? slots
      : fallbackMembers.map((m) => ({
          slot_id: m.slot_id,
          name: m.name,
          role: m.role,
          conversation_id: '',
          backend: m.backend,
          model_id: 'default',
          wallet_type: m.backend === 'aionrs' ? 'api_key' : 'cli_subscription',
          used_tokens: 0,
          max_tokens: 200000,
          usage_percent: 0,
          level: 'normal',
          compaction_count: 0,
          auto_compact_enabled: autoCompactEnabled,
          has_anchored_summary: false,
        }));

  const slotSumInput = effectiveSlots.reduce((acc, s) => acc + Math.max(0, s.input_tokens_total ?? 0), 0);
  const slotSumOutput = effectiveSlots.reduce((acc, s) => acc + Math.max(0, s.output_tokens_total ?? 0), 0);
  const slotSumCached = effectiveSlots.reduce(
    (acc, s) => acc + Math.max(0, s.cached_read_tokens_total ?? 0),
    0
  );
  const resolvedInputTokens = Math.max(0, totalInputTokens ?? slotSumInput);
  const resolvedOutputTokens = Math.max(0, totalOutputTokens ?? slotSumOutput);
  const resolvedCachedReadTokens = Math.max(0, totalCachedReadTokens ?? slotSumCached);
  const hasTeamMeteredTokens =
    resolvedInputTokens + resolvedOutputTokens + resolvedCachedReadTokens > 0;
  const teamKvCacheHitPct = computeKvCacheHitPct(resolvedInputTokens, resolvedCachedReadTokens);

  const handleToggleAuto = async (checked: boolean) => {
    try {
      await onToggleAutoCompact(checked);
      Message.success(
        checked
          ? t('team.modelHub.autoCompactEnabledMsg', { defaultValue: 'Enabled Auto-Compact at 80%' })
          : t('team.modelHub.autoCompactDisabledMsg', { defaultValue: 'Disabled Auto-Compact' })
      );
    } catch (err) {
      Message.error(
        t('team.modelHub.compactFailed', {
          error: String(err),
          defaultValue: `Failed to compact context: ${String(err)}`,
        })
      );
    }
  };

  const handleCompactAllClick = async () => {
    try {
      const res = await onCompactAll();
      const count = res?.outcomes?.length ?? effectiveSlots.length;
      Message.success(
        t('team.modelHub.compactSuccess', {
          count,
          defaultValue: `Compacted context for ${count} member(s)`,
        })
      );
    } catch (err) {
      Message.error(
        t('team.modelHub.compactFailed', {
          error: String(err),
          defaultValue: `Failed to compact context: ${String(err)}`,
        })
      );
    }
  };

  const handleCompactSlotClick = async (slotId: string) => {
    setCompactingSlotId(slotId);
    try {
      const res = await onCompactSlot(slotId);
      const count = res?.outcomes?.length ?? 1;
      Message.success(
        t('team.modelHub.compactSuccess', {
          count,
          defaultValue: `Compacted context for ${count} member(s)`,
        })
      );
    } catch (err) {
      Message.error(
        t('team.modelHub.compactFailed', {
          error: String(err),
          defaultValue: `Failed to compact context: ${String(err)}`,
        })
      );
    } finally {
      setCompactingSlotId(null);
    }
  };

  return (
    <Trigger
      popupVisible={visible}
      onVisibleChange={(next) => setVisible(disabled ? false : next)}
      trigger='click'
      position={position}
      popupAlign={{ bottom: 6, top: 6 }}
      getPopupContainer={() => document.body}
      unmountOnExit
      popup={() => (
        <div
          data-testid='team-compact-popover-panel'
          className='w-344px max-w-[calc(100vw-24px)] flex flex-col gap-10px rounded-12px border border-solid border-b-base bg-dialog-fill-0 p-12px shadow-xl text-t-primary'
          style={{
            zIndex: 10050,
            backgroundColor: 'var(--dialog-fill-0, var(--bg-1, #ffffff))',
            borderColor: 'var(--border-base, #e5e6eb)',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header + Token Savings Pill */}
          <div className='flex items-center justify-between gap-8px pb-8px border-b border-solid border-b-base flex-wrap'>
            <span className='text-13px font-600'>
              {t('team.modelHub.compactPopoverTitle', { defaultValue: 'Context Window & Compaction' })}
            </span>
            <span
              data-testid='team-economy-savings-pill'
              className='px-7px py-1px rounded-full text-10px font-600 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono'
            >
              {tokensSavedEstimate > 0 || coalescedWakesSaved > 0
                ? t('team.modelHub.economySavingsBadge', {
                    tokens:
                      tokensSavedEstimate >= 1000
                        ? `${(tokensSavedEstimate / 1000).toFixed(1)}K`
                        : String(tokensSavedEstimate),
                    wakes: coalescedWakesSaved,
                    defaultValue: `Saved ~${
                      tokensSavedEstimate >= 1000
                        ? `${(tokensSavedEstimate / 1000).toFixed(1)}K`
                        : tokensSavedEstimate
                    } tok · ${coalescedWakesSaved} wakes`,
                  })
                : t('team.modelHub.smartCeilingBadge', {
                    ceiling: isSmartCeilingActive ? '160K' : '200K',
                    defaultValue: `${isSmartCeilingActive ? '160K' : '200K'} Ceiling`,
                  })}
            </span>
          </div>

          {/* Economy Mode: Lean Digest vs Balanced vs Verbose */}
          <div className='flex flex-col gap-5px px-10px py-8px rounded-8px bg-2 border border-solid border-b-base'>
            <div className='flex items-center justify-between gap-6px'>
              <span className='text-11px font-600 text-t-primary'>
                {t('team.modelHub.economyModeLabel', { defaultValue: 'Team Economy Mode' })}
              </span>
              <span className='text-10px text-t-tertiary'>
                {activeEconomyMode === 'lean'
                  ? t('team.modelHub.economyModeLeanHint', { defaultValue: 'Batched digest · min wakes' })
                  : activeEconomyMode === 'balanced'
                    ? t('team.modelHub.economyModeBalancedHint', { defaultValue: 'Standard handoffs' })
                    : t('team.modelHub.economyModeVerboseHint', { defaultValue: 'Full raw logs' })}
              </span>
            </div>
            <div className='grid grid-cols-3 gap-4px p-2px rounded-6px bg-1 border border-solid border-b-base'>
              {(
                [
                  {
                    key: 'lean' as const,
                    label: t('team.modelHub.economyModeLean', { defaultValue: 'Lean Digest' }),
                  },
                  {
                    key: 'balanced' as const,
                    label: t('team.modelHub.economyModeBalanced', { defaultValue: 'Balanced' }),
                  },
                  {
                    key: 'verbose' as const,
                    label: t('team.modelHub.economyModeVerbose', { defaultValue: 'Verbose' }),
                  },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type='button'
                  data-testid={`team-economy-mode-${opt.key}`}
                  aria-pressed={activeEconomyMode === opt.key}
                  onClick={() => void handleSelectEconomyMode(opt.key)}
                  className={classNames(
                    'py-4px px-6px rounded-5px text-11px border-0 cursor-pointer transition-colors outline-none truncate',
                    activeEconomyMode === opt.key
                      ? 'bg-[#165DFF] text-white font-600'
                      : 'bg-transparent text-t-secondary hover:text-t-primary'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {hasTeamMeteredTokens && (
              <div
                data-testid='team-economy-telemetry-bar'
                title={`${resolvedInputTokens.toLocaleString('en-US')} in · ${resolvedCachedReadTokens.toLocaleString('en-US')} cached · ${resolvedOutputTokens.toLocaleString('en-US')} out`}
                className='flex items-center justify-between gap-6px pt-5px mt-2px border-t border-solid border-b-base text-10px'
              >
                <div className='flex items-center gap-5px min-w-0 truncate'>
                  <span className='font-600 text-t-secondary shrink-0'>
                    {t('team.modelHub.actualTokensLabel', { defaultValue: 'Actual' })}
                  </span>
                  <span className='font-mono text-t-tertiary truncate'>
                    {t('team.modelHub.actualTokensBreakdown', {
                      input: formatCompactTokens(resolvedInputTokens),
                      cached: formatCompactTokens(resolvedCachedReadTokens),
                      output: formatCompactTokens(resolvedOutputTokens),
                      defaultValue: 'In {{input}} · Cache {{cached}} · Out {{output}}',
                    })}
                  </span>
                </div>
                <span
                  data-testid='team-economy-kv-cache-badge'
                  className={classNames(
                    'px-5px py-0.5px rounded-full font-mono font-600 shrink-0',
                    teamKvCacheHitPct >= 40
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-1 border border-solid border-b-base text-t-secondary'
                  )}
                >
                  {t('team.modelHub.kvCacheHitBadge', {
                    pct: teamKvCacheHitPct,
                    defaultValue: 'KV-Cache {{pct}}%',
                  })}
                </span>
              </div>
            )}
          </div>

          {/* 160K Smart Token Ceiling + Auto-Compact 80% Toggles */}
          <div className='flex flex-col gap-6px'>
            <div className='flex items-center justify-between gap-10px px-10px py-7px rounded-8px bg-2 border border-solid border-b-base'>
              <div className='flex flex-col gap-1px min-w-0 flex-1'>
                <span className='text-12px font-600 text-t-primary'>
                  {t('team.modelHub.smartCeilingLabel', {
                    defaultValue: '160K Smart Context Ceiling',
                  })}
                </span>
                <span className='text-10px text-t-tertiary leading-14px'>
                  {t('team.modelHub.smartCeilingDesc', {
                    defaultValue: 'Cap active context at 160K tokens to avoid long-context drift & surcharges',
                  })}
                </span>
              </div>
              <Switch
                size='small'
                className='shrink-0'
                data-testid='team-compact-ceiling-toggle'
                checked={isSmartCeilingActive}
                onChange={(val) => void handleToggleCeiling(val)}
              />
            </div>

            <div className='flex items-center justify-between gap-10px px-10px py-8px rounded-8px bg-2 border border-solid border-b-base'>
            <div className='flex flex-col gap-2px min-w-0 flex-1'>
              <span className='text-12px font-600 text-t-primary'>
                {t('team.modelHub.autoCompactLabel', {
                  threshold: autoCompactThresholdPct,
                  defaultValue: `Auto-Compact at ${autoCompactThresholdPct}%`,
                })}
              </span>
              <span className='text-10px text-t-tertiary leading-14px'>
                {t('team.modelHub.autoCompactDesc', {
                  defaultValue: 'Automatically compact or rollover with Anchored Summary at turn boundary',
                })}
              </span>
            </div>
            <div className='shrink-0 flex items-center'>
              <Switch
                size='small'
                className='shrink-0'
                data-testid='team-compact-auto-switch'
                checked={autoCompactEnabled}
                onChange={(val) => void handleToggleAuto(val)}
              />
            </div>
          </div>
          </div>

          {/* Per-Member Context Bars (including Leader) */}
          <div className='max-h-240px overflow-y-auto flex flex-col gap-8px pe-2px'>
            {effectiveSlots.length === 0 ? (
              <div className='py-12px text-center text-11px text-t-tertiary'>
                {t('team.modelHub.noSlotsContext', {
                  defaultValue: 'Context usage appears once team members are active',
                })}
              </div>
            ) : (
              effectiveSlots.map((slot) => {
                const pct = Math.max(0, Math.min(100, Math.round(slot.usage_percent)));
                const level = resolveSlotContextLevel(pct, slot.level);
                const isLeader = slot.role === 'leader' || slot.role === 'lead';
                const slotIn = Math.max(0, slot.input_tokens_total ?? 0);
                const slotOut = Math.max(0, slot.output_tokens_total ?? 0);
                const slotCached = Math.max(0, slot.cached_read_tokens_total ?? 0);
                const hasSlotMeteredTokens = slotIn + slotOut + slotCached > 0;
                const slotKvPct = computeKvCacheHitPct(slotIn, slotCached);
                return (
                  <div
                    key={slot.slot_id}
                    data-testid={`team-compact-slot-row-${slot.slot_id}`}
                    className='p-8px rounded-8px bg-2 border border-solid border-b-base flex flex-col gap-5px'
                  >
                    <div className='flex items-center justify-between gap-6px'>
                      <div className='flex items-center gap-5px min-w-0 flex-1'>
                        <span className='text-12px font-600 truncate'>
                          {isLeader ? '👑 ' : ''}
                          {slot.name}
                        </span>
                        <span
                          className={classNames(
                            'px-5px py-0.5px rounded-full text-10px font-600 shrink-0',
                            slot.wallet_type === 'cli_subscription'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          )}
                        >
                          {slot.wallet_type === 'cli_subscription'
                            ? t('team.modelHub.cliBadge', { defaultValue: '$0 CLI' })
                            : t('team.modelHub.apiBadge', { defaultValue: 'API' })}
                        </span>
                      </div>
                      <div className='flex items-center gap-6px shrink-0'>
                        <span
                          className={classNames(
                            'text-11px font-mono font-700',
                            level === 'critical'
                              ? 'text-red-600 dark:text-red-400'
                              : level === 'warning'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {pct}%
                        </span>
                        <Button
                          size='mini'
                          type='secondary'
                          className='!bg-1 !border !border-solid !border-b-base !rounded-6px'
                          data-testid={`team-compact-slot-btn-${slot.slot_id}`}
                          loading={compactingSlotId === slot.slot_id}
                          disabled={compacting}
                          onClick={() => void handleCompactSlotClick(slot.slot_id)}
                        >
                          {t('team.modelHub.compactShortBtn', { defaultValue: 'Compact' })}
                        </Button>
                      </div>
                    </div>
                    <div className='w-full'>
                      <Progress
                        percent={pct}
                        size='small'
                        showText={false}
                        status={level === 'critical' ? 'error' : level === 'warning' ? 'warning' : 'normal'}
                      />
                    </div>
                    <div className='flex items-center justify-between text-10px text-t-tertiary font-mono'>
                      <span className='truncate'>
                        {slot.backend}/{slot.model_id || 'default'}
                      </span>
                      <div className='flex items-center gap-6px shrink-0'>
                        {slot.compaction_count > 0 && (
                          <span>
                            {t('team.modelHub.compactedCount', {
                              count: slot.compaction_count,
                              defaultValue: `Compacted ×${slot.compaction_count}`,
                            })}
                          </span>
                        )}
                        {slot.has_anchored_summary && (
                          <span className='text-[#165DFF]'>
                            {t('team.modelHub.anchoredBadge', { defaultValue: 'Anchored' })}
                          </span>
                        )}
                      </div>
                    </div>
                    {hasSlotMeteredTokens && (
                      <div
                        data-testid={`team-compact-slot-telemetry-${slot.slot_id}`}
                        title={`${slotIn.toLocaleString('en-US')} in · ${slotCached.toLocaleString('en-US')} cached · ${slotOut.toLocaleString('en-US')} out`}
                        className='flex items-center justify-between gap-6px text-10px text-t-tertiary font-mono pt-3px border-t border-dashed border-b-base'
                      >
                        <span className='truncate'>
                          {t('team.modelHub.slotTokensSummary', {
                            input: formatCompactTokens(slotIn),
                            cached: formatCompactTokens(slotCached),
                            output: formatCompactTokens(slotOut),
                            defaultValue: 'In {{input}} · Cache {{cached}} · Out {{output}}',
                          })}
                        </span>
                        <span
                          data-testid={`team-compact-slot-kv-cache-${slot.slot_id}`}
                          className={classNames(
                            'shrink-0 font-600',
                            slotKvPct >= 40 ? 'text-emerald-600 dark:text-emerald-400' : 'text-t-secondary'
                          )}
                        >
                          {t('team.modelHub.kvCacheHitBadge', {
                            pct: slotKvPct,
                            defaultValue: 'KV-Cache {{pct}}%',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 1-Click Compact Entire Team */}
          <Button
            type='primary'
            size='small'
            long
            data-testid='team-compact-all-btn'
            loading={compacting && !compactingSlotId}
            onClick={() => void handleCompactAllClick()}
          >
            {t('team.modelHub.compactAllBtn', { defaultValue: 'Compact Entire Team' })}
          </Button>
        </div>
      )}
    >
      {children}
    </Trigger>
  );
};

export default TeamContextCompactPopover;
