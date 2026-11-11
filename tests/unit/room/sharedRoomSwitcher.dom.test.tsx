import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import SharedRoomPage from '@/renderer/pages/shared-room';
import { ipcBridge } from '@/common';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'room-1' }),
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
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, any>, params?: Record<string, any>) => {
      let str = typeof defaultValue === 'string' ? defaultValue : key;
      const values = typeof defaultValue === 'object' ? defaultValue : params;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
      }
      return str;
    },
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@renderer/components/media/Diff2Html', () => ({
  default: () => <div data-testid='mock-diff2html'>Diff Content</div>,
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

const mockRoom = {
  id: 'room-1',
  name: 'auth-fix',
  description: 'Authentication Fix Multi-Leader Room',
  created_at: 1000,
  updated_at: 2000,
  hop_count_since_human: 1,
  max_hops: 5,
  is_active_dm_target: false,
  telegram_chat_id: null,
  telegram_thread_id: null,
  artifacts_dir: '/tmp/artifacts',
  rules: 'Keep tokens secure',
  members: [
    {
      team_id: 'team-be',
      team_name: 'Backend Lead',
      leader_name: 'BE Lead',
      is_host: true,
      pending_handoff_msg_id: null,
    },
    {
      team_id: 'team-fe',
      team_name: 'Frontend Lead',
      leader_name: 'FE Lead',
      is_host: false,
      pending_handoff_msg_id: null,
    },
  ],
};

const mockTasks = [
  {
    id: 'task-1',
    room_id: 'room-1',
    from_team_id: null,
    to_team_id: 'team-be',
    to_team_name: 'Backend Lead',
    title: 'Refresh token rotation',
    description: 'Implement rotation logic',
    status: 'in_progress',
    blocked_by: [],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
];

describe('F17: Segmented 3-Tab Room Switcher (Chat | Kanban | Cost & Profiler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ipcBridge.sharedRoom.get, 'invoke').mockResolvedValue(mockRoom as any);
    vi.spyOn(ipcBridge.sharedRoom.listMessages, 'invoke').mockResolvedValue([]);
    vi.spyOn(ipcBridge.sharedRoom.listTasks, 'invoke').mockResolvedValue(mockTasks as any);
    vi.spyOn(ipcBridge.sharedRoom.updated, 'on').mockReturnValue(() => {});
    vi.spyOn(ipcBridge.sharedRoom.removed, 'on').mockReturnValue(() => {});
    vi.spyOn(ipcBridge.sharedRoom.messageCreated, 'on').mockReturnValue(() => {});
    vi.spyOn(ipcBridge.sharedRoom.taskChanged, 'on').mockReturnValue(() => {});
  });

  it('renders telemetry worktree badge and segmented 3-tab view switcher', async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SharedRoomPage />
      </SWRConfig>
    );

    await waitFor(() => {
      expect(screen.getByText('#auth-fix')).toBeInTheDocument();
    });

    // Telemetry worktree chip
    const wtChip = screen.getByTestId('room-header-worktree-chip');
    expect(wtChip).toBeInTheDocument();
    expect(wtChip).toHaveTextContent('🌿 wt/auth-fix');

    // 3 View Tabs
    expect(screen.getByTestId('room-view-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('room-tab-chat')).toBeInTheDocument();
    expect(screen.getByTestId('room-tab-kanban')).toBeInTheDocument();
    expect(screen.getByTestId('room-tab-cost')).toBeInTheDocument();
  });

  it('switches between Chat, Kanban, and Cost views smoothly', async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SharedRoomPage />
      </SWRConfig>
    );

    await waitFor(() => {
      expect(screen.getByTestId('room-view-switcher')).toBeInTheDocument();
    });

    // Default is Chat view: Rounded Pill Composer visible
    expect(screen.getByTestId('rounded-pill-composer')).toBeInTheDocument();

    // Switch to Kanban view
    fireEvent.click(screen.getByTestId('room-tab-kanban'));
    await waitFor(() => {
      expect(screen.getByTestId('hybrid-kanban-board')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rounded-pill-composer')).not.toBeInTheDocument();

    // Switch to Cost & Profiler view
    fireEvent.click(screen.getByTestId('room-tab-cost'));
    await waitFor(() => {
      expect(screen.getByTestId('two-lane-profiler')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('hybrid-kanban-board')).not.toBeInTheDocument();

    // Switch back to Chat view
    fireEvent.click(screen.getByTestId('room-tab-chat'));
    await waitFor(() => {
      expect(screen.getByTestId('rounded-pill-composer')).toBeInTheDocument();
    });
  });

  it('renders rich Markdown in leader messages and forwards muted wake_targets + live_steering', async () => {
    vi.spyOn(ipcBridge.sharedRoom.listMessages, 'invoke').mockResolvedValue([
      {
        id: 'msg-leader-1',
        room_id: 'room-1',
        sender_type: 'leader',
        sender_team_id: 'team-be',
        sender_label: 'Backend Lead · BE Lead 👑',
        content: '### Token Rotation Plan\n\n- **Refresh** endpoint verified',
        attachments: [],
        target_team_ids: [],
        hop_index: 1,
        created_at: 1500,
      },
    ] as any);
    const sendSpy = vi.spyOn(ipcBridge.sharedRoom.sendMessage, 'invoke').mockResolvedValue({
      message: {
        id: 'msg-user-2',
        room_id: 'room-1',
        sender_type: 'user',
        sender_label: 'You',
        content: 'Looks good',
        attachments: [],
        target_team_ids: [],
        hop_index: 0,
        created_at: 2000,
      },
      routed_targets: [],
    } as any);

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SharedRoomPage />
      </SWRConfig>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Token Rotation Plan' })).toBeInTheDocument();
    });
    expect(screen.getByText('Refresh').tagName.toLowerCase()).toBe('strong');

    // Enable Frontend Lead and mute Backend Lead chip so only Frontend Lead remains in wake_targets
    fireEvent.click(screen.getByRole('button', { name: '+@Frontend Lead' }));
    fireEvent.click(screen.getByTestId('mute-chip-Backend Lead'));
    fireEvent.change(screen.getByTestId('rounded-pill-input'), {
      target: { value: 'Only wake frontend' },
    });
    fireEvent.click(screen.getByTestId('send-circle-btn'));

    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'room-1',
          content: 'Only wake frontend',
          wake_targets: ['Frontend Lead'],
          live_steering: true,
        })
      );
    });
  });
});
