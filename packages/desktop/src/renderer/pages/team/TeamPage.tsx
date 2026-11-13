import { Button, Dropdown, Menu, Message, Modal, Spin, Tooltip } from '@arco-design/web-react';
import { Exchange, FullScreen, Left, Lightning, MoreOne, OffScreen, Peoples, Refresh, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { ipcBridge } from '@/common';
import type { ITeamSlotWork, TeamAssistant, TeamContextResetAvailability, TTeam } from '@/common/types/team/teamTypes';
import type { ModelTargetSpec, SlotContextStatusDto } from '@/common/types/team/teamHubTypes';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import {
  classifyConfigSetError,
  revalidateAcpConfigOptions,
  useAcpConfigOptions,
} from '@/renderer/hooks/agent/useAcpConfigOptions';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSlider from '@renderer/pages/conversation/components/ChatSlider.tsx';
import { useTeamPendingPermissions } from './hooks/useTeamPendingPermissions';
import { buildTeamRetryStartHandler } from './components/teamSendRuntime';
import AcpModelSelector, { type AcpWarmupStatus } from '@/renderer/components/agent/AcpModelSelector';
import AcpRuntimeRestartButton, { useAcpRuntimeRestart } from '@/renderer/components/agent/AcpRuntimeRestartButton';
import AionrsModelSelector from '@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import { CronJobManager } from '@/renderer/pages/cron';
import { resolveCronJobId } from '@/renderer/pages/cron/cronUtils';
import TeamTabs from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import TeamAgentIdentity from './components/TeamAgentIdentity';
import TeamViewToggle from './components/TeamViewToggle';
import TeamTelegramBridgePopover from './components/TeamTelegramBridgePopover';
import TeamActivityView from './activity/TeamActivityView';
import TeamWarmupOverlay from './components/TeamWarmupOverlay';
import { useTeamViewMode } from './hooks/useTeamViewMode';
import { useTeamWarmup, type TeamWarmupMemberState, type TeamWarmupPhase } from './hooks/useTeamWarmup';
import { TeamTabsProvider, useTeamTabs } from './hooks/TeamTabsContext';
import { TeamIdentityProvider } from './identity/TeamIdentityContext';
import { TeamPermissionProvider, useTeamPermission } from './hooks/TeamPermissionContext';
import { useTeamSession } from './hooks/useTeamSession';
import { useTeamRunView, type TeamRunViewState } from './hooks/useTeamRunView';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useActiveLease } from '@/renderer/pages/conversation/hooks/useActiveLease';
import { resolveTeamWorkspaceView } from './utils/teamWorkspaceView';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { previewScopeKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { setCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';
import { setCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import { getSnapshotConversationProjectId } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { getTeamHubBridge } from './components/modelHub/bridgeSafe';
import ConnectedModelPickerPopover from './components/modelHub/ConnectedModelPickerPopover';
import { resolveSlotContextLevel, useTeamContextAndModels } from './components/modelHub/useTeamContextAndModels';

type Props = {
  team: TTeam;
};

const NON_ACP_BACKENDS = new Set(['aionrs', 'openclaw-gateway', 'nanobot', 'remote']);

function isAcpLikeBackend(backend: string | undefined): boolean {
  if (!backend) return false;
  return !NON_ACP_BACKENDS.has(backend);
}

type TeamPageContentProps = {
  team: TTeam;
  onRenameTeam: (new_name: string) => Promise<boolean>;
  warmupPhase: TeamWarmupPhase;
  warmupRuntimeStatus: Map<string, TeamWarmupMemberState>;
  onRetryWarmup: () => void;
};

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

/** Compact aionrs model selector for the agent header */
const AionrsHeaderModelSelector: React.FC<{
  conversation_id: string;
  team_id?: string;
  slot_id?: string;
  initialModel?: TProviderWithModel;
}> = ({ conversation_id, team_id, slot_id, initialModel }) => {
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, use_model: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation_id, updates: { model: selected } });
      const hub = getTeamHubBridge();
      if (ok && team_id && slot_id && hub?.switchModels?.invoke) {
        await hub.switchModels.invoke({
          team_id,
          scope: 'slots',
          updates: [
            {
              slot_id,
              target: {
                backend: 'aionrs',
                provider_id: _provider.id,
                model_id: modelName,
              },
            },
          ],
        });
      }
      return Boolean(ok);
    },
    [conversation_id, slot_id, team_id]
  );
  const modelSelection = useAionrsModelSelection({ initialModel, onSelectModel });
  const runtimeConfig = useAcpConfigOptions({
    conversation_id,
    prepareSetRuntime: teamPermission?.warmupSession,
    configOptionsPort: teamPermission?.configOptionsPort,
    enabled: Boolean(conversation_id),
  });
  const handleThoughtLevelSetOption = useCallback(
    async (optionId: string, value: string) => {
      try {
        const result = await runtimeConfig.setConfigOption(optionId, value);
        Message.success(t('agent.thoughtLevel.switchSuccess'));
        return result;
      } catch (error) {
        Message.error(t(configErrorMessageKey(error)));
        throw error;
      }
    },
    [runtimeConfig, t]
  );
  return (
    <AionrsModelSelector
      selection={modelSelection}
      disabled={runtimeConfig.isConfigOptionBlocked?.('model') ?? false}
      thoughtLevel={runtimeConfig.thoughtLevel}
      setStatus={runtimeConfig.setStatus}
      onSetThoughtLevel={handleThoughtLevelSetOption}
    />
  );
};

const contextResetAvailabilityMessageKey = (availability: TeamContextResetAvailability) => {
  switch (availability) {
    case 'initializing':
      return 'team.agentActions.disabled.initializing' as const;
    case 'busy':
      return 'team.agentActions.disabled.busy' as const;
    case 'dormant':
      return 'team.agentActions.disabled.dormant' as const;
    case 'failed':
      return 'team.agentActions.disabled.failed' as const;
    case 'removing':
      return 'team.agentActions.disabled.removing' as const;
    case 'session_stopped':
      return 'team.agentActions.disabled.sessionStopped' as const;
    case 'unsupported':
      return 'team.agentActions.disabled.unsupported' as const;
    case 'leader_not_targetable':
      return 'team.agentActions.disabled.leaderNotTargetable' as const;
    case 'ready':
      return 'team.agentActions.label' as const;
  }
};

