/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpConfigOptionDto } from '@/common/types/platform/acpTypes';
import { useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import AcpChat from '@/renderer/pages/conversation/platforms/acp/AcpChat';
import { TeamPermissionProvider, useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { resetEnsureConversationRuntimeStateForTests } from '@/renderer/pages/conversation/utils/ensureConversationRuntime';

const {
  getConfigOptionsInvokeMock,
  setConfigOptionInvokeMock,
  ensureSessionInvokeMock,
  setSessionModeInvokeMock,
  getUsageInvokeMock,
  getSlashCommandsInvokeMock,
  ensureRuntimeInvokeMock,
  getPendingConfirmationsInvokeMock,
} = vi.hoisted(() => {
  const makeNoopChannel = () => ({
    on: vi.fn(() => vi.fn()),
  });
  return {
    getConfigOptionsInvokeMock: vi.fn(),
    setConfigOptionInvokeMock: vi.fn(),
    ensureSessionInvokeMock: vi.fn(async () => undefined),
    setSessionModeInvokeMock: vi.fn(async () => undefined),
    getUsageInvokeMock: vi.fn(async () => ({ input_tokens: 120, output_tokens: 45 })),
    getSlashCommandsInvokeMock: vi.fn(async () => ({ success: true, data: { commands: [] } })),
    ensureRuntimeInvokeMock: vi.fn(),
    getPendingConfirmationsInvokeMock: vi.fn(async () => []),
    makeNoopChannel,
  };
});

vi.mock('@/common', () => {
  const makeChannel = () => ({ on: vi.fn(() => vi.fn()) });
  return {
    ipcBridge: {
      team: {
        getConfigOptions: { invoke: getConfigOptionsInvokeMock },
        setConfigOption: { invoke: setConfigOptionInvokeMock },
        ensureSession: { invoke: ensureSessionInvokeMock },
        setSessionMode: { invoke: setSessionModeInvokeMock },
      },
      conversation: {
        ensureRuntime: { invoke: ensureRuntimeInvokeMock },
        getUsage: { invoke: getUsageInvokeMock },
        getSlashCommands: { invoke: getSlashCommandsInvokeMock },
        confirmation: {
          list: { invoke: getPendingConfirmationsInvokeMock },
          add: makeChannel(),
          update: makeChannel(),
          remove: makeChannel(),
        },
      },
      acpConversation: {
        setConfigOption: { invoke: vi.fn() },
        responseStream: makeChannel(),
      },
    },
  };
});

vi.mock('@renderer/pages/conversation/Messages/hooks', () => ({
  MessageListProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessageListLoadingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessagePaginationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
  useUpdateMessageList: () => vi.fn(),
  useAddOrUpdateMessage: () => vi.fn(),
  useMergeLiveMessage: () => vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(async () => null),
}));

vi.mock('@renderer/pages/conversation/Messages/MessageList', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-message-list' />,
}));

vi.mock('@renderer/pages/conversation/Messages/artifacts', () => ({
  ConversationArtifactProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery', () => ({
  usePendingConfirmationsRecovery: vi.fn(),
}));

vi.mock('@renderer/pages/conversation/PlanBar/usePlanRecovery', () => ({
  usePlanRecovery: vi.fn(),
}));

vi.mock('@renderer/pages/conversation/PlanBar/ConversationPlanBar', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpE2EStreamInjector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpSendBox', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-acp-sendbox' />,
}));

