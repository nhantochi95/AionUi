import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HybridKanbanBoard } from '@/renderer/pages/shared-room/components/kanban/HybridKanbanBoard';
import { RoundedPillComposer } from '@/renderer/pages/shared-room/components/RoundedPillComposer';
import type { ISharedRoomTask, ISharedRoomMember } from '@/common/types/sharedRoom';

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

const mockTasks: ISharedRoomTask[] = [
  {
    id: 'task-backlog-1',
    room_id: 'room-1',
    from_team_id: null,
    to_team_id: 'team-be',
    to_team_name: 'Backend Lead',
    title: 'Backlog Item: Database migration script',
    description: 'Prepare SQLite migration',
    status: 'backlog',
    blocked_by: [],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
  {
    id: 'task-todo-1',
    room_id: 'room-1',
    from_team_id: null,
    to_team_id: 'team-fe',
    to_team_name: 'Frontend Lead',
    title: 'Todo Item: Build Kanban UI',
    description: 'Implement 52px column collapse',
    status: 'todo',
    blocked_by: [],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
  {
    id: 'task-prog-1',
    room_id: 'room-1',
    from_team_id: null,
    to_team_id: 'team-be',
    to_team_name: 'Backend Lead',
    title: 'In Progress: Token refresh race',
    description: 'Ensure concurrent requests do not collide',
    status: 'in_progress',
    blocked_by: [],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
  {
    id: 'task-rev-1',
    room_id: 'room-1',
    from_team_id: 'team-be',
    from_team_name: 'Backend Lead',
    to_team_id: 'team-fe',
    to_team_name: 'Frontend Lead',
    title: 'In Review: Auth interceptor',
    description: 'Needs review before Done',
    status: 'in_review',
    blocked_by: ['task-prog-1', 'task-todo-1'],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
  {
    id: 'task-done-1',
    room_id: 'room-1',
    from_team_id: null,
    to_team_id: 'team-fe',
    to_team_name: 'Frontend Lead',
    title: 'Done: Initial project setup',
    description: 'Project initialized',
    status: 'completed',
    blocked_by: [],
    artifacts: [],
    created_at: 1000,
    updated_at: 2000,
  },
];

const mockMembers: ISharedRoomMember[] = [
  {
    team_id: 'team-be',
    team_name: 'Backend Lead',
    leader_name: 'BE Lead',
    is_host: true,
  },
  {
    team_id: 'team-fe',
    team_name: 'Frontend Lead',
    leader_name: 'FE Lead',
    is_host: false,
  },
  {
    team_id: 'team-qa',
    team_name: 'QA Specialist',
    leader_name: 'QA Lead',
    is_host: false,
  },
];

describe('Adversarial Challenge 1: Kanban Column Collapse & 52px Geometry', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('correctly sets smart default collapse states (backlog and done collapsed to 52px)', () => {
    render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={vi.fn()}
        roomId='test-room-1'
      />
    );

    // Backlog should be collapsed (52px)
    const collapsedBacklog = screen.getByTestId('kanban-col-collapsed-backlog');
    expect(collapsedBacklog).toBeInTheDocument();
    expect(collapsedBacklog).toHaveStyle({ width: '52px' });

    // Done should be collapsed (52px)
    const collapsedDone = screen.getByTestId('kanban-col-collapsed-done');
    expect(collapsedDone).toBeInTheDocument();
    expect(collapsedDone).toHaveStyle({ width: '52px' });

    // Middle columns should be expanded
    expect(screen.getByTestId('kanban-col-expanded-todo')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-expanded-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-col-expanded-in_review')).toBeInTheDocument();
  });

  it('stress test: collapsing all 5 columns results in exactly 5 52px strips without crash', () => {
    render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={vi.fn()}
        roomId='test-room-all'
      />
    );

    // Collapse todo, in_progress, in_review
    fireEvent.click(screen.getByTestId('kanban-col-expanded-todo').querySelector('div')!);
    fireEvent.click(screen.getByTestId('kanban-col-expanded-in_progress').querySelector('div')!);
    fireEvent.click(screen.getByTestId('kanban-col-expanded-in_review').querySelector('div')!);

    // Now all 5 columns must be collapsed
    const colKeys = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
    for (const key of colKeys) {
      const col = screen.getByTestId(`kanban-col-collapsed-${key}`);
      expect(col).toBeInTheDocument();
      expect(col).toHaveStyle({ width: '52px' });
      // Badge count should match tasks in that column (1 each in mockTasks)
      const badge = screen.getByTestId(`kanban-collapsed-badge-${key}`);
      expect(badge).toHaveTextContent('1');
    }

    // Expanding all 5 columns
    for (const key of colKeys) {
      const col = screen.getByTestId(`kanban-col-collapsed-${key}`);
      fireEvent.click(col);
      expect(screen.getByTestId(`kanban-col-expanded-${key}`)).toBeInTheDocument();
    }
  });

  it('clicking the header arrow button « toggles collapse without propagation interference', () => {
    render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={vi.fn()}
        roomId='test-room-arrow'
      />
    );

    const todoCol = screen.getByTestId('kanban-col-expanded-todo');
    const collapseBtn = todoCol.querySelector('button');
    expect(collapseBtn).toBeInTheDocument();

    fireEvent.click(collapseBtn!);
    expect(screen.getByTestId('kanban-col-collapsed-todo')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-col-expanded-todo')).not.toBeInTheDocument();
  });

  it('persists column collapse state in localStorage across renders', () => {
    const { unmount } = render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={vi.fn()}
        roomId='persisted-room'
      />
    );

    // Expand backlog
    fireEvent.click(screen.getByTestId('kanban-col-collapsed-backlog'));
    expect(screen.getByTestId('kanban-col-expanded-backlog')).toBeInTheDocument();

    // Verify localStorage has saved updated state
    const saved = localStorage.getItem('aionui:kanban:collapsed:persisted-room');
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.backlog).toBe(false);

    unmount();

    // Re-render: backlog should remain expanded from persisted state
    render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={vi.fn()}
        roomId='persisted-room'
      />
    );
    expect(screen.getByTestId('kanban-col-expanded-backlog')).toBeInTheDocument();
  });
});

