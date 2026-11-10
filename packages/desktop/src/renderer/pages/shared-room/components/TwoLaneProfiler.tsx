import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Message, Progress, Switch, Tag } from '@arco-design/web-react';
import { Exchange, Lightning, Tool } from '@icon-park/react';
import classNames from 'classnames';
import useSWR from 'swr';
import { wallets } from '@/common/adapter/ipcBridge';
import type { ModelTargetSpec, TeamContextStatusResponse } from '@/common/types/team/teamHubTypes';
import ConnectedModelPickerPopover, {
  type ModelPickerSelectionMeta,
} from '@/renderer/pages/team/components/modelHub/ConnectedModelPickerPopover';
import {
  resolveSlotContextLevel,
  useTeamContextAndModels,
} from '@/renderer/pages/team/components/modelHub/useTeamContextAndModels';

export interface TwoLaneProfilerProps {
  modelTimeSec?: number;
  toolTimeSec?: number;
  totalTimeSec?: number;
  showWalletCards?: boolean;
  teamId?: string;
  roomTeams?: Array<{ team_id: string; team_name: string }>;
  initialContextStatus?: TeamContextStatusResponse;
}

export const TwoLaneProfiler: React.FC<TwoLaneProfilerProps> = ({
  modelTimeSec = 26.0,
  toolTimeSec = 22.2,
  totalTimeSec = 48.2,
  showWalletCards = true,
  teamId,
  roomTeams,
  initialContextStatus,
}) => {
  const { t } = useTranslation();

  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(
    teamId ?? roomTeams?.[0]?.team_id ?? initialContextStatus?.team_id
  );

  useEffect(() => {
    if (teamId) {
      setSelectedTeamId(teamId);
    }
  }, [teamId]);

  const effectiveTeamId = selectedTeamId ?? teamId ?? initialContextStatus?.team_id;
  const showContextSection = Boolean(effectiveTeamId || initialContextStatus);

  const {
    slots,
    autoCompactEnabled,
    autoCompactThresholdPct,
    compacting,
    switchingModels,
    compactTeam,
    toggleAutoCompact,
    switchModels,
  } = useTeamContextAndModels(effectiveTeamId, initialContextStatus);

  const { data: walletData, mutate: mutateWallet } = useSWR(
    '/api/wallets/summary',
    () => wallets.summary.invoke(),
    { revalidateOnFocus: true }
  );

  useEffect(() => {
    const unsub = wallets.spendUpdated?.on(() => {
      void mutateWallet();
    });
    return () => {
      unsub?.();
    };
  }, [mutateWallet]);

  const handleBulkSwitchModels = useCallback(
    async (target: ModelTargetSpec, meta: ModelPickerSelectionMeta) => {
      try {
        const res =
          meta.scope === 'slots' && meta.slotId
            ? await switchModels({
                scope: 'slots',
                updates: [{ slot_id: meta.slotId, target }],
                force_interrupt: meta.forceInterrupt,
              })
            : await switchModels({
                scope: meta.scope === 'teammates_only' ? 'teammates_only' : 'all',
                target,
                force_interrupt: meta.forceInterrupt,
              });
        const count = res?.outcomes?.length ?? 1;
        Message.success(
          t('team.modelHub.switchModelsSuccess', 'Updated models for {{count}} member(s)', { count })
        );
      } catch (err) {
        Message.error(
          t('team.modelHub.switchModelsFailed', 'Failed to switch models: {{error}}', {
            error: String(err),
          })
        );
      }
    },
    [switchModels, t]
  );

  const handleSlotSwitchModel = useCallback(
    async (slotId: string, target: ModelTargetSpec, meta: ModelPickerSelectionMeta) => {
      try {
        await switchModels({
          scope: 'slots',
          updates: [{ slot_id: slotId, target }],
          force_interrupt: meta.forceInterrupt,
        });
        Message.success(
          t('team.modelHub.switchModelsSuccess', 'Updated models for {{count}} member(s)', { count: 1 })
        );
      } catch (err) {
        Message.error(
          t('team.modelHub.switchModelsFailed', 'Failed to switch models: {{error}}', {
            error: String(err),
          })
        );
      }
    },
    [switchModels, t]
  );

  const handleCompactSlot = useCallback(
    async (slotId?: string) => {
      try {
        const res = await compactTeam(slotId ? { slot_id: slotId, mode: 'auto' } : { mode: 'auto' });
        const count = res?.outcomes?.length ?? 1;
        Message.success(
          t('team.modelHub.compactSuccess', 'Compacted context for {{count}} member(s)', { count })
        );
      } catch (err) {
        Message.error(
          t('team.modelHub.compactFailed', 'Failed to compact context: {{error}}', {
            error: String(err),
          })
        );
      }
    },
    [compactTeam, t]
  );

  const apiSpent = walletData?.api_key_spent_usd ?? 1.4;
  const apiLimit = walletData?.api_key_budget_limit_usd ?? 5.0;
  const cliRuns = walletData?.cli_subscription_runs ?? 38;
  const apiPercent = Math.min(100, Math.round((apiSpent / (apiLimit || 1)) * 100));

  const total = modelTimeSec + toolTimeSec || 1;
  const modelPct = Math.round((modelTimeSec / total) * 100);
  const toolPct = 100 - modelPct;

  return (
    <div
      data-testid='two-lane-profiler'
      className='flex flex-col gap-16px p-12px text-12px'
    >
      {/* 2-Lane Timeline Tracks */}
      <div className='flex flex-col gap-10px p-12px rd-10px bg-fill-2 border border-solid border-arco-2'>
        <div className='flex items-center justify-between'>
          <span className='font-bold text-t-primary'>
            {t('team.sharedRoom.preview.profiler.timelineTitle', '2-Lane Execution Timeline')}
          </span>
          <Tag color='arcoblue' size='small' className='font-mono font-bold'>
            {t('team.sharedRoom.preview.profiler.totalTurnaround', 'Total Turnaround: {{time}}s', {
              time: totalTimeSec.toFixed(1),
            })}
          </Tag>
        </div>

        {/* Track 1: Model Lane */}
        <div className='flex flex-col gap-4px'>
          <div className='flex items-center justify-between text-11px text-t-secondary'>
            <span className='flex items-center gap-4px font-medium'>
              <Lightning theme='filled' size='12' className='text-purple-500' />
              {t('team.sharedRoom.preview.profiler.modelLane', '🧠 Model Latency')}
            </span>
            <span className='font-mono'>{modelTimeSec.toFixed(1)}s ({modelPct}%)</span>
          </div>
          <div className='h-8px rd-full bg-fill-3 overflow-hidden'>
            <div
              data-testid='profiler-model-lane'
              className='h-full bg-purple-500 rd-full transition-all'
              style={{ width: `${modelPct}%` }}
            />
          </div>
        </div>

        {/* Track 2: Tool / CLI Lane */}
        <div className='flex flex-col gap-4px'>
          <div className='flex items-center justify-between text-11px text-t-secondary'>
            <span className='flex items-center gap-4px font-medium'>
              <Tool theme='outline' size='12' className='text-cyan-600' />
              {t('team.sharedRoom.preview.profiler.toolLane', '🛠️ Tool / CLI Latency')}
            </span>
            <span className='font-mono'>{toolTimeSec.toFixed(1)}s ({toolPct}%)</span>
          </div>
          <div className='h-8px rd-full bg-fill-3 overflow-hidden'>
            <div
              data-testid='profiler-tool-lane'
              className='h-full bg-cyan-500 rd-full transition-all'
              style={{ width: `${toolPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Dual Wallet Overview Cards */}
      {showWalletCards && (
        <div className='flex flex-col gap-10px'>
          <div className='font-bold text-t-primary'>
            {t('team.sharedRoom.preview.profiler.dualWallet', 'Dual Wallet Overview')}
          </div>

          <div className='grid grid-cols-1 gap-8px'>
            {/* Wallet 1: CLI Subscription ($0) */}
            <div
              data-testid='wallet-cli-card'
              className='p-12px rd-10px bg-green-50/50 dark:bg-green-950/20 border border-solid border-green-200 dark:border-green-800 flex flex-col gap-6px'
            >
              <div className='flex items-center justify-between'>
                <span className='font-bold text-green-700 dark:text-green-300 text-12px'>
                  {t('team.sharedRoom.preview.profiler.walletCli', 'Wallet 1: CLI Subscription ($0 OAuth)')}
                </span>
                <Tag color='green' size='small'>
                  $0.00
                </Tag>
              </div>
              <div className='text-11px text-t-secondary'>
                {t('team.sharedRoom.preview.profiler.runsCount', '{{count}} runs', { count: cliRuns })} • Claude Max / Codex CLI
              </div>
            </div>

            {/* Wallet 2: API Key (Pay-per-token) */}
            <div
              data-testid='wallet-api-card'
              className='p-12px rd-10px bg-fill-2 border border-solid border-arco-2 flex flex-col gap-6px'
            >
              <div className='flex items-center justify-between'>
                <span className='font-bold text-t-primary text-12px'>
                  {t('team.sharedRoom.preview.profiler.walletApi', 'Wallet 2: API Key (Pay-per-token)')}
                </span>
                <span className='font-mono text-11px font-bold text-t-primary'>
                  ${apiSpent.toFixed(2)} / ${apiLimit.toFixed(2)}
                </span>
              </div>
              <Progress
                percent={apiPercent}
                status={apiPercent >= 100 ? 'error' : apiPercent >= 80 ? 'warning' : 'normal'}
                size='small'
              />
            </div>
          </div>
        </div>
      )}

      {/* Context Window Health & Connected Models Section */}
      {showContextSection && (
        <div
          data-testid='profiler-context-health'
          className='flex flex-col gap-10px p-12px rd-10px bg-fill-2 border border-solid border-arco-2'
        >
          <div className='flex flex-wrap items-center justify-between gap-8px'>
            <span className='font-bold text-t-primary'>
              {t('team.modelHub.contextHealthTitle', 'Context Window Health')}
            </span>
            <div className='flex items-center gap-8px flex-wrap'>
              <label className='inline-flex items-center gap-5px text-11px text-t-secondary cursor-pointer select-none'>
                <Switch
                  size='small'
                  data-testid='profiler-auto-compact-switch'
                  checked={autoCompactEnabled}
                  onChange={(val) => void toggleAutoCompact(val)}
                />
                <span>
                  {t('team.modelHub.autoCompactLabel', 'Auto-Compact at {{threshold}}%', {
                    threshold: autoCompactThresholdPct,
                  })}
                </span>
              </label>

              <Button
                size='mini'
                type='secondary'
                data-testid='profiler-compact-all-btn'
                loading={compacting}
                onClick={() => void handleCompactSlot(undefined)}
              >
                {t('team.modelHub.compactBtn', 'Compact Context')}
              </Button>

              <ConnectedModelPickerPopover
                disabled={switchingModels}
                showScopeSelector
                showForceInterrupt
                teamOptions={roomTeams}
                selectedTeamId={effectiveTeamId}
                onSelectTeamId={setSelectedTeamId}
                panelTestId='profiler-switch-models-panel'
                onSelectModel={handleBulkSwitchModels}
              >
                <Button
                  size='mini'
                  type='outline'
                  data-testid='profiler-switch-models-btn'
                  loading={switchingModels}
                  icon={<Exchange theme='outline' size='12' fill='currentColor' />}
                >
                  {t('team.modelHub.switchModelsBtn', 'Switch Models')}
                </Button>
              </ConnectedModelPickerPopover>
            </div>
          </div>

          {roomTeams && roomTeams.length > 1 && (
            <div className='flex items-center gap-4px flex-wrap'>
              {roomTeams.map((tm) => (
                <button
                  key={tm.team_id}
                  type='button'
                  data-testid={`profiler-team-pill-${tm.team_id}`}
                  onClick={() => setSelectedTeamId(tm.team_id)}
                  className={classNames(
                    'px-8px py-2px rd-999px text-11px border-0 cursor-pointer transition-colors',
                    effectiveTeamId === tm.team_id
                      ? 'bg-[#165DFF] text-white font-600'
                      : 'bg-fill-3 text-t-secondary hover:text-t-primary'
                  )}
                >
                  {tm.team_name}
                </button>
              ))}
            </div>
          )}

          {slots.length === 0 ? (
            <div className='py-8px text-11px text-t-tertiary'>
              {t('team.modelHub.noSlotsContext', 'Context usage appears once team members are active')}
            </div>
          ) : (
            <div className='flex flex-col gap-8px'>
              {slots.map((slot) => {
                const pct = Math.max(0, Math.min(100, Math.round(slot.usage_percent)));
                const level = resolveSlotContextLevel(pct, slot.level);
                const isLeader = slot.role === 'leader' || slot.role === 'lead';
                return (
                  <div
                    key={slot.slot_id}
                    data-testid={`profiler-slot-card-${slot.slot_id}`}
                    className='p-10px rd-8px bg-bg-1 border border-solid border-arco-2 flex flex-col gap-6px'
                  >
                    <div className='flex items-center justify-between gap-6px'>
                      <div className='flex items-center gap-6px min-w-0 flex-1'>
                        <span className='font-600 text-12px text-t-primary truncate'>
                          {isLeader ? '👑 ' : ''}
                          {slot.name}
                        </span>
                        <span
                          data-testid={`profiler-slot-wallet-${slot.slot_id}`}
                          className={classNames(
                            'px-5px py-0.5px rd-999px text-10px font-600 shrink-0',
                            slot.wallet_type === 'cli_subscription'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          )}
                        >
                          {slot.wallet_type === 'cli_subscription'
                            ? t('team.modelHub.cliBadge', '$0 CLI')
                            : t('team.modelHub.apiBadge', 'API')}
                        </span>
                      </div>

                      <div className='flex items-center gap-6px shrink-0'>
                        <span
                          data-testid={`profiler-slot-pct-${slot.slot_id}`}
                          data-context-level={level}
                          className={classNames(
                            'px-6px py-1px rd-999px text-10px font-mono font-700',
                            level === 'critical'
                              ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                              : level === 'warning'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          )}
                        >
                          {pct}%
                        </span>

                        <Button
                          size='mini'
                          type='secondary'
                          data-testid={`profiler-slot-compact-${slot.slot_id}`}
                          loading={compacting}
                          onClick={() => void handleCompactSlot(slot.slot_id)}
                        >
                          {t('team.modelHub.compactShortBtn', 'Compact')}
                        </Button>

                        <ConnectedModelPickerPopover
                          showForceInterrupt
                          panelTestId={`profiler-slot-switch-panel-${slot.slot_id}`}
                          onSelectModel={(target, meta) => handleSlotSwitchModel(slot.slot_id, target, meta)}
                        >
                          <Button
                            size='mini'
                            type='outline'
                            data-testid={`profiler-slot-switch-${slot.slot_id}`}
                            disabled={switchingModels}
                          >
                            {t('team.modelHub.switchModelsBtn', 'Switch Models')}
                          </Button>
                        </ConnectedModelPickerPopover>
                      </div>
                    </div>

                    <Progress
                      percent={pct}
                      size='small'
                      showText={false}
                      status={level === 'critical' ? 'error' : level === 'warning' ? 'warning' : 'normal'}
                    />

                    <div className='flex items-center justify-between gap-8px text-10px text-t-tertiary font-mono flex-wrap'>
                      <span data-testid={`profiler-slot-model-${slot.slot_id}`} className='truncate'>
                        {slot.backend} / {slot.model_id || 'default'}
                      </span>
                      <div className='flex items-center gap-8px shrink-0'>
                        <span data-testid={`profiler-slot-compactions-${slot.slot_id}`}>
                          {t('team.modelHub.compactedCount', 'Compacted ×{{count}}', {
                            count: slot.compaction_count,
                          })}
                        </span>
                        {slot.has_anchored_summary && (
                          <span className='text-[#165DFF]'>
                            {t('team.modelHub.anchoredBadge', 'Anchored')}
                          </span>
                        )}
                        {slot.pending_model_swap && (
                          <span className='text-amber-600 dark:text-amber-400'>
                            {t('team.modelHub.pendingSwapBadge', 'Pending swap → {{model}}', {
                              model: `${slot.pending_model_swap.backend}/${slot.pending_model_swap.model_id}`,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
