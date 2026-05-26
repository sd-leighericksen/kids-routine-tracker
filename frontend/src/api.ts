export interface Child {
  id: number;
  name: string;
  image: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Block {
  id: number;
  name: string;
  start_time: string;
  deadline_time: string;
  color: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  name: string;
  emoji: string;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: number;
  block_id: number;
  child_id: number;
  task_id: number;
  display_order: number;
  created_at: string;
  block_name: string;
  child_name: string;
  task_name: string;
  task_emoji: string;
}

export type BlockState = 'active' | 'locked-complete' | 'locked-missed';

export interface GridCellLog {
  id: number;
  child_id: number;
  task_id: number;
  completed: boolean;
  completed_at: string | null;
}

export interface GridBlock {
  id: number;
  name: string;
  start_time: string;
  deadline_time: string;
  state: BlockState;
  children: { id: number; name: string; image: string | null }[];
  tasks: { id: number; name: string; emoji: string }[];
  logs: GridCellLog[];
}

export interface Today {
  date: string;
  blocks: GridBlock[];
}

export interface PerChildReport {
  child: { id: number; name: string; image: string | null };
  streak_days: number;
  week: { completed: number; total: number; rate: number | null };
  month: { completed: number; total: number; rate: number | null };
}

export interface HouseholdDayBlockChild {
  child_id: number;
  child_name: string;
  child_image: string | null;
  done: number;
  total: number;
}

export interface HouseholdDayBlock {
  block_id: number;
  block_name: string;
  deadline_time: string;
  outcome: string | null;
  children: HouseholdDayBlockChild[];
}

export interface HouseholdDay {
  date: string;
  blocks: HouseholdDayBlock[];
}

const PIN_KEY = 'parent_pin';

export function getStoredPin(): string | null {
  return sessionStorage.getItem(PIN_KEY);
}

export function setStoredPin(pin: string): void {
  sessionStorage.setItem(PIN_KEY, pin);
}

export function clearStoredPin(): void {
  sessionStorage.removeItem(PIN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const pin = getStoredPin();
  if (pin) headers.set('X-Parent-Pin', pin);
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (
    init.body !== undefined &&
    !isFormData &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: string }).error ?? '';
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  verifyPin: async (pin: string): Promise<boolean> => {
    const res = await fetch('/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return res.ok;
  },
  changePin: (currentPin: string, newPin: string) =>
    request<{ ok: true }>('/api/settings/pin', {
      method: 'PATCH',
      body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
    }),

  listChildren: () => request<Child[]>('/api/children'),
  createChild: (input: { name: string; image?: string | null }) =>
    request<Child>('/api/children', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateChild: (
    id: number,
    patch: Partial<{ name: string; image: string | null; display_order: number }>,
  ) =>
    request<Child>(`/api/children/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteChild: (id: number) =>
    request<void>(`/api/children/${id}`, { method: 'DELETE' }),

  listBlocks: () => request<Block[]>('/api/blocks'),
  createBlock: (input: {
    name: string;
    start_time: string;
    deadline_time: string;
    color?: string | null;
  }) =>
    request<Block>('/api/blocks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateBlock: (
    id: number,
    patch: Partial<{
      name: string;
      start_time: string;
      deadline_time: string;
      color: string | null;
      display_order: number;
    }>,
  ) =>
    request<Block>(`/api/blocks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteBlock: (id: number) =>
    request<void>(`/api/blocks/${id}`, { method: 'DELETE' }),

  listTasks: () => request<Task[]>('/api/tasks'),
  createTask: (input: { name: string; emoji: string }) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTask: (id: number, patch: Partial<{ name: string; emoji: string }>) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTask: (id: number) =>
    request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  listAssignments: () => request<Assignment[]>('/api/assignments'),
  createAssignment: (input: {
    block_id: number;
    child_id: number;
    task_id: number;
  }) =>
    request<Assignment>('/api/assignments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteAssignment: (id: number) =>
    request<void>(`/api/assignments/${id}`, { method: 'DELETE' }),

  getToday: (date?: string) =>
    request<Today>(`/api/today${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  resetToday: () =>
    request<{ ok: true; date: string }>('/api/today/reset', { method: 'POST' }),
  patchLog: (id: number, completed: boolean) =>
    request<GridCellLog>(`/api/logs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    }),
  getCelebrationGifs: () =>
    request<{ urls: string[] }>('/api/giphy/celebration'),
  getReportPerChild: () => request<PerChildReport[]>('/api/reports/per-child'),
  getReportHousehold: (days = 30) =>
    request<HouseholdDay[]>(`/api/reports/household?days=${days}`),

  uploadImage: async (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string }>('/api/uploads', {
      method: 'POST',
      body: form,
    });
  },
};