const resolveRuntimeActionAvailability = ({
  warmupStatus,
  warmupDisabled,
  slotWork,
  sessionStopped,
  fallbackAvailability,
}: {
  warmupStatus?: AcpWarmupStatus;
  warmupDisabled: boolean;
  slotWork?: ITeamSlotWork;
  sessionStopped: boolean;
  fallbackAvailability: TeamContextResetAvailability;
}): TeamContextResetAvailability => {
  if (sessionStopped || slotWork?.blocked_reason === 'session_stopped') return 'session_stopped';
  if (slotWork?.blocked_reason === 'removing') return 'removing';
  if (warmupDisabled || warmupStatus === 'pending' || slotWork?.blocked_reason === 'runtime_starting') {
    return 'initializing';
  }
  if (warmupStatus === 'dormant') return 'dormant';
  if (warmupStatus === 'failed' || slotWork?.blocked_reason === 'runtime_failed') return 'failed';
  if (
    slotWork?.active_turn_id ||
    (slotWork?.queued_foreground_count ?? 0) > 0 ||
    (slotWork?.queued_background_count ?? 0) > 0
  ) {
    return 'busy';
  }
  if (warmupStatus === 'ready') return 'ready';
  return fallbackAvailability;
};

const runtimeAvailabilityToWarmupStatus = (availability: TeamContextResetAvailability): AcpWarmupStatus => {
  switch (availability) {
    case 'ready':
    case 'busy':
      return 'ready';
    case 'initializing':
      return 'pending';
    case 'failed':
      return 'failed';
    default:
      return 'dormant';
  }
};

const teamWarmupPhaseAvailability = (phase: TeamWarmupPhase): TeamContextResetAvailability => {
  switch (phase) {
    case 'ready':
      return 'ready';
    case 'error':
      return 'failed';
    case 'warming':
      return 'initializing';
  }
};

const contextResetErrorMessageKey = (error: unknown) => {
  if (!isBackendHttpError(error)) return 'team.agentActions.contextReset.failed' as const;
  switch (error.code) {
    case 'TEAM_MEMBER_BUSY':
      return 'team.agentActions.disabled.busy' as const;
    case 'TEAM_MEMBER_RUNTIME_STARTING':
      return 'team.agentActions.disabled.initializing' as const;
    case 'TEAM_MEMBER_DORMANT':
      return 'team.agentActions.disabled.dormant' as const;
    case 'TEAM_MEMBER_RUNTIME_FAILED':
      return 'team.agentActions.disabled.failed' as const;
    case 'TEAM_MEMBER_REMOVING':
      return 'team.agentActions.disabled.removing' as const;
    case 'TEAM_SESSION_STOPPED':
      return 'team.agentActions.disabled.sessionStopped' as const;
    case 'TEAM_MEMBER_UNSUPPORTED':
      return 'team.agentActions.disabled.unsupported' as const;
    case 'TEAM_CONTEXT_RESET_LEADER_NOT_TARGETABLE':
      return 'team.agentActions.disabled.leaderNotTargetable' as const;
    default:
      return 'team.agentActions.contextReset.failed' as const;
  }
};

const TeamAgentActions: React.FC<{
  assistant: TeamAssistant;
  team_id: string;
  runtimeAvailability: TeamContextResetAvailability;
  contextResetAvailability: TeamContextResetAvailability;
  compactingSlot?: boolean;
  onCompactSlot?: () => Promise<unknown>;
  onRuntimeChanged: () => Promise<void>;
}> = ({
  assistant,
  team_id,
  runtimeAvailability,
  contextResetAvailability,
  compactingSlot = false,
  onCompactSlot,
  onRuntimeChanged,
}) => {
  const { t } = useTranslation();
  const teamTarget = useMemo(() => ({ team_id, slot_id: assistant.slot_id }), [assistant.slot_id, team_id]);
  const { restart, restarting } = useAcpRuntimeRestart({
    conversation_id: assistant.conversation_id,
    team: teamTarget,
  });
  const [resetting, setResetting] = useState(false);
  const reconnectDisabled = runtimeAvailability !== 'ready';
  const reconnectDisabledReason = reconnectDisabled
    ? t(contextResetAvailabilityMessageKey(runtimeAvailability))
    : undefined;
  const contextResetDisabled = contextResetAvailability !== 'ready';
  const contextResetDisabledReason = contextResetDisabled
    ? t(contextResetAvailabilityMessageKey(contextResetAvailability))
    : undefined;

  const confirmReconnect = useCallback(() => {
    if (reconnectDisabled || restarting || resetting) return;
    Modal.confirm({
      title: t('agent.runtimeRestart.tooltip'),
      content: t('agent.runtimeRestart.confirmContent'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await restart();
          await onRuntimeChanged();
        } catch {
          // The shared restart action already presents the localized failure.
        }
      },
    });
  }, [onRuntimeChanged, reconnectDisabled, restart, restarting, resetting, t]);

  const confirmContextReset = useCallback(() => {
    if (contextResetDisabled || restarting || resetting) return;
    Modal.confirm({
      title: t('team.agentActions.contextReset.confirmTitle', { memberName: assistant.assistant_name }),
      content: t('team.agentActions.contextReset.confirmContent'),
      okText: t('team.agentActions.contextReset.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        setResetting(true);
        try {
          const outcome = await ipcBridge.team.resetAgentContext.invoke(teamTarget);
          if (outcome.reset_status === 'completed' && outcome.runtime_status === 'ready') {
            Message.success(t('team.agentActions.contextReset.success', { memberName: assistant.assistant_name }));
          } else if (outcome.reset_status === 'completed') {
            Message.warning(
              t('team.agentActions.contextReset.partialSuccess', { memberName: assistant.assistant_name })
            );
          } else {
            Message.error(t('team.agentActions.contextReset.notApplied'));
          }
          await Promise.all([revalidateAcpConfigOptions(assistant.conversation_id), onRuntimeChanged()]);
        } catch (error) {
          Message.error(t(contextResetErrorMessageKey(error)));
        } finally {
          setResetting(false);
        }
      },
    });
  }, [
    assistant.assistant_name,
    assistant.conversation_id,
    contextResetDisabled,
    onRuntimeChanged,
    restarting,
    resetting,
    t,
    teamTarget,
  ]);

  const actionContent = (title: string, description: string, reason?: string) => (
    <Tooltip content={reason} disabled={!reason} position='right'>
      <div className='flex min-w-220px flex-col py-2px'>
        <span className='text-13px'>{title}</span>
        <span className='text-12px text-t-secondary whitespace-normal'>{reason ?? description}</span>
      </div>
    </Tooltip>
  );
  const menu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'compact-context' && onCompactSlot) void onCompactSlot();
        if (key === 'reconnect') confirmReconnect();
        if (key === 'context-reset') confirmContextReset();
      }}
    >
      {onCompactSlot && (
        <Menu.Item key='compact-context' disabled={compactingSlot || restarting || resetting}>
          {actionContent(
            t('team.modelHub.compactSlotAction', { defaultValue: 'Compact Context' }),
            t('team.modelHub.compactSlotActionDesc', {
              defaultValue: 'Summarize history to free tokens without losing task progress',
            })
          )}
        </Menu.Item>
      )}
      <Menu.Item key='reconnect' disabled={reconnectDisabled || restarting || resetting}>
        {actionContent(
          t('agent.runtimeRestart.tooltip'),
          t('team.agentActions.reconnectDescription'),
          reconnectDisabledReason
        )}
      </Menu.Item>
      <Menu.Item
        key='context-reset'
        disabled={contextResetDisabled || restarting || resetting}
        style={{ color: 'rgb(var(--danger-6))' }}
      >
        {actionContent(
          t('team.agentActions.contextReset.title'),
          t('team.agentActions.contextReset.description'),
          contextResetDisabledReason
        )}
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown trigger='click' droplist={menu} position='br' disabled={restarting || resetting}>
      <Tooltip content={t('team.agentActions.label')}>
        <Button
          type='text'
          size='mini'
          className='h-28px w-28px'
          loading={restarting || resetting}
          icon={<MoreOne theme='outline' size='14' fill='currentColor' />}
          aria-label={t('team.agentActions.label')}
        />
      </Tooltip>
    </Dropdown>
  );
};