const buildSeededOptions = (modelValue = 'claude-sonnet-4'): AcpConfigOptionDto[] => [
  {
    id: 'model',
    category: 'model',
    option_type: 'select',
    current_value: modelValue,
    options: [
      { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
      { value: 'claude-opus-4', label: 'Claude Opus 4' },
    ],
  },
  {
    id: 'mode',
    category: 'mode',
    option_type: 'select',
    current_value: 'default',
    options: [
      { value: 'default', label: 'Default' },
      { value: 'auto_edit', label: 'Auto Edit' },
    ],
  },
];

const capturedLoadFns: Array<unknown> = [];

const SlotConfigProbe: React.FC<{ slotLabel: string; conversationId: string }> = ({ slotLabel, conversationId }) => {
  const teamPermission = useTeamPermission();
  if (teamPermission?.configOptionsPort.load) {
    capturedLoadFns.push(teamPermission.configOptionsPort.load);
  }

  // Mirror AcpSendBox's `[teamPermission]` callback dependency to ensure context value updates
  // never re-trigger `useAcpConfigOptions` network reloads.
  const prepareRuntime = useCallback(async () => {
    await teamPermission?.warmupSession();
  }, [teamPermission]);

  const { configOptions, isConfigOptionBlocked } = useAcpConfigOptions({
    conversation_id: conversationId,
    configOptionsPort: teamPermission?.configOptionsPort,
    prepareRuntime,
  });

  const { canSwitch } = useAcpModelInfo({
    conversation_id: conversationId,
    configOptionsPort: teamPermission?.configOptionsPort,
    prepareRuntime,
  });

  return (
    <div
      data-testid={`probe-${slotLabel}`}
      data-loaded-count={String(configOptions?.length ?? 0)}
      data-can-switch-model={String(canSwitch)}
      data-mode-blocked={String(isConfigOptionBlocked('mode'))}
      data-model-blocked={String(isConfigOptionBlocked('model'))}
    />
  );
};

describe('TeamPermissionProvider config-options transport stability & parallel AcpChat warmup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedLoadFns.length = 0;
    resetEnsureConversationRuntimeStateForTests();
    getConfigOptionsInvokeMock.mockImplementation(async ({ conversation_id }: { conversation_id: string }) => ({
      config_options: buildSeededOptions(conversation_id === 'leader-conv' ? 'claude-opus-4' : 'claude-sonnet-4'),
    }));
    getUsageInvokeMock.mockResolvedValue({ input_tokens: 120, output_tokens: 45 });
    getSlashCommandsInvokeMock.mockResolvedValue({ success: true, data: { commands: [] } });
    ensureSessionInvokeMock.mockResolvedValue(undefined);
  });

  it('keeps dormant pickers unlocked, reactively locks/unlocks runtime_starting, and triggers 0 extra getConfigOptions calls', async () => {
    const cache = new Map();
    const allConversationIds = ['leader-conv', 'member-dormant-conv', 'member-starting-conv'];

    const renderTeamTree = (runtimeStartingIds: ReadonlySet<string>) => (
      <SWRConfig
        value={{
          provider: () => cache,
          dedupingInterval: 0,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        }}
      >
        <TeamPermissionProvider
          team_id='team-1'
          isLeaderAgent={true}
          leaderConversationId='leader-conv'
          allConversationIds={allConversationIds}
          runtimeStartingConversationIds={runtimeStartingIds}
        >
          <SlotConfigProbe slotLabel='leader' conversationId='leader-conv' />
          <SlotConfigProbe slotLabel='dormant' conversationId='member-dormant-conv' />
          <SlotConfigProbe slotLabel='starting' conversationId='member-starting-conv' />
        </TeamPermissionProvider>
      </SWRConfig>
    );

    const { rerender } = render(renderTeamTree(new Set()));

    await waitFor(() => {
      expect(screen.getByTestId('probe-leader').getAttribute('data-loaded-count')).toBe('2');
      expect(screen.getByTestId('probe-dormant').getAttribute('data-loaded-count')).toBe('2');
      expect(screen.getByTestId('probe-starting').getAttribute('data-loaded-count')).toBe('2');
    });

    // Initial load: exactly 1 call per unique conversation_id (3 total), and dormant conversations stay unlocked!
    expect(getConfigOptionsInvokeMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('probe-dormant').getAttribute('data-can-switch-model')).toBe('true');
    expect(screen.getByTestId('probe-dormant').getAttribute('data-mode-blocked')).toBe('false');
    expect(screen.getByTestId('probe-starting').getAttribute('data-can-switch-model')).toBe('true');

    const initialLoadRef = capturedLoadFns[0];
    expect(initialLoadRef).toBeTypeOf('function');

    // Transition 1: member-starting-conv enters `runtime_starting`
    await act(async () => {
      rerender(renderTeamTree(new Set(['member-starting-conv'])));
    });

    // Reactive lock: starting member locks both model & mode; leader locks mode propagation; dormant member stays unlocked!
    expect(screen.getByTestId('probe-starting').getAttribute('data-can-switch-model')).toBe('false');
    expect(screen.getByTestId('probe-starting').getAttribute('data-model-blocked')).toBe('true');
    expect(screen.getByTestId('probe-starting').getAttribute('data-mode-blocked')).toBe('true');
    expect(screen.getByTestId('probe-leader').getAttribute('data-mode-blocked')).toBe('true');
    expect(screen.getByTestId('probe-leader').getAttribute('data-can-switch-model')).toBe('true');
    expect(screen.getByTestId('probe-dormant').getAttribute('data-can-switch-model')).toBe('true');
    expect(screen.getByTestId('probe-dormant').getAttribute('data-mode-blocked')).toBe('false');

    // Transport `load` identity never changed and ZERO extra `getConfigOptions` IPC calls were fired!
    for (const loadFn of capturedLoadFns) {
      expect(loadFn).toBe(initialLoadRef);
    }
    expect(getConfigOptionsInvokeMock).toHaveBeenCalledTimes(3);

    // Transition 2: member-starting-conv finishes starting (`runtime_starting` clears)
    await act(async () => {
      rerender(renderTeamTree(new Set()));
    });

    expect(screen.getByTestId('probe-starting').getAttribute('data-can-switch-model')).toBe('true');
    expect(screen.getByTestId('probe-starting').getAttribute('data-model-blocked')).toBe('false');
    expect(screen.getByTestId('probe-starting').getAttribute('data-mode-blocked')).toBe('false');
    expect(screen.getByTestId('probe-leader').getAttribute('data-mode-blocked')).toBe('false');
    expect(getConfigOptionsInvokeMock).toHaveBeenCalledTimes(3);
  });

  it('hydrates cold getUsage on all parallel team columns while skipping slash-commands & warmup on dormant members', async () => {
    const cache = new Map();

    render(
      <SWRConfig
        value={{
          provider: () => cache,
          dedupingInterval: 0,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        }}
      >
        <TeamPermissionProvider
          team_id='team-parallel'
          // Even when the active tab is the leader (`isLeaderAgent={true}`), parallel view renders member columns too!
          isLeaderAgent={true}
          leaderConversationId='leader-conv'
          allConversationIds={['leader-conv', 'member-1-conv', 'member-2-conv']}
          runtimeStartingConversationIds={new Set()}
        >
          <AcpChat conversation_id='leader-conv' backend='claude' />
          <AcpChat conversation_id='member-1-conv' backend='codex' />
          <AcpChat conversation_id='member-2-conv' backend='gemini' />
        </TeamPermissionProvider>
      </SWRConfig>
    );

    await waitFor(() => {
      expect(getUsageInvokeMock).toHaveBeenCalledWith({ conversation_id: 'leader-conv' });
      expect(getUsageInvokeMock).toHaveBeenCalledWith({ conversation_id: 'member-1-conv' });
      expect(getUsageInvokeMock).toHaveBeenCalledWith({ conversation_id: 'member-2-conv' });
      expect(getSlashCommandsInvokeMock).toHaveBeenCalledWith({ conversation_id: 'leader-conv' });
    });

    // Leader warmed and fetched slash commands; dormant members NEVER called getSlashCommands!
    expect(ensureSessionInvokeMock).toHaveBeenCalledTimes(1);
    expect(getSlashCommandsInvokeMock).toHaveBeenCalledTimes(1);
    expect(getSlashCommandsInvokeMock).not.toHaveBeenCalledWith({ conversation_id: 'member-1-conv' });
    expect(getSlashCommandsInvokeMock).not.toHaveBeenCalledWith({ conversation_id: 'member-2-conv' });
  });
});
