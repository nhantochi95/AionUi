/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ipcBridge } from '@/common';
import type {
  ConnectedModelsCatalogDto,
  SlotContextStatusDto,
  TeamContextUsageEvent,
} from '@/common/types/team/teamHubTypes';
import type { ActionInboxCardDto } from '@/common/types/inbox';
import type { ISharedRoomTask } from '@/common/types/sharedRoom';
import type { ITeamMailboxMessage, ITeamTaskItem, TeamAssistant } from '@/common/types/team/teamTypes';
import enUSTeamLocale from '@/renderer/services/i18n/locales/en-US/team.json';
import viVNTeamLocale from '@/renderer/services/i18n/locales/vi-VN/team.json';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      useMessage: actual.Message.useMessage,
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>, maybeParams?: Record<string, unknown>) => {
      let str =
        typeof defaultValueOrOpts === 'string'
          ? defaultValueOrOpts
          : typeof defaultValueOrOpts?.defaultValue === 'string'
            ? defaultValueOrOpts.defaultValue
            : key;
      const values =
        typeof defaultValueOrOpts === 'object' && defaultValueOrOpts !== null ? defaultValueOrOpts : maybeParams;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          if (k !== 'defaultValue') {
            str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
          }
        }
      }
      return str;
    },
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@renderer/components/media/Diff2Html', () => ({
  default: () => <div data-testid='mock-diff2html'>Diff</div>,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

import {
  resolveQuotaPresetTargets,
  useTeamContextAndModels,
} from '@/renderer/pages/team/components/modelHub/useTeamContextAndModels';
import TeamContextCompactPopover from '@/renderer/pages/team/components/modelHub/TeamContextCompactPopover';
import QuickCreateMemberInlineForm from '@/renderer/pages/team/components/modelHub/QuickCreateMemberInlineForm';
import TeamMemberDraftList from '@/renderer/pages/team/components/memberPicker/TeamMemberDraftList';
import { HoistedPreviewPanel } from '@/renderer/pages/shared-room/components/HoistedPreviewPanel';
import { HybridKanbanBoard } from '@/renderer/pages/shared-room/components/kanban/HybridKanbanBoard';
import { ActionInboxCardStack } from '@/renderer/pages/inbox/components/ActionInboxCardStack';
import MessageCard, { extractResultDigestStatus } from '@/renderer/pages/team/activity/MessageCard';
import TaskCard from '@/renderer/pages/team/activity/TaskCard';
import TeamTabs from '@/renderer/pages/team/components/TeamTabs';
import { TeamTabsProvider } from '@/renderer/pages/team/hooks/TeamTabsContext';

const sampleCatalog: ConnectedModelsCatalogDto = {
  cli_agents: [
    {
      engine_kind: 'cli',
      backend: 'codex',
      agent_id: 'codex-cli',
      assistant_id: 'builtin:codex',
      name: 'OpenAI Codex CLI',
      wallet_type: 'cli_subscription',
      status: 'online',
      supports_native_compact: true,
      models: [{ id: 'gpt-5-codex', label: 'Codex CLI · gpt-5-codex' }],
    },
    {
      engine_kind: 'cli',
      backend: 'claude',
      agent_id: 'claude-cli',
      assistant_id: 'builtin:claude',
      name: 'Claude Code CLI',
      wallet_type: 'cli_subscription',
      status: 'online',
      supports_native_compact: true,
      models: [{ id: 'claude-sonnet-4-5', label: 'Claude CLI · Sonnet 4.5' }],
    },
  ],
  api_providers: [
    {
      engine_kind: 'api_provider',
      backend: 'aionrs',
      provider_id: 'prov-anthropic',
      provider_name: 'Anthropic Pro API',
      platform: 'anthropic',
      assistant_id: 'bare:aionrs',
      wallet_type: 'api_key',
      models: [
        { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      ],
    },
  ],
};

const sampleSlots: SlotContextStatusDto[] = [
  {
    slot_id: 'slot-leader',
    name: 'Architect Lead',
    role: 'leader',
    conversation_id: 'conv-leader',
    backend: 'aionrs',
    provider_id: 'prov-anthropic',
    model_id: 'claude-opus-4-6',
    wallet_type: 'api_key',
    used_tokens: 42000,
    max_tokens: 160000,
    usage_percent: 26,
    level: 'normal',
    compaction_count: 1,
    auto_compact_enabled: true,
    has_anchored_summary: true,
  },
  {
    slot_id: 'slot-worker',
    name: 'Rust Worker',
    role: 'teammate',
    conversation_id: 'conv-worker',
    backend: 'codex',
    model_id: 'gpt-5-codex',
    wallet_type: 'cli_subscription',
    used_tokens: 18000,
    max_tokens: 160000,
    usage_percent: 11,
    level: 'normal',
    compaction_count: 0,
    auto_compact_enabled: true,
    has_anchored_summary: false,
  },
];

function renderWithIsolatedSWR(ui: React.ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>);
}

