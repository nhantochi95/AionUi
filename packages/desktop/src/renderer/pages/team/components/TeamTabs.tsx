import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Message, Tooltip } from '@arco-design/web-react';
import { CloseSmall, Drag, Edit, Exchange, Lightning, Plus } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeammateStatus } from '@/common/types/team/teamTypes';
import type { ModelTargetSpec, SlotContextStatusDto } from '@/common/types/team/teamHubTypes';
import { restrictToHorizontalAxis } from '@/renderer/utils/ui/dndModifiers';
import AgentStatusBadge from './AgentStatusBadge';
import TeamAgentIdentity from './TeamAgentIdentity';
import { useTeamTabs } from '../hooks/TeamTabsContext';
import TeamAddMemberPopover from './memberPicker/TeamAddMemberPopover';
import ConnectedModelPickerPopover, {
  type ModelPickerSelectionMeta,
  type ModelSlotOption,
} from './modelHub/ConnectedModelPickerPopover';
import TeamContextCompactPopover from './modelHub/TeamContextCompactPopover';
import { resolveSlotContextLevel, useTeamContextAndModels } from './modelHub/useTeamContextAndModels';

const TAB_OVERFLOW_THRESHOLD = 10;

type TeamTabViewProps = {
  slot_id: string;
  assistant_name: string;
  assistant_backend: string;
  icon?: string;
  conversation_id?: string;
  isActive: boolean;
  status: TeammateStatus;
  isLeader: boolean;
  /** warmup 失败：头像加红环 + 感叹角标提示。 */
  warmupFailed?: boolean;
  /** 成员身份色 CSS 值（胶囊底色 / 选中描边）。 */
  color: string;
  /** Number of pending permission confirmations for this agent */
  pendingCount?: number;
  /** Live context window telemetry for this slot */
  slotContext?: SlotContextStatusDto;
  /** A drag is in progress somewhere in the bar: freeze hover affordances so pills don't reflow mid-drag. */
  dragActive: boolean;
  onSwitch: (slot_id: string) => void;
  onRename?: (slot_id: string, new_name: string) => void;
  onRemove?: (slot_id: string) => void;
};