describe('Adversarial Challenge 2: Human-Only Done Guard & Blocker Warning UI', () => {
  it('displays Human Only badge on Done column in both expanded and collapsed views, but not on other columns', () => {
    render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={vi.fn()}
        roomId='human-guard-room'
      />
    );

    // Done is collapsed initially: has 🛡️ shield icon
    const collapsedDone = screen.getByTestId('kanban-col-collapsed-done');
    expect(collapsedDone).toHaveTextContent('🛡️');

    // Other collapsed columns should NOT have the shield icon
    const collapsedBacklog = screen.getByTestId('kanban-col-collapsed-backlog');
    expect(collapsedBacklog).not.toHaveTextContent('🛡️');

    // Expand Done: verify Human Only badge appears
    fireEvent.click(collapsedDone);
    const expandedDone = screen.getByTestId('kanban-col-expanded-done');
    expect(expandedDone).toHaveTextContent('🛡️ Human Only');

    // Expanded Todo should NOT have Human Only badge
    const expandedTodo = screen.getByTestId('kanban-col-expanded-todo');
    expect(expandedTodo).not.toHaveTextContent('Human Only');
  });

  it('renders blocker warning with exact prerequisite count', () => {
    render(
      <HybridKanbanBoard
        tasks={mockTasks}
        onTaskStatusChange={vi.fn()}
        roomId='blocker-room'
      />
    );

    // task-rev-1 has blocked_by: ['task-prog-1', 'task-todo-1'] -> 2 blockers
    const taskCard = screen.getByTestId('kanban-card-task-rev-1');
    expect(taskCard).toBeInTheDocument();
    expect(taskCard).toHaveTextContent('Waiting for 2 prerequisite task(s)');
  });

  it('detects prop contract mismatch vulnerability when caller passes onStatusChange instead of onTaskStatusChange', () => {
    const handleStatusChange = vi.fn();

    // Simulating how shared-room/index.tsx line 1022 passes onStatusChange
    render(
      // @ts-expect-error Parent passes onStatusChange instead of onTaskStatusChange
      <HybridKanbanBoard
        tasks={mockTasks}
        onStatusChange={handleStatusChange}
        roomId='mismatch-room'
      />
    );

    // Board renders without crashing on initial mount, but onTaskStatusChange is undefined
    expect(screen.getByTestId('hybrid-kanban-board')).toBeInTheDocument();
  });
});