describe('Phase 2 Token-Optimal Team & Room UX Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.spyOn(ipcBridge.mode.listProviders, 'invoke').mockResolvedValue([]);
    vi.spyOn(ipcBridge.googleAuth.status, 'invoke').mockResolvedValue({ success: false } as any);
    vi.spyOn(ipcBridge.assistants.get, 'invoke').mockResolvedValue(null as any);
    vi.spyOn(ipcBridge.worktrees.getDiff, 'invoke').mockResolvedValue(null as any);
    vi.spyOn(ipcBridge.wallets.summary, 'invoke').mockResolvedValue({
      cli_subscription_runs: 12,
      api_key_runs: 2,
      api_key_spent_usd: 0.35,
      api_key_budget_limit_usd: 5.0,
      soft_warning: false,
      hard_blocked: false,
    });
    vi.spyOn(ipcBridge.wallets.spendUpdated, 'on').mockReturnValue(() => {});

    vi.spyOn(ipcBridge.teamHub.connectedModels, 'invoke').mockResolvedValue(sampleCatalog);
    vi.spyOn(ipcBridge.teamHub.contextStatus, 'invoke').mockResolvedValue({
      team_id: 'team-opt',
      auto_compact_enabled: true,
      auto_compact_threshold_pct: 80,
      economy_mode: 'lean',
      max_context_tokens: 160000,
      tokens_saved_estimate: 24500,
      coalesced_wakes_saved: 6,
      slots: sampleSlots,
    });
    vi.spyOn(ipcBridge.teamHub.compact, 'invoke').mockResolvedValue({
      team_id: 'team-opt',
      auto_compact_enabled: true,
      economy_mode: 'lean',
      max_context_tokens: 160000,
      outcomes: [],
    });
    vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke').mockResolvedValue({
      team_id: 'team-opt',
      outcomes: [],
    });
    vi.spyOn(ipcBridge.teamHub.applyQuotaPreset, 'invoke').mockResolvedValue({
      team_id: 'team-opt',
      outcomes: [],
    });
    vi.spyOn(ipcBridge.teamHub.quickMember, 'invoke').mockResolvedValue({
      assistant_id: 'q-1',
      assistant_name: 'QA Bot',
      backend: 'codex',
      model_id: 'gpt-5-codex',
      wallet_type: 'cli_subscription',
    });
    vi.spyOn(ipcBridge.teamHub.contextUsageUpdated, 'on').mockReturnValue(() => {});
    vi.spyOn(ipcBridge.teamHub.contextCompacted, 'on').mockReturnValue(() => {});
    vi.spyOn(ipcBridge.teamHub.modelsSwitched, 'on').mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves Smart Split (Pro Leader + $0 CLI Worker) and 100% $0 CLI targets accurately', () => {
    const smart = resolveQuotaPresetTargets(sampleCatalog, 'smart_split');
    expect(smart.leaderTarget?.wallet_type).toBe('api_key');
    expect(smart.leaderTarget?.model_id).toBe('claude-opus-4-6');
    expect(smart.workerTarget?.wallet_type).toBe('cli_subscription');
    expect(smart.workerTarget?.backend).toBe('codex');

    const freeOnly = resolveQuotaPresetTargets(sampleCatalog, 'all_free_cli');
    expect(freeOnly.leaderTarget?.wallet_type).toBe('cli_subscription');
    expect(freeOnly.workerTarget?.wallet_type).toBe('cli_subscription');
  });

  it('falls back cleanly to switchModels when applyQuotaPreset returns 404 or is unimplemented', async () => {
    vi.spyOn(ipcBridge.teamHub.applyQuotaPreset, 'invoke').mockRejectedValueOnce(new Error('404 Not Found'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    );
    const { result } = renderHook(() => useTeamContextAndModels('team-opt'), { wrapper });

    await waitFor(() => expect(result.current.slots).toHaveLength(2));

    await act(async () => {
      await result.current.applyQuotaPreset('smart_split', sampleCatalog);
    });

    // Leader + Teammates updated atomically via per-slot updates on 404 fallback
    expect(ipcBridge.teamHub.switchModels.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: 'team-opt',
        preset: 'smart_split',
        scope: 'slots',
        updates: expect.arrayContaining([
          expect.objectContaining({
            slot_id: 'slot-leader',
            target: expect.objectContaining({ model_id: 'claude-opus-4-6', wallet_type: 'api_key' }),
          }),
          expect.objectContaining({
            slot_id: 'slot-worker',
            target: expect.objectContaining({ backend: 'codex', wallet_type: 'cli_subscription' }),
          }),
        ]),
      })
    );
  });

  it('renders Economy Mode segmented bar, 160K Smart Context Ceiling switch, and savings badge in TeamContextCompactPopover', async () => {
    const onUpdateEconomyPrefs = vi.fn().mockResolvedValue(undefined);
    renderWithIsolatedSWR(
      <TeamContextCompactPopover
        slots={sampleSlots}
        autoCompactEnabled={true}
        autoCompactThresholdPct={80}
        economyMode='balanced'
        maxContextTokens={200000}
        tokensSavedEstimate={24500}
        coalescedWakesSaved={6}
        compacting={false}
        onToggleAutoCompact={vi.fn()}
        onUpdateEconomyPrefs={onUpdateEconomyPrefs}
        onCompactAll={vi.fn()}
        onCompactSlot={vi.fn()}
      >
        <button type='button' data-testid='open-compact-popover'>
          Open Compact
        </button>
      </TeamContextCompactPopover>
    );

    fireEvent.click(screen.getByTestId('open-compact-popover'));

    const leanBtn = await screen.findByTestId('team-economy-mode-lean');
    expect(leanBtn).toBeInTheDocument();
    expect(screen.getByTestId('team-economy-savings-pill')).toHaveTextContent('24.5K');

    fireEvent.click(leanBtn);
    expect(onUpdateEconomyPrefs).toHaveBeenCalledWith({ economy_mode: 'lean' });

    const ceilingSwitch = screen.getByTestId('team-compact-ceiling-toggle');
    expect(ceilingSwitch).toHaveClass('shrink-0');
    fireEvent.click(ceilingSwitch);
    expect(onUpdateEconomyPrefs).toHaveBeenCalledWith({ max_context_tokens: 160000 });
  });

  it('defaults Bulk Set Model scope to teammates_only in TeamMemberDraftList and renders 1-click preset pills', async () => {
    const onBulkSetModel = vi.fn();
    const onApplyQuotaPreset = vi.fn();
    renderWithIsolatedSWR(
      <TeamMemberDraftList
        members={[
          {
            selectionId: 'k-lead',
            assistant: {
              id: 'a-1',
              name: 'Pro Leader',
              backend: 'aionrs',
              team_selectable: true,
            },
          },
          {
            selectionId: 'k-worker',
            assistant: {
              id: 'a-2',
              name: 'Fast Worker',
              backend: 'codex',
              team_selectable: true,
            },
          },
        ]}
        leaderSelectionId='k-lead'
        onLeaderChange={vi.fn()}
        onRemove={vi.fn()}
        onBulkSetModel={onBulkSetModel}
        onApplyQuotaPreset={onApplyQuotaPreset}
      />
    );

    fireEvent.click(screen.getByTestId('team-create-bulk-model-btn'));
    const panel = await screen.findByTestId('team-create-bulk-model-panel');
    expect(panel).toHaveClass('bg-dialog-fill-0');

    // Preset pills visible inside popover
    fireEvent.click(screen.getByTestId('model-picker-preset-smart-split'));
    expect(onApplyQuotaPreset).toHaveBeenCalledWith('smart_split');

    // Re-open and pick a model -> default scope must be 'teammates_only' so Leader model is protected
    fireEvent.click(screen.getByTestId('team-create-bulk-model-btn'));
    const modelOption = await screen.findByTestId('connected-model-option-codex-gpt-5-codex');
    fireEvent.click(modelOption);
    expect(onBulkSetModel).toHaveBeenCalledWith(
      expect.objectContaining({ backend: 'codex', model_id: 'gpt-5-codex' }),
      'teammates_only'
    );
  });

  it('keeps plain Enter as newline in QuickCreateMemberInlineForm textarea and submits on Ctrl+Enter', async () => {
    const onCreated = vi.fn();

    renderWithIsolatedSWR(
      <QuickCreateMemberInlineForm teamId='team-opt' onCreated={onCreated} onCancel={vi.fn()} />
    );

    fireEvent.change(screen.getByTestId('quick-member-name-input'), { target: { value: 'QA Bot' } });
    const promptInput = screen.getByTestId('quick-member-prompt-input');
    fireEvent.change(promptInput, { target: { value: 'Line 1' } });

    // Plain Enter in textarea must NOT submit form
    fireEvent.keyDown(promptInput, { key: 'Enter', keyCode: 13 });
    expect(ipcBridge.teamHub.quickMember.invoke).not.toHaveBeenCalled();

    // Ctrl+Enter submits cleanly
    fireEvent.keyDown(promptInput, { key: 'Enter', keyCode: 13, ctrlKey: true });
    await waitFor(() => expect(ipcBridge.teamHub.quickMember.invoke).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('supports in-panel artifact preview, Kanban 1-click Approve Done, and Action Inbox approve_done & quota_fallback cards', () => {
    const onApproveTaskDone = vi.fn();
    const inReviewTask: ISharedRoomTask = {
      id: 'task-review-99',
      room_id: 'room-1',
      from_team_id: 'team-be',
      to_team_id: 'team-fe',
      to_team_name: 'Frontend Team',
      title: 'Verify OpenAPI contract',
      description: 'Contract verified by worker',
      status: 'in_review',
      blocked_by: [],
      artifacts: [],
      created_at: 1000,
      updated_at: 2000,
    };

    const { unmount: unmountPreview } = renderWithIsolatedSWR(
      <HoistedPreviewPanel
        open={true}
        onClose={vi.fn()}
        roomName='api-room'
        activeSubtabOverride='preview'
        task={inReviewTask}
        previewArtifact={{
          file_name: 'schema.json',
          staged_path: 'D:/tmp/schema.json',
          size_bytes: 2048,
          is_image: false,
        }}
        onApproveTaskDone={onApproveTaskDone}
      />
    );

    expect(screen.getByTestId('in-panel-artifact-preview')).toHaveTextContent('schema.json');
    expect(screen.getByTestId('preview-approve-done-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('preview-approve-done-btn'));
    expect(onApproveTaskDone).toHaveBeenCalledWith('task-review-99');
    unmountPreview();

    // Kanban 1-click Approve Done on in_review card
    const onKanbanStatusChange = vi.fn();
    const { unmount: unmountKanban } = render(
      <HybridKanbanBoard tasks={[inReviewTask]} onTaskStatusChange={onKanbanStatusChange} roomId='kanban-approve' />
    );
    const approveCardBtn = screen.getByTestId('kanban-approve-done-task-review-99');
    fireEvent.click(approveCardBtn);
    expect(onKanbanStatusChange).toHaveBeenCalledWith('task-review-99', 'done');
    unmountKanban();

    // ActionInboxCardStack approve_done & quota_fallback cards
    const onResolve = vi.fn();
    const cards: ActionInboxCardDto[] = [
      {
        id: 'card-done-1',
        category: 'approve_done',
        title: 'Task ready for human sign-off',
        summary: 'All tests passed',
        status: 'pending',
        created_at: 1000,
        updated_at: 1000,
      },
      {
        id: 'card-quota-1',
        category: 'quota_fallback',
        title: 'API budget reached 100%',
        summary: 'Switch teammates to $0 CLI?',
        status: 'pending',
        created_at: 1000,
        updated_at: 1000,
      },
    ];
    render(<ActionInboxCardStack items={cards} onResolve={onResolve} />);
    fireEvent.click(screen.getByTestId('inbox-approve-done-card-done-1'));
    expect(onResolve).toHaveBeenCalledWith('card-done-1', 'approve');
    fireEvent.click(screen.getByTestId('inbox-quota-fallback-card-quota-1'));
    expect(onResolve).toHaveBeenCalledWith('card-quota-1', 'approve', undefined);
  });

  it('extracts 4-state Result Digest badges in MessageCard and renders in_review / blocked in TaskCard', () => {
    expect(extractResultDigestStatus('Status: DONE_WITH_CONCERNS\nMinor lint note')).toBe('DONE_WITH_CONCERNS');
    expect(extractResultDigestStatus('[BLOCKED] Missing DB credentials')).toBe('BLOCKED');
    expect(extractResultDigestStatus('Result: NEEDS_CONTEXT')).toBe('NEEDS_CONTEXT');
    expect(extractResultDigestStatus('DONE: All 18 tests green')).toBe('DONE');
    expect(extractResultDigestStatus('Normal chat message')).toBeNull();

    const identity = { nameOf: (s?: string) => s ?? 'Agent', colorOf: () => '#3b82f6' };
    const msg: ITeamMailboxMessage = {
      id: 'm-digest',
      team_id: 'team-opt',
      from_agent_id: 'worker-1',
      to_agent_id: 'leader',
      msg_type: 'message',
      content: 'Status: DONE_WITH_CONCERNS — API schema updated, check migration',
      files: [],
      read: false,
      created_at: 1000,
    };
    const tk: ITeamTaskItem = {
      id: 'tk-rev',
      team_id: 'team-opt',
      subject: 'Audit endpoints',
      status: 'in_review',
      owner: 'worker-1',
      description: 'Ready for review',
      blocked_by: [],
      blocks: [],
      created_at: 1000,
      updated_at: 1000,
    };

    render(
      <div>
        <MessageCard message={msg} identity={identity} />
        <TaskCard task={tk} identity={identity} />
      </div>
    );

    const digestBadge = screen.getByTestId('message-digest-status');
    expect(digestBadge).toHaveAttribute('data-digest-status', 'DONE_WITH_CONCERNS');
    expect(digestBadge).toHaveTextContent('Done w/ Concerns');
    expect(screen.getByText('In review')).toBeInTheDocument();
  });

  it('protects TeamTabs inline rename input with 60ms Vietnamese Telex IME guard and verifies vi-VN NFC parity', async () => {
    const renameMock = vi.fn();
    const assistants: TeamAssistant[] = [
      {
        slot_id: 'slot-lead',
        conversation_id: 'conv-lead',
        role: 'leader',
        assistant_backend: 'claude',
        assistant_name: 'Leader',
        status: 'idle',
      },
      {
        slot_id: 'slot-dev',
        conversation_id: 'conv-dev',
        role: 'teammate',
        assistant_backend: 'codex',
        assistant_name: 'Worker',
        status: 'idle',
      },
    ];

    renderWithIsolatedSWR(
      <TeamTabsProvider
        assistants={assistants}
        statusMap={new Map()}
        defaultActiveSlotId='slot-lead'
        team_id='team-opt'
        renameAssistant={renameMock}
      >
        <TeamTabs warmingUp={false} />
      </TeamTabsProvider>
    );

    fireEvent.doubleClick(screen.getByTestId('team-tab-slot-dev'));
    const input = screen.getByDisplayValue('Worker');
    fireEvent.change(input, { target: { value: 'Kỹ sư Rust' } });

    // During IME composition: Enter must NOT commit rename
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(renameMock).not.toHaveBeenCalled();

    // Immediately after compositionEnd (<60ms): Enter must NOT commit rename
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(renameMock).not.toHaveBeenCalled();

    // After >60ms guard: Enter commits rename cleanly
    await new Promise((r) => setTimeout(r, 75));
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(renameMock).toHaveBeenCalledWith('slot-dev', 'Kỹ sư Rust');

    // Verify vi-VN locale NFC & translation completeness
    const viRaw = JSON.stringify(viVNTeamLocale);
    expect(viRaw).toBe(viRaw.normalize('NFC'));
    expect(viVNTeamLocale.sider.createTeam).toBe('Tạo Team mới');
    expect(viVNTeamLocale.sharedRoom.composer.liveSteeringOn).not.toMatch(/^⚡/);
    expect(enUSTeamLocale.sharedRoom.composer.liveSteeringOn).toBe('Live steering: Active');
  });

  it('interpolates {{limit}} in BudgetWarningCard and forwards workspace_mode in ipcBridge.team.create', async () => {
    // 1. Verify BudgetWarningCard passes limit interpolation param (fixes raw {{limit}} in vi-VN)
    const budgetCard: ActionInboxCardDto = {
      id: 'card-budget-vi',
      category: 'budget_warning',
      title: 'Ngân sách API đạt 80%',
      summary: 'Cảnh báo ví trả phí',
      status: 'pending',
      details: {
        spent_usd: 4.0,
        budget_limit_usd: 5.0,
        percentage: 80,
      },
      created_at: 1000,
      updated_at: 1000,
    };
    const { unmount } = render(<ActionInboxCardStack items={[budgetCard]} onResolve={vi.fn()} />);
    expect(screen.queryByText(/\{\{limit\}\}/)).not.toBeInTheDocument();
    expect(screen.getByText('Spent: $4.00 / $5.00')).toBeInTheDocument();
    unmount();

    // 2. Verify ipcBridge.team.create forwards workspace_mode: 'isolated' to POST /api/teams
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 't-iso',
          user_id: 'u-1',
          name: 'Iso Team',
          workspace: '/repo',
          workspace_mode: 'isolated',
          leader_assistant_id: 'a-1',
          assistants: [],
          created_at: 1,
          updated_at: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const created = await ipcBridge.team.create.invoke({
      user_id: 'u-1',
      name: 'Iso Team',
      workspace: '/repo',
      workspace_mode: 'isolated',
      agents: [
        {
          role: 'leader',
          assistant_id: 'builtin:claude',
          assistant_name: 'Lead',
          model: 'claude-sonnet-4-5',
        },
      ],
    });

    expect(created.workspace_mode).toBe('isolated');
    const [, init] = fetchSpy.mock.calls[0];
    const sentBody = JSON.parse(String(init?.body ?? '{}'));
    expect(sentBody.workspace_mode).toBe('isolated');
  });

  it('renders accurate per-turn _meta token totals and KV-Cache Hit % in TeamContextCompactPopover', async () => {
    const meteredSlots: SlotContextStatusDto[] = [
      {
        ...sampleSlots[0],
        wakeup_turns: 3,
        input_tokens_total: 10000,
        cached_read_tokens_total: 30000,
        output_tokens_total: 1500,
      },
      {
        ...sampleSlots[1],
        wakeup_turns: 4,
        input_tokens_total: 5000,
        cached_read_tokens_total: 20000,
        output_tokens_total: 800,
      },
    ];

    renderWithIsolatedSWR(
      <TeamContextCompactPopover
        slots={meteredSlots}
        autoCompactEnabled={true}
        autoCompactThresholdPct={80}
        economyMode='lean'
        maxContextTokens={160000}
        tokensSavedEstimate={24500}
        coalescedWakesSaved={6}
        totalInputTokens={15000}
        totalCachedReadTokens={50000}
        totalOutputTokens={2300}
        compacting={false}
        onToggleAutoCompact={vi.fn()}
        onCompactAll={vi.fn()}
        onCompactSlot={vi.fn()}
      >
        <button type='button' data-testid='open-metered-compact-popover'>
          Open Metered Compact
        </button>
      </TeamContextCompactPopover>
    );

    fireEvent.click(screen.getByTestId('open-metered-compact-popover'));

    // Team prompt total = 15,000 + 50,000 = 65,000 -> KV-Cache = round(50,000 / 65,000 * 100) = 77%
    const teamTelemetry = await screen.findByTestId('team-economy-telemetry-bar');
    expect(teamTelemetry).toHaveTextContent('In 15.0K · Cache 50.0K · Out 2.3K');
    expect(screen.getByTestId('team-economy-kv-cache-badge')).toHaveTextContent('KV-Cache 77%');

    // Leader slot: 30,000 / (10,000 + 30,000) = 75%
    expect(screen.getByTestId('team-compact-slot-telemetry-slot-leader')).toHaveTextContent(
      'In 10.0K · Cache 30.0K · Out 1.5K'
    );
    expect(screen.getByTestId('team-compact-slot-kv-cache-slot-leader')).toHaveTextContent('KV-Cache 75%');

    // Worker slot: 20,000 / (5,000 + 20,000) = 80%
    expect(screen.getByTestId('team-compact-slot-telemetry-slot-worker')).toHaveTextContent(
      'In 5.0K · Cache 20.0K · Out 800'
    );
    expect(screen.getByTestId('team-compact-slot-kv-cache-slot-worker')).toHaveTextContent('KV-Cache 80%');

    // Locale keys exist in both en-US and vi-VN with NFC normalization
    expect(enUSTeamLocale.modelHub.kvCacheHitBadge).toBe('KV-Cache {{pct}}%');
    expect(viVNTeamLocale.modelHub.actualTokensLabel).toBe('Thực thu'.normalize('NFC'));
  });

  it('syncs live tokens_saved_estimate, coalesced_wakes_saved, and _meta KV-Cache totals from team:context_usage WebSocket events', async () => {
    let usageListener: ((ev: TeamContextUsageEvent) => void) | undefined;
    vi.spyOn(ipcBridge.teamHub.contextUsageUpdated, 'on').mockImplementation((cb) => {
      usageListener = cb;
      return () => {
        usageListener = undefined;
      };
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    );
    const { result } = renderHook(() => useTeamContextAndModels('team-opt'), { wrapper });

    await waitFor(() => expect(result.current.tokensSavedEstimate).toBe(24500));

    await act(async () => {
      usageListener?.({
        team_id: 'team-opt',
        auto_compact_enabled: true,
        auto_compact_threshold_pct: 80,
        economy_mode: 'balanced',
        max_context_tokens: 160000,
        tokens_saved_estimate: 41200,
        coalesced_wakes_saved: 11,
        total_wakeup_turns: 5,
        total_input_tokens: 6858,
        total_cached_read_tokens: 20366,
        total_output_tokens: 412,
        slots: [
          {
            ...sampleSlots[1],
            backend: 'antigravity',
            model_id: 'gemini-3-flash-low',
            wakeup_turns: 5,
            input_tokens_total: 6858,
            cached_read_tokens_total: 20366,
            output_tokens_total: 412,
          },
        ],
      });
    });

    expect(result.current.economyMode).toBe('balanced');
    expect(result.current.tokensSavedEstimate).toBe(41200);
    expect(result.current.coalescedWakesSaved).toBe(11);
    expect(result.current.totalInputTokens).toBe(6858);
    expect(result.current.totalCachedReadTokens).toBe(20366);
    expect(result.current.totalOutputTokens).toBe(412);
    // 20366 / (6858 + 20366) = 20366 / 27224 = 74.8089% -> 75%
    expect(result.current.kvCacheHitPct).toBe(75);
  });
});