const TeamTabView: React.FC<TeamTabViewProps> = ({
  slot_id,
  assistant_name,
  assistant_backend,
  icon,
  conversation_id,
  isActive,
  status,
  isLeader,
  warmupFailed = false,
  color,
  pendingCount = 0,
  slotContext,
  dragActive,
  onSwitch,
  onRename,
  onRemove,
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(assistant_name);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Leader stays fixed at index 0 and never takes part in sorting.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: slot_id,
    disabled: isLeader,
  });

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const nextValue = inputRef.current?.value ?? editValue;
    const trimmed = nextValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== assistant_name && onRename) {
      setEditValue(trimmed);
      onRename(slot_id, trimmed);
    } else {
      setEditValue(assistant_name);
    }
  }, [editValue, assistant_name, slot_id, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename();
      } else if (e.key === 'Escape') {
        setEditValue(assistant_name);
        setEditing(false);
      }
    },
    [commitRename, assistant_name]
  );

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditValue(assistant_name);
      setEditing(true);
    },
    [assistant_name]
  );

  const showDragHandle = !isLeader && !editing && ((hovered && !dragActive) || isDragging);
  const showHoverActions = !editing && ((hovered && !dragActive) || isDragging);

  const contextPct = slotContext ? Math.max(0, Math.min(100, Math.round(slotContext.usage_percent))) : undefined;
  const contextLevel =
    slotContext && contextPct !== undefined ? resolveSlotContextLevel(contextPct, slotContext.level) : undefined;

  return (
    <div
      ref={setNodeRef}
      data-testid={`team-tab-${slot_id}`}
      data-team-tab-role={isLeader ? 'leader' : 'teammate'}
      data-active={isActive ? 'true' : 'false'}
      className='relative flex items-center gap-6px ps-6px pe-10px h-34px max-w-260px cursor-pointer rounded-999px border border-solid transition-colors duration-150 shrink-0 bg-[color:var(--bg-2)]'
      style={{
        ['--mc' as string]: color,
        borderColor: isActive ? color : 'transparent',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.72 : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !editing && onSwitch(slot_id)}
      onDoubleClick={onRename ? startEditing : undefined}
    >
      {showDragHandle && (
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          role='button'
          aria-label={t('team.reorderMember', { defaultValue: 'Drag to reorder member' })}
          data-testid={`team-tab-drag-${slot_id}`}
          className={`shrink-0 flex items-center justify-center w-14px h-20px text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ touchAction: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Drag theme='outline' size='13' fill='currentColor' />
        </span>
      )}
      {editing ? (
        <input
          ref={inputRef}
          className='text-15px flex-1 min-w-0 bg-transparent border-none outline-none text-[color:var(--color-text-1)] p-0'
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div className='min-w-0 flex-1 flex items-center gap-5px'>
          {pendingCount > 0 && (
            <span
              className='shrink-0 text-14px leading-none animate-wiggle'
              title={`${pendingCount} pending permission request(s)`}
            >
              ‼️
            </span>
          )}
          <TeamAgentIdentity
            assistant_name={assistant_name}
            assistant_backend={assistant_backend}
            icon={icon}
            conversation_id={conversation_id}
            isLeader={isLeader}
            className='min-w-0 flex-1 !gap-6px'
            logoClassName={`w-22px h-22px object-cover rounded-full ${warmupFailed ? 'grayscale' : ''}`}
            avatarClassName={`w-22px h-22px rounded-full flex items-center justify-center text-12px leading-none bg-fill-2 shrink-0 ${warmupFailed ? 'grayscale' : ''}`}
            nameClassName='text-13px font-600 whitespace-nowrap overflow-hidden text-ellipsis select-none'
            nameStyle={{ color }}
            nameTestId={`team-tab-name-${slot_id}`}
            avatarOverlay={
              warmupFailed ? (
                <span
                  data-testid={`team-tab-failed-${slot_id}`}
                  className='absolute -end-2px -bottom-2px w-12px h-12px rounded-full flex items-center justify-center text-9px font-700 text-white'
                  style={{ background: 'var(--danger)', border: '1.5px solid var(--bg-base)' }}
                >
                  !
                </span>
              ) : (
                <AgentStatusBadge status={status} testId={`team-tab-status-${slot_id}`} />
              )
            }
          />
          {slotContext && contextPct !== undefined && contextLevel && (
            <Tooltip
              content={t('team.modelHub.contextBadgeTooltip', {
                used: slotContext.used_tokens.toLocaleString(),
                max: slotContext.max_tokens.toLocaleString(),
                pct: contextPct,
                model: `${slotContext.backend}/${slotContext.model_id || 'default'}`,
                defaultValue: `Context: ${slotContext.used_tokens} / ${slotContext.max_tokens} tokens (${contextPct}%) • ${slotContext.backend}/${slotContext.model_id || 'default'}`,
              })}
            >
              <span
                data-testid={`team-tab-context-${slot_id}`}
                data-context-level={contextLevel}
                className={classNames(
                  'shrink-0 px-5px py-0.5px rd-999px text-10px font-mono font-700 leading-14px border border-solid select-none',
                  contextLevel === 'critical'
                    ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
                    : contextLevel === 'warning'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                )}
              >
                {contextPct}%
              </span>
            </Tooltip>
          )}
        </div>
      )}
      {showHoverActions && onRename && (
        <span
          data-testid={`team-tab-edit-${slot_id}`}
          className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--text-primary)] transition-colors duration-150'
          onClick={startEditing}
        >
          <Edit theme='outline' size='13' fill='currentColor' />
        </span>
      )}
      {showHoverActions && !isLeader && onRemove && (
        <span
          data-testid={`team-tab-remove-${slot_id}`}
          className='shrink-0 flex items-center justify-center w-20px h-20px rounded-6px text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-3)] hover:text-[color:var(--color-danger-6)] transition-colors duration-150'
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slot_id);
          }}
        >
          <CloseSmall theme='outline' size='14' fill='currentColor' />
        </span>
      )}
    </div>
  );
};

type TeamTabsProps = {
  onTabClick?: (slot_id: string) => void;
  /** Pending permission confirmation counts per assistant slot ID */
  pendingCounts?: Map<string, number>;
  /** 团队 warmup 进行中：禁用改成员（添加/移除/重命名）——PRD 第 7 节要求。 */
  warmingUp?: boolean;
  /** warmup 失败的成员 slot：胶囊头像标红提示，引导用户移除/换模型自救。 */
  failedSlotIds?: Set<string>;
};

/**
 * Tab bar for team mode showing assistant tabs with status badges.
 * Supports scroll overflow with fade indicators.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({ onTabClick, pendingCounts, warmingUp = false, failedSlotIds }) => {
  const { t } = useTranslation();
  const {
    team_id,
    assistants,
    activeSlotId,
    statusMap,
    switchTab,
    renameAssistant,
    removeAssistant,
    reorderAssistants,
    addAssistant,
    colorOf,
  } = useTeamTabs();

  const {
    slots,
    slotsBySlotId,
    autoCompactEnabled,
    autoCompactThresholdPct,
    maxUsagePercent,
    highestLevel,
    compacting,
    switchingModels,
    compactTeam,
    toggleAutoCompact,
    switchModels,
  } = useTeamContextAndModels(team_id);

  const memberOpsDisabled = warmingUp;
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  // Only teammates are sortable; the leader pill is rendered outside the sortable id list.
  const sortableIds = useMemo(
    () => assistants.filter((assistant) => assistant.role !== 'leader').map((assistant) => assistant.slot_id),
    [assistants]
  );

  const slotOptions = useMemo<ModelSlotOption[]>(
    () =>
      assistants.map((a) => ({
        slot_id: a.slot_id,
        name: a.assistant_name,
        isLeader: a.role === 'leader',
      })),
    [assistants]
  );

  const fallbackMembers = useMemo(
    () =>
      assistants.map((a) => ({
        slot_id: a.slot_id,
        name: a.assistant_name,
        role: a.role,
        backend: a.assistant_backend,
      })),
    [assistants]
  );

  const handleSwitchModels = useCallback(
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
        const outcomes = res?.outcomes ?? [];
        const queuedCount = outcomes.filter((o) => o.status === 'queued_after_turn').length;
        if (queuedCount > 0 && queuedCount === outcomes.length) {
          Message.info(
            t('team.modelHub.switchModelsQueued', {
              count: queuedCount,
              defaultValue: `Model swap queued after current turn (${queuedCount} member(s))`,
            })
          );
        } else {
          Message.success(
            t('team.modelHub.switchModelsSuccess', {
              count: outcomes.length || 1,
              defaultValue: `Updated models for ${outcomes.length || 1} member(s)`,
            })
          );
        }
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

  const updateTabOverflow = useCallback(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setShowLeftFade(hasOverflow && container.scrollLeft > TAB_OVERFLOW_THRESHOLD);
    setShowRightFade(
      hasOverflow && container.scrollLeft + container.clientWidth < container.scrollWidth - TAB_OVERFLOW_THRESHOLD
    );
  }, []);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateTabOverflow, { passive: true });
    window.addEventListener('resize', updateTabOverflow);
    const observer = new ResizeObserver(updateTabOverflow);
    observer.observe(container);
    updateTabOverflow();
    return () => {
      container.removeEventListener('scroll', updateTabOverflow);
      window.removeEventListener('resize', updateTabOverflow);
      observer.disconnect();
    };
  }, [updateTabOverflow]);

  const handleDragStart = useCallback(() => setDragActive(true), []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setDragActive(false);
      if (!over || active.id === over.id) return;
      reorderAssistants(String(active.id), String(over.id));
    },
    [reorderAssistants]
  );

  const handleDragCancel = useCallback(() => setDragActive(false), []);

  if (assistants.length === 0) return null;

  return (
    <div
      data-testid='team-tab-bar'
      className='relative shrink-0 bg-1 border-t border-x border-b border-solid border-[color:var(--border-base)]'
    >
      <div className='relative flex items-stretch min-h-48px'>
        {/* 可横向滚动的成员胶囊列表 */}
        <div
          ref={tabsContainerRef}
          className='flex items-center gap-6px flex-1 min-w-0 overflow-x-auto overflow-y-hidden py-8px px-12px [scrollbar-width:none]'
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
              {assistants.map((assistant) => {
                const statusInfo = statusMap.get(assistant.slot_id);
                return (
                  <TeamTabView
                    key={assistant.slot_id}
                    slot_id={assistant.slot_id}
                    assistant_name={assistant.assistant_name}
                    assistant_backend={assistant.assistant_backend}
                    icon={assistant.icon}
                    conversation_id={assistant.conversation_id}
                    isActive={assistant.slot_id === activeSlotId}
                    status={statusInfo?.status ?? assistant.status}
                    isLeader={assistant.role === 'leader'}
                    warmupFailed={failedSlotIds?.has(assistant.slot_id) ?? false}
                    color={colorOf(assistant.slot_id)}
                    pendingCount={pendingCounts?.get(assistant.slot_id) ?? 0}
                    slotContext={slotsBySlotId[assistant.slot_id]}
                    dragActive={dragActive}
                    onSwitch={(slot_id) => {
                      switchTab(slot_id);
                      onTabClick?.(slot_id);
                    }}
                    onRename={
                      renameAssistant && !memberOpsDisabled ? (sid, name) => void renameAssistant(sid, name) : undefined
                    }
                    onRemove={removeAssistant && !memberOpsDisabled ? (sid) => void removeAssistant(sid) : undefined}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
        {/* 两侧渐隐提示「还有更多」，只覆盖滚动区、不盖固定的添加入口 */}
        {showLeftFade && (
          <div
            className='pointer-events-none absolute start-0 top-0 bottom-0 w-28px z-10'
            style={{ background: 'linear-gradient(90deg, var(--color-bg-1), transparent)' }}
          />
        )}
        {showRightFade && (
          <div
            className='pointer-events-none absolute top-0 bottom-0 w-28px z-10'
            style={{
              right: 'var(--team-add-w, 280px)',
              background: 'linear-gradient(270deg, var(--color-bg-1), transparent)',
            }}
          />
        )}
        {/* Right-pinned Team Hub Controls Cluster + Add Member */}
        <div className='flex items-center gap-6px shrink-0 border-s border-solid border-[color:var(--border-base)] px-8px'>
          {team_id && (
            <>
              <ConnectedModelPickerPopover
                disabled={switchingModels}
                showScopeSelector
                showForceInterrupt
                slotOptions={slotOptions}
                panelTestId='team-tabs-switch-models-panel'
                onSelectModel={handleSwitchModels}
              >
                <button
                  type='button'
                  data-testid='team-tabs-switch-models-btn'
                  disabled={switchingModels}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    height: 30,
                    lineHeight: 'normal',
                  }}
                  className='flex items-center gap-5px px-9px rounded-8px text-12px font-500 whitespace-nowrap bg-[color:var(--bg-2)] hover:bg-[color:var(--bg-3)] text-[color:var(--text-primary)] border border-solid border-[color:var(--border-base)] cursor-pointer transition-colors'
                >
                  <Exchange theme='outline' size='13' fill='currentColor' />
                  <span>{t('team.modelHub.switchModelsBtn', { defaultValue: 'Switch Models' })}</span>
                </button>
              </ConnectedModelPickerPopover>

              <TeamContextCompactPopover
                slots={slots}
                fallbackMembers={fallbackMembers}
                autoCompactEnabled={autoCompactEnabled}
                autoCompactThresholdPct={autoCompactThresholdPct}
                compacting={compacting}
                onToggleAutoCompact={toggleAutoCompact}
                onCompactAll={() => compactTeam({ mode: 'auto' })}
                onCompactSlot={(slotId) => compactTeam({ slot_id: slotId, mode: 'auto' })}
              >
                <button
                  type='button'
                  data-testid='team-tabs-compact-btn'
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    height: 30,
                    lineHeight: 'normal',
                  }}
                  className={classNames(
                    'flex items-center gap-5px px-9px rounded-8px text-12px font-500 whitespace-nowrap border border-solid cursor-pointer transition-colors',
                    slots.length > 0 && highestLevel === 'critical'
                      ? 'bg-red-500/12 border-red-500/30 text-red-700 dark:text-red-300'
                      : slots.length > 0 && highestLevel === 'warning'
                        ? 'bg-amber-500/12 border-amber-500/30 text-amber-700 dark:text-amber-300'
                        : 'bg-[color:var(--bg-2)] hover:bg-[color:var(--bg-3)] text-[color:var(--text-primary)] border-[color:var(--border-base)]'
                  )}
                >
                  <Lightning theme='outline' size='13' fill='currentColor' />
                  <span>{t('team.modelHub.compactBtn', { defaultValue: 'Compact Context' })}</span>
                  {slots.length > 0 && (
                    <span className='font-mono text-11px font-700 opacity-85'>{maxUsagePercent}%</span>
                  )}
                </button>
              </TeamContextCompactPopover>
            </>
          )}

          {addAssistant ? (
            <TeamAddMemberPopover disabled={memberOpsDisabled}>
              <button
                type='button'
                disabled={memberOpsDisabled}
                data-testid='team-tab-add-member'
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: 'transparent',
                  border: 'none',
                  height: 32,
                  lineHeight: 'normal',
                }}
                className={`flex items-center gap-6px px-10px rounded-8px text-13px font-500 whitespace-nowrap transition-colors duration-150 ${
                  memberOpsDisabled
                    ? 'text-[color:var(--text-disabled)] cursor-not-allowed'
                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--brand)] hover:bg-[color:var(--bg-2)] cursor-pointer'
                }`}
              >
                <Plus theme='outline' size='15' fill='currentColor' className='leading-none' />
                {t('team.addMember.title', { defaultValue: 'Add member' })}
              </button>
            </TeamAddMemberPopover>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TeamTabs;
