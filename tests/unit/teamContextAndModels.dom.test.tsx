import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { I18nextProvider } from 'react-i18next';
import i18n, { changeLanguage } from '@/renderer/services/i18n';
import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import type {
  ConnectedModelsCatalogDto,
  SlotContextStatusDto,
  TeamContextStatusResponse,
} from '@/common/types/team/teamHubTypes';
import type { TeamAssistant, TTeam } from '@/common/types/team/teamTypes';
import TeamCreateModal from '@/renderer/pages/team/components/TeamCreateModal';
import TeamTabs from '@/renderer/pages/team/components/TeamTabs';
import TeamChatView from '@/renderer/pages/team/components/TeamChatView';
import { TeamTabsProvider } from '@/renderer/pages/team/hooks/TeamTabsContext';
import { TeamIdentityProvider } from '@/renderer/pages/team/identity/TeamIdentityContext';
import SharedRoomPage from '@/renderer/pages/shared-room';
import { TwoLaneProfiler } from '@/renderer/pages/shared-room/components/TwoLaneProfiler';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'room-hub-1' }),
  useNavigate: () => vi.fn(),
}));

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

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user_test_1', username: 'tester' },
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    theme: 'light',
    setTheme: vi.fn(),
    activeTheme: null,
    activeId: 'light',
    selectTheme: vi.fn(),
    fontScale: 1,
    setFontScale: vi.fn(),
    fontSizes: {},
    setFontSize: vi.fn(),
    fontFamilies: {},
    setFontFamily: vi.fn(),
    fontWeights: {},
    setFontWeight: vi.fn(),
  }),
}));