describe('Adversarial Challenge 3: RoundedPillComposer & IME Telex Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents Enter submission when isComposing is active', async () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-ime'
        roomName='ime-test'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByTestId('rounded-pill-input');
    fireEvent.change(input, { target: { value: 'Đang gõ tiếng Việt Telex' } });

    // Start composition
    fireEvent.compositionStart(input);

    // Press Enter during composition
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(handleSend).not.toHaveBeenCalled();

    // End composition
    fireEvent.compositionEnd(input);

    // Press Enter immediately (<60ms debounce)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(handleSend).not.toHaveBeenCalled();

    // Wait past 60ms debounce guard
    await new Promise((r) => setTimeout(r, 70));
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks Enter submission when nativeEvent has keyCode=229 (IME Telex confirmation key)', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-ime-229'
        roomName='ime-test'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByTestId('rounded-pill-input');
    fireEvent.change(input, { target: { value: 'Thử nghiệm phím 229' } });

    // Enter with keyCode 229 (standard IME in Chrome/Windows)
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, which: 229 });
    expect(handleSend).not.toHaveBeenCalled();
  });

  it('blocks Enter submission when nativeEvent.isComposing is true', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-ime-native'
        roomName='ime-test'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByTestId('rounded-pill-input');
    fireEvent.change(input, { target: { value: 'Telex composition' } });

    // Synthetic event simulating nativeEvent.isComposing = true
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'isComposing', { value: true });
    input.dispatchEvent(event);

    expect(handleSend).not.toHaveBeenCalled();
  });

  it('allows Shift+Enter for multiline newline without triggering send', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-shift-enter'
        roomName='multiline-test'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByTestId('rounded-pill-input');
    fireEvent.change(input, { target: { value: 'Line 1' } });

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(handleSend).not.toHaveBeenCalled();
  });

  it('clicking the circular send button sends the message and resets text and files', async () => {
    const handleSend = vi.fn().mockResolvedValue(undefined);
    render(
      <RoundedPillComposer
        roomId='room-send-btn'
        roomName='send-test'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const input = screen.getByTestId('rounded-pill-input');
    const sendBtn = screen.getByTestId('send-circle-btn');

    // Initially disabled
    expect(sendBtn).toBeDisabled();

    // Type text
    fireEvent.change(input, { target: { value: 'Thông điệp gửi bằng nút tròn' } });
    expect(sendBtn).not.toBeDisabled();

    // Click circular send button
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledTimes(1);
    });
    expect(handleSend).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Thông điệp gửi bằng nút tròn',
        wokenTargets: ['Backend Lead'],
        liveSteering: true,
      })
    );

    // Text should be cleared
    expect(input).toHaveValue('');
  });

  it('challenge wake chips: Chair-only default, Wake All, muting, and unmuting agent chips', () => {
    const handleSend = vi.fn();
    render(
      <RoundedPillComposer
        roomId='room-chips'
        roomName='chip-test'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    // Chair-only active initially (1/3)
    expect(screen.getByTestId('wake-chip-Backend Lead')).toBeInTheDocument();
    expect(screen.queryByTestId('wake-chip-Frontend Lead')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wake-chip-QA Specialist')).not.toBeInTheDocument();

    // Wake All activates all 3 chips
    fireEvent.click(screen.getByTestId('wake-all-btn'));
    expect(screen.getByTestId('wake-chip-Backend Lead')).toBeInTheDocument();
    expect(screen.getByTestId('wake-chip-Frontend Lead')).toBeInTheDocument();
    expect(screen.getByTestId('wake-chip-QA Specialist')).toBeInTheDocument();

    // Mute QA Specialist
    fireEvent.click(screen.getByTestId('mute-chip-QA Specialist'));
    expect(screen.queryByTestId('wake-chip-QA Specialist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+@QA Specialist' })).toBeInTheDocument();

    // Mute remaining 2 chips
    fireEvent.click(screen.getByTestId('mute-chip-Backend Lead'));
    fireEvent.click(screen.getByTestId('mute-chip-Frontend Lead'));

    // All muted -> fallback message visible
    expect(screen.getByText('General note (no agents woken)')).toBeInTheDocument();

    // Unmute QA Specialist by clicking +@QA Specialist
    fireEvent.click(screen.getByRole('button', { name: '+@QA Specialist' }));
    expect(screen.getByTestId('wake-chip-QA Specialist')).toBeInTheDocument();
    expect(screen.queryByText('General note (no agents woken)')).not.toBeInTheDocument();
  });

  it('challenge live steering toggle switches state and includes it in send payload', async () => {
    const handleSend = vi.fn().mockResolvedValue(undefined);
    render(
      <RoundedPillComposer
        roomId='room-steering'
        roomName='steering-test'
        members={mockMembers}
        onSendMessage={handleSend}
      />
    );

    const toggle = screen.getByTestId('live-steering-toggle');
    expect(toggle).toHaveTextContent('Live steering: Active');

    // Toggle off
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Live steering: Off');

    // Send message with steering off
    const input = screen.getByTestId('rounded-pill-input');
    fireEvent.change(input, { target: { value: 'Command with steering off' } });
    fireEvent.click(screen.getByTestId('send-circle-btn'));

    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Command with steering off',
          liveSteering: false,
        })
      );
    });
  });
});
