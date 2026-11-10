/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Message, Progress, Switch, Trigger } from '@arco-design/web-react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { CompactTeamContextResponse, SlotContextStatusDto } from '@/common/types/team/teamHubTypes';
import { resolveSlotContextLevel } from './useTeamContextAndModels';

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
  compacting?: boolean;
  onToggleAutoCompact: (enabled: boolean) => Promise<CompactTeamContextResponse | undefined>;
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
  compacting = false,
  onToggleAutoCompact,
  onCompactAll,
  onCompactSlot,
  position = 'br',
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [compactingSlotId, setCompactingSlotId] = useState<string | null>(null);

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
          className='w-340px max-w-[calc(100vw-24px)] flex flex-col gap-10px rd-10px border border-solid border-arco-2 bg-bg-1 p-12px shadow-lg text-t-primary'
          style={{ zIndex: 10050 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className='flex items-center justify-between gap-8px pb-8px border-b border-solid border-arco-2'>
            <span className='text-13px font-600'>
              {t('team.modelHub.compactPopoverTitle', { defaultValue: 'Context Window & Compaction' })}
            </span>
          </div>

          {/* Auto-Compact 80% Toggle */}
          <div className='flex items-center justify-between gap-10px p-8px rd-8px bg-fill-1 border border-solid border-arco-2'>
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
            <Switch
              size='small'
              data-testid='team-compact-auto-switch'
              checked={autoCompactEnabled}
              onChange={(val) => void handleToggleAuto(val)}
            />
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
                return (
                  <div
                    key={slot.slot_id}
                    data-testid={`team-compact-slot-row-${slot.slot_id}`}
                    className='p-8px rd-8px bg-fill-1 border border-solid border-arco-2 flex flex-col gap-5px'
                  >
                    <div className='flex items-center justify-between gap-6px'>
                      <div className='flex items-center gap-5px min-w-0 flex-1'>
                        <span className='text-12px font-600 truncate'>
                          {isLeader ? '👑 ' : ''}
                          {slot.name}
                        </span>
                        <span
                          className={classNames(
                            'px-4px py-0.5px rd-999px text-10px font-600 shrink-0',
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
                          data-testid={`team-compact-slot-btn-${slot.slot_id}`}
                          loading={compactingSlotId === slot.slot_id}
                          disabled={compacting}
                          onClick={() => void handleCompactSlotClick(slot.slot_id)}
                        >
                          {t('team.modelHub.compactShortBtn', { defaultValue: 'Compact' })}
                        </Button>
                      </div>
                    </div>
                    <Progress
                      percent={pct}
                      size='small'
                      showText={false}
                      status={level === 'critical' ? 'error' : level === 'warning' ? 'warning' : 'normal'}
                    />
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