vi.mock('@renderer/components/workspace', () => ({
  WorkspaceFolderSelect: ({
    value,
    onChange,
    placeholder,
    triggerTestId,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    triggerTestId?: string;
  }) => (
    <input
      data-testid={triggerTestId ?? 'workspace-input'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamAssistantOptions', () => ({
  useTeamAssistantOptions: () => ({
    assistants: [
      {
        id: 'builtin:claude',
        name: 'Claude Architect',
        backend: 'claude',
        team_selectable: true,
      },
      {
        id: 'builtin:codex',
        name: 'Codex Builder',
        backend: 'codex',
        team_selectable: true,
      },
    ],
    loading: false,
    error: null,
    filterByQuery: (q: string) => [],
  }),
}));

vi.mock('@renderer/components/media/Diff2Html', () => ({
  default: () => <div data-testid='mock-diff2html'>Diff</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  default: ({ modelSelection }: { modelSelection: { handleSelectModel: (p: any, m: string) => Promise<void> } }) => (
    <button
      type='button'
      data-testid='mock-aionrs-select-model-btn'
      onClick={() =>
        void modelSelection.handleSelectModel(
          {
            id: 'prov_openrouter',
            name: 'OpenRouter',
            platform: 'openrouter',
            base_url: 'https://openrouter.ai/api/v1',
            api_key: '',
            models: ['deepseek/deepseek-r1'],
          },
          'deepseek/deepseek-r1'
        )
      }
    >
      Trigger Aionrs Model Select
    </button>
  ),
}));

vi.mock('@/renderer/pages/shared-room/SharedRoomFormModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/shared-room/hooks/useSharedRoomList', () => ({
  useSharedRoomList: () => ({
    mutate: vi.fn(),
    removeRoom: vi.fn(),
  }),
}));

const MOCK_CATALOG: ConnectedModelsCatalogDto = {
  cli_agents: [
    {
      engine_kind: 'cli',
      backend: 'claude',
      agent_id: 'claude-cli',
      assistant_id: 'builtin:claude',
      name: 'Claude Code CLI',
      wallet_type: 'cli_subscription',
      status: 'online',
      supports_native_compact: true,
      models: [
        { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
        { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      ],
    },
    {
      engine_kind: 'cli',
      backend: 'codex',
      agent_id: 'codex-cli',
      assistant_id: 'builtin:codex',
      name: 'OpenAI Codex CLI',
      wallet_type: 'cli_subscription',
      status: 'online',
      supports_native_compact: true,
      models: [{ id: 'gpt-5-codex', label: 'GPT-5 Codex' }],
    },
  ],
  api_providers: [
    {
      engine_kind: 'api_provider',
      backend: 'aionrs',
      provider_id: 'prov_openrouter',
      provider_name: 'OpenRouter',
      platform: 'openrouter',
      assistant_id: 'bare:aionrs',
      wallet_type: 'api_key',
      models: [{ id: 'deepseek/deepseek-r1', label: 'DeepSeek R1' }],
    },
  ],
};

function makeSlots(): SlotContextStatusDto[] {
  return [
    {
      slot_id: 'slot-leader',
      name: 'Claude Lead',
      role: 'leader',
      conversation_id: 'conv-leader',
      backend: 'claude',
      model_id: 'claude-opus-4-6',
      wallet_type: 'cli_subscription',
      used_tokens: 84000,
      max_tokens: 200000,
      usage_percent: 42,
      level: 'normal',
      compaction_count: 1,
      auto_compact_enabled: true,
      has_anchored_summary: true,
    },
    {
      slot_id: 'slot-warn',
      name: 'Codex Worker',
      role: 'teammate',
      conversation_id: 'conv-warn',
      backend: 'codex',
      model_id: 'gpt-5-codex',
      wallet_type: 'cli_subscription',
      used_tokens: 150000,
      max_tokens: 200000,
      usage_percent: 75,
      level: 'warning',
      compaction_count: 0,
      auto_compact_enabled: true,
      has_anchored_summary: false,
    },
    {
      slot_id: 'slot-crit',
      name: 'API Reviewer',
      role: 'teammate',
      conversation_id: 'conv-crit',
      backend: 'aionrs',
      provider_id: 'prov_openrouter',
      model_id: 'deepseek/deepseek-r1',
      wallet_type: 'api_key',
      used_tokens: 180000,
      max_tokens: 200000,
      usage_percent: 90,
      level: 'critical',
      compaction_count: 2,
      auto_compact_enabled: true,
      has_anchored_summary: true,
    },
  ];
}

function makeTeamAssistants(): TeamAssistant[] {
  return [
    {
      slot_id: 'slot-leader',
      conversation_id: 'conv-leader',
      role: 'leader',
      assistant_backend: 'claude',
      assistant_name: 'Claude Lead',
      assistant_id: 'builtin:claude',
      status: 'idle',
      model: 'claude-opus-4-6',
      context_reset: { supported: false, availability: 'leader_not_targetable' },
    },
    {
      slot_id: 'slot-warn',
      conversation_id: 'conv-warn',
      role: 'teammate',
      assistant_backend: 'codex',
      assistant_name: 'Codex Worker',
      assistant_id: 'builtin:codex',
      status: 'active',
      model: 'gpt-5-codex',
      context_reset: { supported: true, availability: 'busy' },
    },
    {
      slot_id: 'slot-crit',
      conversation_id: 'conv-crit',
      role: 'teammate',
      assistant_backend: 'aionrs',
      assistant_name: 'API Reviewer',
      assistant_id: 'bare:aionrs',
      status: 'idle',
      model: 'deepseek/deepseek-r1',
      context_reset: { supported: true, availability: 'ready' },
    },
  ];
}

function renderIsolated(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>
    </I18nextProvider>
  );
}

describe('Phase 3: Long-Session Context Compaction & Connected Models Everywhere', () => {
  let usageListeners: Array<(ev: any) => void> = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    usageListeners = [];
    vi.spyOn(configService, 'set').mockResolvedValue(undefined);
    if ('systemSettings' in ipcBridge && ipcBridge.systemSettings?.changeLanguage) {
      vi.spyOn(ipcBridge.systemSettings.changeLanguage, 'invoke').mockResolvedValue(undefined as any);
    }
    await changeLanguage('en-US');

    vi.spyOn(ipcBridge.mode.listProviders, 'invoke').mockResolvedValue([]);
    vi.spyOn(ipcBridge.googleAuth.status, 'invoke').mockResolvedValue({ success: false } as any);
    vi.spyOn(ipcBridge.assistants.get, 'invoke').mockResolvedValue(null as any);
    vi.spyOn(ipcBridge.channel.upsertTeamBinding, 'invoke').mockResolvedValue({} as any);
    vi.spyOn(ipcBridge.wallets.summary, 'invoke').mockResolvedValue({
      api_key_budget_limit_usd: 5.0,
      api_key_spent_usd: 1.2,
      cli_subscription_runs: 20,
      api_key_runs: 4,
      soft_warning: false,
      hard_blocked: false,
    });
    vi.spyOn(ipcBridge.wallets.spendUpdated, 'on').mockReturnValue(() => {});

    vi.spyOn(ipcBridge.teamHub.connectedModels, 'invoke').mockResolvedValue(MOCK_CATALOG);
    vi.spyOn(ipcBridge.teamHub.contextStatus, 'invoke').mockResolvedValue({
      team_id: 'team-alpha',
      auto_compact_enabled: true,
      auto_compact_threshold_pct: 80,
      slots: makeSlots(),
    });
    vi.spyOn(ipcBridge.teamHub.compact, 'invoke').mockResolvedValue({
      team_id: 'team-alpha',
      auto_compact_enabled: true,
      outcomes: [
        {
          slot_id: 'slot-leader',
          name: 'Claude Lead',
          strategy_used: 'anchored_rollover',
          previous_tokens: 84000,
          new_tokens: 12000,
        },
      ],
    });
    vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke').mockResolvedValue({
      team_id: 'team-alpha',
      outcomes: [
        {
          slot_id: 'slot-warn',
          name: 'Codex Worker',
          role: 'teammate',
          previous_backend: 'codex',
          previous_model: 'gpt-5-codex',
          new_backend: 'aionrs',
          new_provider_id: 'prov_openrouter',
          new_model: 'deepseek/deepseek-r1',
          wallet_type: 'api_key',
          status: 'applied',
          handover_injected: true,
        },
      ],
    });
    vi.spyOn(ipcBridge.teamHub.contextUsageUpdated, 'on').mockImplementation((cb) => {
      usageListeners.push(cb);
      return () => {
        usageListeners = usageListeners.filter((h) => h !== cb);
      };
    });
    vi.spyOn(ipcBridge.teamHub.contextCompacted, 'on').mockReturnValue(() => {});
    vi.spyOn(ipcBridge.teamHub.modelsSwitched, 'on').mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Surface 1: TeamCreateModal (+ Quick Create Member, Per-Member Override & Bulk Set Model)', () => {
    it('preserves E2E selectors, creates inline quick member, and applies per-slot model overrides on team creation', async () => {
      const quickSpy = vi.spyOn(ipcBridge.teamHub.quickMember, 'invoke').mockResolvedValue({
        assistant_id: 'quick:rust-sec',
        assistant_name: 'Security Auditor',
        backend: 'aionrs',
        provider_id: 'prov_openrouter',
        model_id: 'deepseek/deepseek-r1',
        wallet_type: 'api_key',
      });

      const createdTeam: TTeam = {
        id: 'team-created-1',
        user_id: 'user_test_1',
        name: 'Core Infra Team',
        workspace: '',
        workspace_mode: 'shared',
        leader_assistant_id: 'builtin:claude',
        leader_agent_id: 'builtin:claude',
        created_at: 1000,
        updated_at: 1000,
        assistants: [
          {
            slot_id: 'slot-lead-1',
            conversation_id: 'c-1',
            role: 'leader',
            assistant_backend: 'claude',
            assistant_name: 'Claude Architect',
            assistant_id: 'builtin:claude',
            status: 'idle',
            context_reset: { supported: false, availability: 'leader_not_targetable' },
          },
          {
            slot_id: 'slot-quick-2',
            conversation_id: 'c-2',
            role: 'teammate',
            assistant_backend: 'aionrs',
            assistant_name: 'Security Auditor',
            assistant_id: 'quick:rust-sec',
            status: 'idle',
            context_reset: { supported: true, availability: 'ready' },
          },
        ],
        agents: [],
      };
      createdTeam.agents = createdTeam.assistants;

      const createTeamSpy = vi.spyOn(ipcBridge.team.create, 'invoke').mockResolvedValue(createdTeam);
      const switchSpy = vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke');
      const onCreated = vi.fn();

      renderIsolated(<TeamCreateModal visible={true} onClose={vi.fn()} onCreated={onCreated} />);

      // Verify existing E2E selectors remain intact
      expect(screen.getByTestId('team-create-layout')).toBeInTheDocument();
      expect(screen.getByTestId('team-create-assistant-pane')).toBeInTheDocument();
      expect(screen.getByTestId('team-create-details-pane')).toBeInTheDocument();
      expect(screen.getByTestId('team-create-member-list-box')).toBeInTheDocument();
      expect(document.querySelector('button[aria-label="Close"]')).toBeInTheDocument();

      // 1. Add Claude Architect as Leader from standard picker
      fireEvent.click(screen.getByTestId('team-create-agent-option-builtin:claude'));

      // 2. Open + Quick Create Member inline form
      fireEvent.click(screen.getByTestId('team-create-quick-member-btn'));
      expect(screen.getByTestId('quick-create-member-form')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('quick-member-name-input'), {
        target: { value: 'Security Auditor' },
      });
      fireEvent.change(screen.getByTestId('quick-member-prompt-input'), {
        target: { value: 'Audit OWASP and SQLite queries' },
      });

      // Pick OpenRouter / DeepSeek R1 from Connected Model Picker
      fireEvent.click(screen.getByTestId('quick-member-model-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('connected-model-option-aionrs-deepseek/deepseek-r1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('connected-model-option-aionrs-deepseek/deepseek-r1'));

      fireEvent.click(screen.getByTestId('quick-member-submit-btn'));

      await waitFor(() => {
        expect(quickSpy).toHaveBeenCalledWith({
          name: 'Security Auditor',
          role_prompt: 'Audit OWASP and SQLite queries',
          backend: 'aionrs',
          provider_id: 'prov_openrouter',
          model_id: 'deepseek/deepseek-r1',
          save_to_catalog: false,
          team_id: undefined,
        });
      });

      // Override Leader's connected model via per-member model chip
      const modelChips = screen.getAllByTestId(/^team-create-member-model-/);
      expect(modelChips.length).toBe(2);
      fireEvent.click(modelChips[0]);
      await waitFor(() => {
        expect(screen.getByTestId('connected-model-option-claude-claude-opus-4-6')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('connected-model-option-claude-claude-opus-4-6'));

      // Enter team name and confirm create
      fireEvent.change(screen.getByTestId('team-create-name-input'), {
        target: { value: 'Core Infra Team' },
      });
      fireEvent.click(screen.getByText('Confirm Create').closest('button')!);

      await waitFor(() => {
        expect(createTeamSpy).toHaveBeenCalledTimes(1);
        expect(switchSpy).toHaveBeenCalledWith({
          team_id: 'team-created-1',
          scope: 'slots',
          updates: [
            {
              slot_id: 'slot-lead-1',
              target: expect.objectContaining({
                backend: 'claude',
                model_id: 'claude-opus-4-6',
                wallet_type: 'cli_subscription',
              }),
            },
            {
              slot_id: 'slot-quick-2',
              target: expect.objectContaining({
                backend: 'aionrs',
                provider_id: 'prov_openrouter',
                model_id: 'deepseek/deepseek-r1',
                wallet_type: 'api_key',
              }),
            },
          ],
        });
        expect(onCreated).toHaveBeenCalledWith(createdTeam);
      });
    });

    it('supports Bulk Set Model in both "Teammates Only (Keep Leader)" and "All Members (incl. Leader)" modes', async () => {
      const createdTeam: TTeam = {
        id: 'team-bulk-1',
        user_id: 'user_test_1',
        name: 'Bulk Model Team',
        workspace: '',
        workspace_mode: 'shared',
        leader_assistant_id: 'builtin:claude',
        leader_agent_id: 'builtin:claude',
        created_at: 1000,
        updated_at: 1000,
        assistants: [
          {
            slot_id: 'slot-leader',
            conversation_id: 'c-1',
            role: 'leader',
            assistant_backend: 'claude',
            assistant_name: 'Claude Architect',
            assistant_id: 'builtin:claude',
            status: 'idle',
            context_reset: { supported: false, availability: 'leader_not_targetable' },
          },
          {
            slot_id: 'slot-tm-1',
            conversation_id: 'c-2',
            role: 'teammate',
            assistant_backend: 'codex',
            assistant_name: 'Codex Builder',
            assistant_id: 'builtin:codex',
            status: 'idle',
            context_reset: { supported: true, availability: 'ready' },
          },
        ],
        agents: [],
      };
      createdTeam.agents = createdTeam.assistants;
      vi.spyOn(ipcBridge.team.create, 'invoke').mockResolvedValue(createdTeam);
      const switchSpy = vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke');

      renderIsolated(<TeamCreateModal visible={true} onClose={vi.fn()} onCreated={vi.fn()} />);

      // Select Leader (Claude) + Teammate (Codex)
      fireEvent.click(screen.getByTestId('team-create-agent-option-builtin:claude'));
      fireEvent.click(screen.getByTestId('team-create-agent-option-builtin:codex'));

      // Open Bulk Set Model -> choose "Teammates Only (Keep Leader)" -> select Codex GPT-5
      fireEvent.click(screen.getByTestId('team-create-bulk-model-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('model-picker-scope-teammates')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('model-picker-scope-teammates'));
      fireEvent.click(screen.getByTestId('connected-model-option-codex-gpt-5-codex'));

      fireEvent.change(screen.getByTestId('team-create-name-input'), {
        target: { value: 'Bulk Model Team' },
      });
      fireEvent.click(screen.getByText('Confirm Create').closest('button')!);

      // Verify ONLY teammate slot received override (Leader kept untouched!)
      await waitFor(() => {
        expect(switchSpy).toHaveBeenCalledWith({
          team_id: 'team-bulk-1',
          scope: 'slots',
          updates: [
            {
              slot_id: 'slot-tm-1',
              target: expect.objectContaining({
                backend: 'codex',
                model_id: 'gpt-5-codex',
              }),
            },
          ],
        });
      });
    });
  });

  describe('Surface 2: TeamTabs Context Usage Badges, Auto-Compact 80%, & Cross-Engine Switch Models', () => {
    function renderTeamTabs() {
      const assistants = makeTeamAssistants();
      const statusMap = new Map(assistants.map((a) => [a.slot_id, { slot_id: a.slot_id, status: a.status }]));
      return renderIsolated(
        <TeamTabsProvider
          assistants={assistants}
          statusMap={statusMap}
          defaultActiveSlotId='slot-leader'
          team_id='team-alpha'
          addAssistant={vi.fn()}
        >
          <TeamIdentityProvider colorOfConversation={() => '#165DFF'}>
            <TeamTabs />
          </TeamIdentityProvider>
        </TeamTabsProvider>
      );
    }

    it('renders normal (42%), warning (75%), and critical (90%) context badges and updates live on WS event', async () => {
      renderTeamTabs();

      await waitFor(() => {
        expect(screen.getByTestId('team-tab-context-slot-leader')).toHaveTextContent('42%');
      });

      expect(screen.getByTestId('team-tab-context-slot-leader')).toHaveAttribute('data-context-level', 'normal');
      expect(screen.getByTestId('team-tab-context-slot-warn')).toHaveTextContent('75%');
      expect(screen.getByTestId('team-tab-context-slot-warn')).toHaveAttribute('data-context-level', 'warning');
      expect(screen.getByTestId('team-tab-context-slot-crit')).toHaveTextContent('90%');
      expect(screen.getByTestId('team-tab-context-slot-crit')).toHaveAttribute('data-context-level', 'critical');

      // Simulate realtime WebSocket team:context_usage push after compaction
      act(() => {
        usageListeners.forEach((cb) =>
          cb({
            user_id: 'user_test_1',
            team_id: 'team-alpha',
            auto_compact_enabled: true,
            slots: makeSlots().map((s) =>
              s.slot_id === 'slot-crit' ? { ...s, usage_percent: 18, level: 'normal' } : s
            ),
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('team-tab-context-slot-crit')).toHaveTextContent('18%');
        expect(screen.getByTestId('team-tab-context-slot-crit')).toHaveAttribute('data-context-level', 'normal');
      });
    });

    it('toggles Auto-Compact 80%, compacts individual Leader slot, and compacts entire team', async () => {
      const compactSpy = vi.spyOn(ipcBridge.teamHub.compact, 'invoke');
      renderTeamTabs();

      await waitFor(() => {
        expect(screen.getByTestId('team-tabs-compact-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('team-tabs-compact-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('team-compact-popover-panel')).toBeInTheDocument();
      });

      // Toggle Auto-Compact off
      fireEvent.click(screen.getByTestId('team-compact-auto-switch'));
      await waitFor(() => {
        expect(compactSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          mode: 'prefs_only',
          auto_compact_enabled: false,
        });
      });

      // Compact Leader slot individually
      fireEvent.click(screen.getByTestId('team-compact-slot-btn-slot-leader'));
      await waitFor(() => {
        expect(compactSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          slot_id: 'slot-leader',
          mode: 'auto',
        });
      });

      // Compact Entire Team 1-click
      fireEvent.click(screen.getByTestId('team-compact-all-btn'));
      await waitFor(() => {
        expect(compactSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          mode: 'auto',
        });
      });
    });

    it('triggers Cross-Engine Switch Models across All vs Teammates Only with force_interrupt', async () => {
      const switchSpy = vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke');
      renderTeamTabs();

      fireEvent.click(screen.getByTestId('team-tabs-switch-models-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('team-tabs-switch-models-panel')).toBeInTheDocument();
      });

      // Select Teammates Only + enable Interrupt & Swap Immediately -> switch to OpenRouter DeepSeek R1
      fireEvent.click(screen.getByTestId('model-picker-scope-teammates'));
      fireEvent.click(screen.getByTestId('model-picker-force-interrupt-switch'));
      fireEvent.click(screen.getByTestId('connected-model-option-aionrs-deepseek/deepseek-r1'));

      await waitFor(() => {
        expect(switchSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          scope: 'teammates_only',
          target: expect.objectContaining({
            backend: 'aionrs',
            provider_id: 'prov_openrouter',
            model_id: 'deepseek/deepseek-r1',
            wallet_type: 'api_key',
          }),
          force_interrupt: true,
        });
      });
    });

    it('creates a new teammate inline via + Quick Create Member inside TeamAddMemberPopover', async () => {
      const quickSpy = vi.spyOn(ipcBridge.teamHub.quickMember, 'invoke').mockResolvedValue({
        assistant_id: 'quick:live-tm',
        assistant_name: 'Live QA Challenger',
        backend: 'codex',
        model_id: 'gpt-5-codex',
        wallet_type: 'cli_subscription',
        added_agent: { slot_id: 'slot-live-qa' },
      });

      renderTeamTabs();

      fireEvent.click(screen.getByTestId('team-tab-add-member'));
      await waitFor(() => {
        expect(screen.getByTestId('team-add-member-quick-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('team-add-member-quick-btn'));
      fireEvent.change(screen.getByTestId('quick-member-name-input'), {
        target: { value: 'Live QA Challenger' },
      });
      fireEvent.click(screen.getByTestId('quick-member-submit-btn'));

      await waitFor(() => {
        expect(quickSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Live QA Challenger',
            team_id: 'team-alpha',
            save_to_catalog: false,
          })
        );
      });
    });

    it('synchronizes TeamChatView AionrsTeamChat model selection with teamHub.switchModels', async () => {
      const updateConvSpy = vi.spyOn(ipcBridge.conversation.update, 'invoke').mockResolvedValue(true);
      const switchSpy = vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke');
      const assistants = makeTeamAssistants();
      const statusMap = new Map(assistants.map((a) => [a.slot_id, { slot_id: a.slot_id, status: a.status }]));

      renderIsolated(
        <TeamTabsProvider
          assistants={assistants}
          statusMap={statusMap}
          defaultActiveSlotId='slot-crit'
          team_id='team-alpha'
        >
          <TeamChatView
            conversation={
              {
                id: 'conv-crit',
                name: 'API Reviewer',
                type: 'aionrs',
                model: {
                  id: 'prov_openrouter',
                  name: 'OpenRouter',
                  platform: 'openrouter',
                  base_url: '',
                  api_key: '',
                  use_model: 'openai/gpt-4o-mini',
                },
                extra: { workspace: '/tmp/ws' },
              } as any
            }
            team_id='team-alpha'
            slot_id='slot-crit'
          />
        </TeamTabsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('mock-aionrs-select-model-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('mock-aionrs-select-model-btn'));

      await waitFor(() => {
        expect(updateConvSpy).toHaveBeenCalledTimes(1);
        expect(switchSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          scope: 'slots',
          updates: [
            {
              slot_id: 'slot-crit',
              target: {
                backend: 'aionrs',
                provider_id: 'prov_openrouter',
                model_id: 'deepseek/deepseek-r1',
              },
            },
          ],
        });
      });
    });
  });

  describe('Surface 3: SharedRoomPage Header Toolbar & TwoLaneProfiler Context Window Health', () => {
    beforeEach(() => {
      vi.spyOn(ipcBridge.sharedRoom.get, 'invoke').mockResolvedValue({
        id: 'room-hub-1',
        name: 'release-hub',
        description: 'Cross-team release hub',
        created_at: 1000,
        updated_at: 2000,
        hop_count_since_human: 1,
        max_hops: 5,
        is_active_dm_target: false,
        telegram_chat_id: null,
        telegram_thread_id: null,
        artifacts_dir: '/tmp/artifacts',
        rules: '',
        members: [
          {
            team_id: 'team-alpha',
            team_name: 'Alpha Team',
            leader_name: 'Claude Lead',
            is_host: true,
            pending_handoff_msg_id: null,
          },
        ],
      } as any);
      vi.spyOn(ipcBridge.sharedRoom.listMessages, 'invoke').mockResolvedValue([]);
      vi.spyOn(ipcBridge.sharedRoom.listTasks, 'invoke').mockResolvedValue([]);
      vi.spyOn(ipcBridge.sharedRoom.updated, 'on').mockReturnValue(() => {});
      vi.spyOn(ipcBridge.sharedRoom.removed, 'on').mockReturnValue(() => {});
      vi.spyOn(ipcBridge.sharedRoom.messageCreated, 'on').mockReturnValue(() => {});
      vi.spyOn(ipcBridge.sharedRoom.taskChanged, 'on').mockReturnValue(() => {});
    });

    it('renders SharedRoomPage live Context pill, 1-click Compact Context, and 1-click Switch Team Models', async () => {
      const compactSpy = vi.spyOn(ipcBridge.teamHub.compact, 'invoke');
      const switchSpy = vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke');

      renderIsolated(<SharedRoomPage />);

      await waitFor(() => {
        expect(screen.getByTestId('shared-room-context-pill')).toHaveTextContent('Context 90%');
      });
      expect(screen.getByTestId('shared-room-context-pill')).toHaveAttribute('data-context-level', 'critical');

      // 1-click Compact Context in SharedRoomPage header
      fireEvent.click(screen.getByTestId('shared-room-compact-btn'));
      await waitFor(() => {
        expect(compactSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          mode: 'auto',
        });
      });

      // 1-click Switch Team Models (All Members incl. Leader -> $0 Codex CLI)
      fireEvent.click(screen.getByTestId('shared-room-switch-models-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('shared-room-switch-models-panel')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('connected-model-option-codex-gpt-5-codex'));

      await waitFor(() => {
        expect(switchSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          scope: 'all',
          target: expect.objectContaining({
            backend: 'codex',
            model_id: 'gpt-5-codex',
            wallet_type: 'cli_subscription',
          }),
          force_interrupt: false,
        });
      });
    });

    it('renders TwoLaneProfiler Context Window Health with per-slot progress, wallet badges, compaction counts & actions', async () => {
      const statusPayload: TeamContextStatusResponse = {
        team_id: 'team-alpha',
        auto_compact_enabled: true,
        auto_compact_threshold_pct: 80,
        slots: makeSlots(),
      };
      const compactSpy = vi.spyOn(ipcBridge.teamHub.compact, 'invoke');
      const switchSpy = vi.spyOn(ipcBridge.teamHub.switchModels, 'invoke');

      renderIsolated(<TwoLaneProfiler teamId='team-alpha' initialContextStatus={statusPayload} />);

      expect(screen.getByTestId('profiler-context-health')).toBeInTheDocument();

      // Verify all 3 levels (42% normal, 75% warning, 90% critical), wallet badges, and compaction counts
      expect(screen.getByTestId('profiler-slot-pct-slot-leader')).toHaveAttribute('data-context-level', 'normal');
      expect(screen.getByTestId('profiler-slot-wallet-slot-leader')).toHaveTextContent('$0 CLI');
      expect(screen.getByTestId('profiler-slot-compactions-slot-leader')).toHaveTextContent('Compacted ×1');

      expect(screen.getByTestId('profiler-slot-pct-slot-warn')).toHaveAttribute('data-context-level', 'warning');
      expect(screen.getByTestId('profiler-slot-pct-slot-crit')).toHaveAttribute('data-context-level', 'critical');
      expect(screen.getByTestId('profiler-slot-wallet-slot-crit')).toHaveTextContent('API');
      expect(screen.getByTestId('profiler-slot-compactions-slot-crit')).toHaveTextContent('Compacted ×2');

      // Per-slot quick Compact
      fireEvent.click(screen.getByTestId('profiler-slot-compact-slot-crit'));
      await waitFor(() => {
        expect(compactSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          slot_id: 'slot-crit',
          mode: 'auto',
        });
      });

      // Per-slot quick Switch Model
      fireEvent.click(screen.getByTestId('profiler-slot-switch-slot-crit'));
      await waitFor(() => {
        expect(screen.getByTestId('connected-model-option-claude-claude-sonnet-4-5')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('connected-model-option-claude-claude-sonnet-4-5'));

      await waitFor(() => {
        expect(switchSpy).toHaveBeenCalledWith({
          team_id: 'team-alpha',
          scope: 'slots',
          updates: [
            {
              slot_id: 'slot-crit',
              target: expect.objectContaining({
                backend: 'claude',
                model_id: 'claude-sonnet-4-5',
              }),
            },
          ],
          force_interrupt: false,
        });
      });
    });
  });

  describe('Vietnamese (vi-VN) Runtime Switch & Telex IME useCompositionInput Protection', () => {
    it('renders natural NFC Vietnamese labels and blocks premature Enter submission during Telex IME composition', async () => {
      const quickSpy = vi.spyOn(ipcBridge.teamHub.quickMember, 'invoke').mockResolvedValue({
        assistant_id: 'quick:vi-arch',
        assistant_name: 'Kiến trúc sư Hệ thống',
        backend: 'claude',
        model_id: 'claude-sonnet-4-5',
        wallet_type: 'cli_subscription',
      });

      await changeLanguage('vi-VN');

      renderIsolated(<TeamCreateModal visible={true} onClose={vi.fn()} onCreated={vi.fn()} />);

      const quickBtn = screen.getByTestId('team-create-quick-member-btn');
      expect(quickBtn.textContent).toBe('+ Tạo nhanh Member');
      expect(quickBtn.textContent).toBe(quickBtn.textContent?.normalize('NFC'));

      fireEvent.click(quickBtn);

      const nameInput = screen.getByTestId('quick-member-name-input') as HTMLInputElement;
      await waitFor(() => {
        expect(screen.getByTestId('quick-member-model-trigger')).toBeInTheDocument();
      });

      // 1. Begin Telex IME composition ("Kiến trúc sư Hệ thống")
      fireEvent.compositionStart(nameInput);
      fireEvent.change(nameInput, { target: { value: 'Kiến trúc sư Hệ thống' } });

      // Pressing Enter mid-composition MUST NOT trigger quickMember submission
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter', isComposing: true });
      expect(quickSpy).not.toHaveBeenCalled();

      // 2. End composition — pressing Enter within the 60ms post-composition guard MUST ALSO NOT submit
      const baseNow = 1_700_000_000_000;
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseNow);
      fireEvent.compositionEnd(nameInput);

      nowSpy.mockReturnValue(baseNow + 25); // 25ms < 60ms guard
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });
      expect(quickSpy).not.toHaveBeenCalled();

      // 3. After 60ms guard window passes, pressing Enter submits the full NFC Vietnamese name cleanly!
      nowSpy.mockReturnValue(baseNow + 120);
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(quickSpy).toHaveBeenCalledTimes(1);
        expect(quickSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Kiến trúc sư Hệ thống',
          })
        );
      });
    });
  });
});