/** Fetches conversation for a single assistant and renders TeamChatView */
const AssistantChatSlot: React.FC<{
  assistant: TeamAssistant;
  team_id: string;
  isLeader: boolean;
  /** 成员身份色（列头名字 / 列身淡底）。 */
  color: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  teamRunView: TeamRunViewState;
  onTeamRunAck: ReturnType<typeof useTeamRunView>['applyAck'];
  onTeamSlotPaused: ReturnType<typeof useTeamRunView>['applyLocalPause'];
  onRunStateStale: ReturnType<typeof useTeamRunView>['reconcile'];
  /** Teammate runtime status observed after subscribing to warmup events. */
  warmupStatus?: AcpWarmupStatus;
  /** Server-derived fallback used when the renderer subscribed after the runtime event. */
  fallbackAvailability: TeamContextResetAvailability;
  /** 整队 warming 期间为 true —— 此时不下发手动触发器。 */
  warmupDisabled?: boolean;
  /** Live context window & wallet telemetry for this slot */
  slotContext?: SlotContextStatusDto;
  compactingSlot?: boolean;
  onCompactSlot?: (slotId: string) => Promise<unknown>;
  onSwitchSlotModel?: (slotId: string, target: ModelTargetSpec, forceInterrupt?: boolean) => Promise<unknown>;
}> = ({
  assistant,
  team_id,
  isLeader,
  color,
  isFullscreen = false,
  onToggleFullscreen,
  teamRunView,
  onTeamRunAck,
  onTeamSlotPaused,
  onRunStateStale,
  warmupStatus,
  fallbackAvailability,
  warmupDisabled,
  slotContext,
  compactingSlot = false,
  onCompactSlot,
  onSwitchSlotModel,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const teamPermission = useTeamPermission();
  const isMobile = layout?.isMobile ?? false;
  const { data: conversation, mutate: mutateConversation } = useSWR(
    assistant.conversation_id ? ['team-conversation', assistant.conversation_id] : null,
    () => getConversationOrNull(assistant.conversation_id)
  );

  useEffect(() => {
    const hub = getTeamHubBridge();
    if (!hub || !team_id) return;
    const unsubSwitched = hub.modelsSwitched?.on((ev) => {
      if (ev.team_id === team_id) {
        void mutateConversation();
      }
    });
    const unsubCompacted = hub.contextCompacted?.on((ev) => {
      if (ev.team_id === team_id) {
        void mutateConversation();
      }
    });
    return () => {
      unsubSwitched?.();
      unsubCompacted?.();
    };
  }, [mutateConversation, team_id]);

  const isAionrs = conversation?.type === 'aionrs';
  const initialModelId = (conversation?.extra as { current_model_id?: string })?.current_model_id;
  const isAcpLike = conversation?.type === 'acp' || isAcpLikeBackend(assistant.assistant_backend);
  const cronJobId = resolveCronJobId(conversation?.extra);
  // No model-change handler here on purpose: the team config-option request that
  // switches the runtime also persists the selection onto the roster, so there is
  // no second call to chain. Chaining one used to mean a failure after a
  // successful switch reported the switch itself as failed.
  // Reuse the existing single-teammate attach/warmup path; withhold the trigger
  // while the whole team is warming so manual wake is gated by phase.
  const warmup = useMemo<{ status: AcpWarmupStatus; trigger?: () => Promise<void> }>(
    () => ({
      status: warmupStatus ?? (warmupDisabled ? 'dormant' : runtimeAvailabilityToWarmupStatus(fallbackAvailability)),
      trigger: warmupDisabled ? undefined : buildTeamRetryStartHandler({ team_id, slot_id: assistant.slot_id }),
    }),
    [warmupStatus, fallbackAvailability, warmupDisabled, team_id, assistant.slot_id]
  );
  const runtimeActionAvailability = resolveRuntimeActionAvailability({
    warmupStatus,
    warmupDisabled: Boolean(warmupDisabled),
    slotWork: teamRunView.slotWorkBySlot[assistant.slot_id],
    sessionStopped: teamRunView.sessionStopped,
    fallbackAvailability,
  });
  const restartDisabled = runtimeActionAvailability !== 'ready';
  const contextResetAvailability =
    assistant.role === 'leader'
      ? 'leader_not_targetable'
      : assistant.context_reset.supported
        ? runtimeActionAvailability
        : assistant.context_reset.availability;
  const handleRuntimeChanged = useCallback(async () => {
    await Promise.all([mutateConversation(), onRunStateStale('context-reset.result')]);
  }, [mutateConversation, onRunStateStale]);
  const slotContextPct = slotContext ? Math.max(0, Math.min(100, Math.round(slotContext.usage_percent))) : undefined;
  const slotContextLevel =
    slotContext && slotContextPct !== undefined
      ? resolveSlotContextLevel(slotContextPct, slotContext.level)
      : undefined;
  const showRecoveryBanner =
    !warmupDisabled &&
    (assistant.status === 'failed' || warmup.status === 'failed' || runtimeActionAvailability === 'failed');

  // 抬头不叠身份色底（避免压低彩色名字的可读性）；成员身份仅由抬头里的“彩色名字”承担。
  // 列身体保留极淡身份色底作弱提示，不影响气泡阅读。
  return (
    <div className='flex flex-col h-full' style={{ background: `color-mix(in srgb, ${color} 4%, var(--bg-base))` }}>
      <div className='flex items-center justify-between gap-8px px-12px h-40px shrink-0 border-b border-solid border-[color:var(--border-base)] relative z-10 bg-1'>
        <div className='flex items-center gap-6px min-w-0 flex-1'>
          <TeamAgentIdentity
            assistant_name={assistant.assistant_name}
            assistant_backend={assistant.assistant_backend}
            icon={assistant.icon}
            conversation_id={assistant.conversation_id}
            isLeader={isLeader}
            className='min-w-0'
            nameClassName='text-13px font-600'
            nameStyle={{ color }}
          />
          {slotContext && (
            <>
              <span
                data-testid={`slot-header-wallet-${assistant.slot_id}`}
                className={classNames(
                  'shrink-0 px-5px py-0.5px rd-999px text-10px font-600 select-none',
                  slotContext.wallet_type === 'api_key'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                )}
              >
                {slotContext.wallet_type === 'api_key'
                  ? t('team.modelHub.apiBadge', { defaultValue: 'API' })
                  : t('team.modelHub.cliBadge', { defaultValue: '$0 CLI' })}
              </span>
              {slotContextPct !== undefined && slotContextLevel && (
                <span
                  data-testid={`slot-header-context-${assistant.slot_id}`}
                  data-context-level={slotContextLevel}
                  className={classNames(
                    'shrink-0 px-5px py-0.5px rd-999px text-10px font-mono font-700 leading-14px border border-solid select-none',
                    slotContextLevel === 'critical'
                      ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
                      : slotContextLevel === 'warning'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                  )}
                >
                  {slotContextPct}%
                </span>
              )}
            </>
          )}
        </div>
        <div className='flex items-center gap-8px shrink-0'>
          {conversation && <CronJobManager conversation_id={conversation.id} cron_job_id={cronJobId} />}
          {!isMobile && assistant.conversation_id && !isAionrs && isAcpLike && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AcpModelSelector
                key={assistant.conversation_id}
                conversation_id={assistant.conversation_id}
                backend={assistant.assistant_backend}
                initialModelId={initialModelId}
                prepareSetRuntime={teamPermission?.warmupSession}
                configOptionsPort={teamPermission?.configOptionsPort}
                warmup={warmup}
              />
            </div>
          )}
          {isLeader && onCompactSlot && Boolean(getTeamHubBridge()) && (
            <Tooltip
              content={t('team.modelHub.compactSlotAction', {
                defaultValue: 'Compact Context',
              })}
            >
              <button
                type='button'
                data-testid={`slot-compact-context-${assistant.slot_id}`}
                aria-label={t('team.modelHub.compactSlotAction', { defaultValue: 'Compact Context' })}
                disabled={compactingSlot}
                onClick={() => void onCompactSlot(assistant.slot_id)}
                className='h-26px w-26px rd-6px flex items-center justify-center bg-transparent hover:bg-[var(--fill-3)] text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] border-none cursor-pointer transition-colors shrink-0'
              >
                <Lightning theme='outline' size='14' fill='currentColor' />
              </button>
            </Tooltip>
          )}
          {assistant.conversation_id && !isAionrs && isAcpLike && isLeader && (
            <div className='shrink-0'>
              <AcpRuntimeRestartButton
                conversation_id={assistant.conversation_id}
                team={{ team_id, slot_id: assistant.slot_id }}
                availability={restartDisabled ? 'initializing' : 'ready'}
                disabled={restartDisabled}
                disabledReason={
                  restartDisabled ? t(contextResetAvailabilityMessageKey(runtimeActionAvailability)) : undefined
                }
              />
            </div>
          )}
          {assistant.conversation_id && !isAionrs && isAcpLike && !isLeader && (
            <div className='shrink-0'>
              <TeamAgentActions
                assistant={assistant}
                team_id={team_id}
                runtimeAvailability={runtimeActionAvailability}
                contextResetAvailability={contextResetAvailability}
                compactingSlot={compactingSlot}
                onCompactSlot={onCompactSlot ? () => onCompactSlot(assistant.slot_id) : undefined}
                onRuntimeChanged={handleRuntimeChanged}
              />
            </div>
          )}
          {!isMobile && isAionrs && assistant.conversation_id && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AionrsHeaderModelSelector
                key={assistant.conversation_id}
                conversation_id={assistant.conversation_id}
                team_id={team_id}
                slot_id={assistant.slot_id}
                initialModel={conversation?.model as TProviderWithModel | undefined}
              />
            </div>
          )}
          {/* 移除入口统一到顶部胶囊（team-tab-remove-*），抬头这里不再重复放 X。 */}
          <div
            className='shrink-0 flex items-center justify-center leading-none cursor-pointer hover:bg-[var(--fill-3)] p-4px rd-4px text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] transition-colors'
            onClick={() => onToggleFullscreen?.()}
          >
            {isFullscreen ? <OffScreen size='16' fill='currentColor' /> : <FullScreen size='16' fill='currentColor' />}
          </div>
        </div>
      </div>
      {showRecoveryBanner && (
        <div
          data-testid={`slot-error-recovery-banner-${assistant.slot_id}`}
          className='shrink-0 px-12px py-7px bg-amber-500/10 border-b border-solid border-amber-500/25 flex flex-wrap items-center justify-between gap-8px z-10'
        >
          <span className='text-11px font-500 text-amber-700 dark:text-amber-300 leading-16px'>
            {t('team.modelHub.slotRecoveryBannerTitle', {
              defaultValue: 'Agent runtime failed or quota paused — retry or switch to a $0 CLI model',
            })}
          </span>
          <div className='flex items-center gap-6px shrink-0'>
            {warmup.trigger && (
              <button
                type='button'
                data-testid={`slot-recovery-retry-${assistant.slot_id}`}
                onClick={() => void warmup.trigger?.()}
                className='h-24px px-8px rd-6px text-11px font-600 inline-flex items-center gap-4px bg-fill-2 hover:bg-fill-3 text-t-primary border border-solid border-arco-2 cursor-pointer transition-colors'
              >
                <Refresh theme='outline' size='12' fill='currentColor' />
                <span>{t('team.modelHub.slotRecoveryRetryBtn', { defaultValue: 'Retry' })}</span>
              </button>
            )}
            {onSwitchSlotModel && (
              <ConnectedModelPickerPopover
                panelTestId={`slot-recovery-model-panel-${assistant.slot_id}`}
                showForceInterrupt
                onSelectModel={(target, meta) => {
                  void onSwitchSlotModel(assistant.slot_id, target, meta.forceInterrupt);
                }}
              >
                <button
                  type='button'
                  data-testid={`slot-recovery-switch-model-${assistant.slot_id}`}
                  className='h-24px px-8px rd-6px text-11px font-600 inline-flex items-center gap-4px bg-emerald-600 hover:bg-emerald-700 text-white border-none cursor-pointer transition-colors'
                >
                  <Exchange theme='outline' size='12' fill='currentColor' />
                  <span>{t('team.modelHub.slotRecoverySwitchBtn', { defaultValue: 'Switch Model' })}</span>
                </button>
              </ConnectedModelPickerPopover>
            )}
          </div>
        </div>
      )}
      <div className='relative flex flex-col flex-1 min-h-0'>
        {conversation ? (
          <TeamChatView
            conversation={conversation as TChatConversation}
            team_id={team_id}
            slot_id={assistant.slot_id}
            assistant_name={assistant.assistant_name}
            assistant_backend={assistant.assistant_backend}
            agent_icon={assistant.icon}
            isLeader={isLeader}
            teamRunView={teamRunView}
            onTeamRunAck={onTeamRunAck}
            onTeamSlotPaused={onTeamSlotPaused}
            onRunStateStale={() => onRunStateStale('pause.result')}
          />
        ) : (
          <div className='flex flex-1 items-center justify-center'>
            <Spin loading />
          </div>
        )}
      </div>
    </div>
  );
};

/** Inner component that reads active tab from context and renders the chat layout */
const TeamPageContent: React.FC<TeamPageContentProps> = ({
  team,
  onRenameTeam,
  warmupPhase,
  warmupRuntimeStatus,
  onRetryWarmup,
}) => {
  const { t } = useTranslation();
  useActiveLease({ type: 'team', id: team.id });
  const { assistants, activeSlotId, switchTab, colorOf, colorOfConversation } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const assistantRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  // 视图模式（并行/单聊），按团队记忆。单聊 = 全屏当前选中成员。
  const [viewMode, setViewMode] = useTeamViewMode(team.id);
  const isSingleView = viewMode === 'single';

  const activeAssistant = assistants.find((assistant) => assistant.slot_id === activeSlotId);
  const leadAssistant = assistants.find((assistant) => assistant.role === 'leader');
  const teamRun = useTeamRunView(team.id);
  const { slotsBySlotId, compacting: compactingTeam, compactTeam, switchModels } = useTeamContextAndModels(team.id);

  const handleCompactSlot = useCallback(
    async (slotId: string) => {
      try {
        await compactTeam({ slot_id: slotId, mode: 'auto' });
        Message.success(
          t('team.modelHub.compactSlotSuccess', {
            defaultValue: 'Compacted slot context window',
          })
        );
      } catch (err) {
        Message.error(String(err));
      }
    },
    [compactTeam, t]
  );

  const handleSwitchSlotModel = useCallback(
    async (slotId: string, target: ModelTargetSpec, forceInterrupt?: boolean) => {
      try {
        await switchModels({
          scope: 'slots',
          updates: [{ slot_id: slotId, target }],
          force_interrupt: forceInterrupt,
        });
        Message.success(
          t('team.modelHub.switchModelsSuccess', {
            count: 1,
            defaultValue: 'Updated models for 1 member(s)',
          })
        );
      } catch (err) {
        Message.error(
          t('team.modelHub.switchModelsFailed', {
            error: String(err),
            defaultValue: `Failed to switch models: ${String(err)}`,
          })
        );
      }
    },
    [switchModels, t]
  );

  // 进团队 warmup：以团队会话整体就绪为闸门（ensureSession resolve = 全员成功）。遮罩覆盖对话区。
  // runtimeStatus 是各成员逐个的真实唤醒信号，用于遮罩头像的「唤醒中→点亮」及失败态定位。
  // 仅在「唤醒进行中」禁用改成员；失败态（error/timeout）要放开，让用户能移除失败成员来自救。
  const isWarmingUp = warmupPhase === 'warming';

  const leaderConversationId = leadAssistant?.conversation_id ?? '';
  const isLeaderAssistant = activeAssistant?.role === 'leader';
  const allConversationIdsKey = useMemo(
    () =>
      assistants
        .map((assistant) => assistant.conversation_id)
        .filter((id): id is string => Boolean(id))
        .join(','),
    [assistants]
  );
  const allConversationIds = useMemo(
    () => (allConversationIdsKey ? allConversationIdsKey.split(',') : []),
    [allConversationIdsKey]
  );
  const runtimeStartingKey = useMemo(
    () =>
      assistants
        .filter((assistant) => teamRun.state.slotWorkBySlot[assistant.slot_id]?.blocked_reason === 'runtime_starting')
        .map((assistant) => assistant.conversation_id)
        .filter((id): id is string => Boolean(id))
        .sort()
        .join(','),
    [assistants, teamRun.state.slotWorkBySlot]
  );
  const runtimeStartingConversationIds = useMemo<ReadonlySet<string>>(
    () => new Set(runtimeStartingKey ? runtimeStartingKey.split(',') : []),
    [runtimeStartingKey]
  );

  // Fetch leader assistant's conversation for the workspace sider. Its
  // project_id (populated by the shared mapper) is the team's project.
  const { data: dispatchConversation, mutate: mutateDispatchConversation } = useSWR(
    leadAssistant?.conversation_id ? ['team-conversation', leadAssistant.conversation_id] : null,
    () => getConversationOrNull(leadAssistant!.conversation_id)
  );
  const leaderConversationIdForProject = leadAssistant?.conversation_id;
  // Prefer the synchronous list-snapshot project id for the leader conversation
  // so switching teams publishes the project immediately. `dispatchConversation`
  // is an async SWR fetch that previously lagged the switch, leaving the prior
  // team's Explorer tree painted until it resolved. Snapshot miss (cold start /
  // row not yet loaded) falls back to the fetched conversation's project_id.
  const snapshotTeamProjectId = leaderConversationIdForProject
    ? getSnapshotConversationProjectId(leaderConversationIdForProject)
    : undefined;
  const teamProjectId =
    snapshotTeamProjectId !== undefined ? snapshotTeamProjectId : (dispatchConversation?.project_id ?? null);

  // Publish the team's project so the Layout-level Explorer host renders it —
  // mirrors conversation/index.tsx (project-scoped, persistent across agent-tab
  // switches; the Explorer host does not remount within the same team/project).
  useEffect(() => {
    setCurrentProject(teamProjectId);
  }, [teamProjectId]);

  // Publish the active member column's conversation id so the Explorer's "add to
  // chat" targets the focused column's send box (activeSlotId defaults to the
  // leader; every column is a real agent conversation). Only meaningful once the
  // team is project-bound (host visible).
  useEffect(() => {
    setCurrentConversation(teamProjectId ? (activeAssistant?.conversation_id ?? null) : null);
  }, [teamProjectId, activeAssistant?.conversation_id]);

  // Backfill catch-up: the leader conversation lazily backfills its project_id on
  // resume and the backend emits one `conversation.listChanged` when it lands;
  // refetch the leader conversation so the populated project_id flows through.
  // (Same responsive path as conversation/index.tsx — no polling.)
  useEffect(() => {
    if (!leaderConversationIdForProject) return;
    return ipcBridge.conversation.listChanged.on((event) => {
      if (event.conversation_id !== leaderConversationIdForProject) return;
      if (event.action !== 'updated' && event.action !== 'created') return;
      void mutateDispatchConversation();
    });
  }, [leaderConversationIdForProject, mutateDispatchConversation]);

  // Use team workspace if specified, otherwise fall back to leader assistant's conversation workspace (temp workspace)
  const teamWorkspaceView = resolveTeamWorkspaceView(
    team.workspace,
    (dispatchConversation?.extra as { workspace?: string } | undefined)?.workspace
  );
  const effectiveWorkspace = teamWorkspaceView.workspacePath;
  // For project teams the file panel is the Layout-level Explorer host (gated on
  // project_id), so ChatLayout's own workspace sider is disabled — mirrors
  // ChatConversation's `workspaceEnabled && !project_id`.
  const workspaceEnabled = teamWorkspaceView.workspaceEnabled && !teamProjectId;
  // Team is "user-picked" only when team.workspace was explicitly set at team
  // creation. Falling back to a leader assistant's auto-temp workspace counts as
  // temporary, mirroring single-chat behavior.
  const isTeamWorkspaceTemporary = teamWorkspaceView.isTemporaryWorkspace;

  // Mirror conversation/index.tsx: close preview only when the isolation scope
  // changes, keep it open when switching between teams that share the same scope.
  // Scope is project (falling back to workspace until the leader conversation's
  // project_id is populated).
  const { closePreviewIfScopeChanged } = usePreviewContext();
  useEffect(() => {
    closePreviewIfScopeChanged(previewScopeKey(teamProjectId, effectiveWorkspace ?? null));
  }, [teamProjectId, effectiveWorkspace, closePreviewIfScopeChanged]);

  const siderTitle = useMemo(
    () => (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    ),
    [t]
  );

  const sider = useMemo(() => {
    if (!workspaceEnabled || !dispatchConversation) return <div />;
    return <ChatSlider conversation={dispatchConversation} />;
  }, [workspaceEnabled, dispatchConversation]);

  const updateScrollArrows = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setShowLeftArrow(hasOverflow && container.scrollLeft > 10);
    setShowRightArrow(hasOverflow && container.scrollLeft + container.clientWidth < container.scrollWidth - 10);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateScrollArrows, { passive: true });
    window.addEventListener('resize', updateScrollArrows);
    const observer = new ResizeObserver(updateScrollArrows);
    observer.observe(container);
    updateScrollArrows();
    return () => {
      container.removeEventListener('scroll', updateScrollArrows);
      window.removeEventListener('resize', updateScrollArrows);
      observer.disconnect();
    };
  }, [updateScrollArrows]);

  const handleTabClick = useCallback(
    (slot_id: string) => {
      switchTab(slot_id);
      // 单聊视图只显示选中成员，无需滚动定位/闪动；并行视图滚动到对应列并闪一下。
      if (isSingleView) return;
      requestAnimationFrame(() => {
        const el = assistantRefs.current[slot_id];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
          // Flash: opacity 1→0→1
          setTimeout(() => {
            el.style.transition = 'opacity 150ms ease-out';
            el.style.opacity = '0';
            setTimeout(() => {
              el.style.transition = 'opacity 150ms ease-in';
              el.style.opacity = '1';
              setTimeout(() => {
                el.style.transition = '';
              }, 200);
            }, 150);
          }, 200);
        }
      });
    },
    [switchTab, isSingleView]
  );

  const scrollToPrev = useCallback(() => {
    const idx = assistants.findIndex((assistant) => assistant.slot_id === activeSlotId);
    const target = idx > 0 ? idx - 1 : 0;
    if (assistants[target]) handleTabClick(assistants[target].slot_id);
  }, [assistants, activeSlotId, handleTabClick]);

  const scrollToNext = useCallback(() => {
    const idx = assistants.findIndex((assistant) => assistant.slot_id === activeSlotId);
    const target = idx >= 0 && idx < assistants.length - 1 ? idx + 1 : 0;
    if (assistants[target]) handleTabClick(assistants[target].slot_id);
  }, [assistants, activeSlotId, handleTabClick]);

  // Every time the page mounts, scroll + flash the active tab
  useEffect(() => {
    if (activeSlotId && assistants.length > 0) {
      const timer = setTimeout(() => {
        const el = assistantRefs.current[activeSlotId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
          setTimeout(() => {
            el.style.transition = 'opacity 150ms ease-out';
            el.style.opacity = '0';
            setTimeout(() => {
              el.style.transition = 'opacity 150ms ease-in';
              el.style.opacity = '1';
              setTimeout(() => {
                el.style.transition = '';
              }, 200);
            }, 150);
          }, 200);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // empty deps = only on mount

  // 并行视图下：当 activeSlotId 因程序化切换而变化（如「告诉 Leader」切到 Leader），
  // 把对应列滚动到可视区，避免选中的成员列不在画面中。
  useEffect(() => {
    if (isSingleView || !activeSlotId) return;
    const el = assistantRefs.current[activeSlotId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, [activeSlotId, isSingleView]);

  // Track pending permission confirmation counts per assistant (requirements 5, 6, 7, 8)
  const { pendingCounts } = useTeamPendingPermissions(team.id, allConversationIds);

  // Build slot_id → pendingCount map for tab badge display
  const slotPendingCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const assistant of assistants) {
      if (assistant.conversation_id) {
        map.set(assistant.slot_id, pendingCounts[assistant.conversation_id] ?? 0);
      }
    }
    return map;
  }, [assistants, pendingCounts]);

  // warmup 失败的成员 slot 集合：胶囊头像标红。仅在失败态计算（进行中/就绪都无需标红）。
  const warmupFailedSlotIds = useMemo(() => {
    if (warmupPhase !== 'error') return undefined;
    const ids = new Set<string>();
    warmupRuntimeStatus.forEach((state, slot_id) => {
      if (state.status === 'failed') ids.add(slot_id);
    });
    return ids.size > 0 ? ids : undefined;
  }, [warmupPhase, warmupRuntimeStatus]);

  const tabsSlot = useMemo(
    () => (
      <TeamTabs
        onTabClick={handleTabClick}
        pendingCounts={slotPendingCounts}
        warmingUp={isWarmingUp}
        failedSlotIds={warmupFailedSlotIds}
      />
    ),
    [handleTabClick, slotPendingCounts, isWarmingUp, warmupFailedSlotIds]
  );

  return (
    <TeamPermissionProvider
      team_id={team.id}
      isLeaderAgent={isLeaderAssistant}
      leaderConversationId={leaderConversationId}
      allConversationIds={allConversationIds}
      runtimeStartingConversationIds={runtimeStartingConversationIds}
    >
      <TeamIdentityProvider colorOfConversation={colorOfConversation}>
        {messageContext}
        <ChatLayout
          title={team.name}
          siderTitle={siderTitle}
          sider={sider}
          workspaceEnabled={workspaceEnabled}
          previewHosted={Boolean(teamProjectId)}
          tabsSlot={tabsSlot}
          conversation_id={activeAssistant?.conversation_id}
          agent_name={undefined}
          workspacePath={effectiveWorkspace}
          isTemporaryWorkspace={isTeamWorkspaceTemporary}
          workspacePreferenceKey={team.id}
          onRenameTitle={onRenameTeam}
          headerExtra={
            <div className='flex items-center gap-8px'>
              <TeamTelegramBridgePopover teamId={team.id} teamName={team.name} />
              {assistants.length > 1 ? <TeamViewToggle value={viewMode} onChange={setViewMode} /> : null}
            </div>
          }
          headerLeading={
            <span className='inline-flex w-16px h-16px items-center justify-center shrink-0 leading-none text-t-primary'>
              <Peoples theme='outline' size='16' fill='currentColor' style={{ lineHeight: 0 }} />
            </span>
          }
        >
          <div className='relative flex h-full'>
            <TeamWarmupOverlay
              phase={warmupPhase}
              assistants={assistants}
              runtimeStatus={warmupRuntimeStatus}
              colorOf={colorOf}
              onRetry={onRetryWarmup}
            />
            {viewMode === 'board' ? (
              // 看板视图：只读展现全队 mailbox 与 task-board。
              <div className='flex-1 h-full min-w-0'>
                <TeamActivityView team={team} />
              </div>
            ) : isSingleView ? (
              // 单聊视图：全屏显示当前选中成员（activeSlotId），找不到时回退到 Leader。
              (() => {
                const assistant =
                  assistants.find((candidate) => candidate.slot_id === activeSlotId) ?? leadAssistant ?? assistants[0];
                if (!assistant) return null;
                const isLeaderSlot = assistant.slot_id === leadAssistant?.slot_id;
                return (
                  <div className='flex-1 h-full'>
                    <AssistantChatSlot
                      assistant={assistant}
                      team_id={team.id}
                      isLeader={isLeaderSlot}
                      color={colorOf(assistant.slot_id)}
                      isFullscreen
                      onToggleFullscreen={() => setViewMode('parallel')}
                      teamRunView={teamRun.state}
                      onTeamRunAck={teamRun.applyAck}
                      onTeamSlotPaused={teamRun.applyLocalPause}
                      onRunStateStale={teamRun.reconcile}
                      warmupStatus={warmupRuntimeStatus.get(assistant.slot_id)?.status}
                      fallbackAvailability={
                        isLeaderSlot ? teamWarmupPhaseAvailability(warmupPhase) : assistant.context_reset.availability
                      }
                      warmupDisabled={isWarmingUp}
                      slotContext={slotsBySlotId[assistant.slot_id]}
                      compactingSlot={compactingTeam}
                      onCompactSlot={handleCompactSlot}
                      onSwitchSlotModel={handleSwitchSlotModel}
                    />
                  </div>
                );
              })()
            ) : (
              <>
                {showLeftArrow && (
                  <div
                    className='absolute start-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100 transition-opacity'
                    style={{ background: 'linear-gradient(90deg, var(--color-bg-1) 40%, transparent)' }}
                    onClick={scrollToPrev}
                  >
                    <div
                      className='w-32px h-32px rd-full flex items-center justify-center'
                      style={{ background: 'rgba(0,0,0,0.5)', lineHeight: 0 }}
                    >
                      <Left size='24' fill='#fff' />
                    </div>
                  </div>
                )}
                <div
                  ref={scrollContainerRef}
                  className='flex h-full w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
                  style={{ scrollSnapType: 'x proximity' }}
                >
                  {assistants.map((assistant, index) => {
                    const isSingle = assistants.length <= 2;
                    const isLeaderSlot = assistant.slot_id === leadAssistant?.slot_id;
                    const isLastColumn = index === assistants.length - 1;
                    return (
                      <div
                        key={assistant.slot_id}
                        ref={(el) => {
                          assistantRefs.current[assistant.slot_id] = el;
                        }}
                        data-slot-id={assistant.slot_id}
                        data-role={isLeaderSlot ? 'leader' : 'member'}
                        // 列间灰色隔离线：除最后一列外，右侧加一条分隔线，避免多列浅底粘连看不清边界。
                        className={`relative h-full ${isLastColumn ? '' : 'border-e border-solid border-[color:var(--border-base)]'}`}
                        style={{
                          // Always flex-grow to fill available space; each slot starts at 400px
                          // basis so the layout is stable, but spare room is distributed evenly
                          // instead of leaving empty gaps to the right. When the team is wider
                          // than the viewport we preserve the 400px floor (prevents shrinking
                          // into unreadable cards) so horizontal scroll kicks in naturally.
                          flex: '1 1 400px',
                          minWidth: isSingle ? '240px' : '400px',
                          scrollSnapAlign: 'start',
                        }}
                      >
                        <AssistantChatSlot
                          assistant={assistant}
                          team_id={team.id}
                          isLeader={isLeaderSlot}
                          color={colorOf(assistant.slot_id)}
                          onToggleFullscreen={() => {
                            switchTab(assistant.slot_id);
                            setViewMode('single');
                          }}
                          teamRunView={teamRun.state}
                          onTeamRunAck={teamRun.applyAck}
                          onTeamSlotPaused={teamRun.applyLocalPause}
                          onRunStateStale={teamRun.reconcile}
                          warmupStatus={warmupRuntimeStatus.get(assistant.slot_id)?.status}
                          fallbackAvailability={
                            isLeaderSlot
                              ? teamWarmupPhaseAvailability(warmupPhase)
                              : assistant.context_reset.availability
                          }
                          warmupDisabled={isWarmingUp}
                          slotContext={slotsBySlotId[assistant.slot_id]}
                          compactingSlot={compactingTeam}
                          onCompactSlot={handleCompactSlot}
                          onSwitchSlotModel={handleSwitchSlotModel}
                        />
                      </div>
                    );
                  })}
                </div>
                {showRightArrow && (
                  <div
                    className='absolute end-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100 transition-opacity'
                    style={{ background: 'linear-gradient(270deg, var(--color-bg-1) 40%, transparent)' }}
                    onClick={scrollToNext}
                  >
                    <div
                      className='w-32px h-32px rd-full flex items-center justify-center'
                      style={{ background: 'rgba(0,0,0,0.5)', lineHeight: 0 }}
                    >
                      <Right size='24' fill='#fff' />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ChatLayout>
      </TeamIdentityProvider>
    </TeamPermissionProvider>
  );
};

const TeamPage: React.FC<Props> = ({ team }) => {
  const { t } = useTranslation();
  const { phase: warmupPhase, runtimeStatus: warmupRuntimeStatus, retry: retryWarmup } = useTeamWarmup(team.id);
  const { statusMap, membershipMutationBusy, addAssistant, renameAssistant, removeAssistant, mutateTeam } =
    useTeamSession(team, warmupPhase);
  const { user } = useAuth();
  const { mutate: globalMutate } = useSWRConfig();
  const defaultSlotId = team.assistants[0]?.slot_id ?? '';

  const handleRemoveAssistantWithConfirm = useCallback(
    (slot_id: string) => {
      if (membershipMutationBusy) return;

      const doRemoveAssistant = async () => {
        try {
          await removeAssistant(slot_id);
          Message.success(t('common.deleteSuccess'));
        } catch (error) {
          Message.error(String(error));
        }
      };
      // 移除成员一律二次确认；成员正在工作中时用更强的措辞提示会打断其工作。
      const status = statusMap.get(slot_id)?.status;
      const isActive = status === 'active';
      Modal.confirm({
        title: t('team.removeAgent.confirmTitle', { defaultValue: 'Remove team member' }),
        content: isActive
          ? t('team.removeAgent.confirmContentActive', {
              defaultValue: 'This member is working. Remove it anyway? Its current work will be interrupted.',
            })
          : t('team.removeAgent.confirmContent', { defaultValue: 'Remove this member from the team?' }),
        okButtonProps: { status: 'danger' },
        onOk: doRemoveAssistant,
      });
    },
    [membershipMutationBusy, statusMap, removeAssistant, t]
  );

  const handleRenameTeam = useCallback(
    async (new_name: string): Promise<boolean> => {
      try {
        await ipcBridge.team.renameTeam.invoke({ id: team.id, name: new_name });
        await mutateTeam();
        await globalMutate(`teams/${user?.id ?? 'system_default_user'}`);
        return true;
      } catch (error) {
        console.error('Failed to rename team:', error);
        return false;
      }
    },
    [team.id, mutateTeam, globalMutate, user]
  );

  return (
    <TeamTabsProvider
      assistants={team.assistants}
      statusMap={statusMap}
      defaultActiveSlotId={defaultSlotId}
      team_id={team.id}
      addAssistant={addAssistant}
      renameAssistant={renameAssistant}
      removeAssistant={handleRemoveAssistantWithConfirm}
      membershipMutationBusy={membershipMutationBusy}
    >
      <TeamPageContent
        team={team}
        onRenameTeam={handleRenameTeam}
        warmupPhase={warmupPhase}
        warmupRuntimeStatus={warmupRuntimeStatus}
        onRetryWarmup={retryWarmup}
      />
    </TeamTabsProvider>
  );
};

export default TeamPage;
