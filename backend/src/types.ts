export interface ChildRow {
  id: number;
  name: string;
  image: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface BlockRow {
  id: number;
  name: string;
  deadline_time: string;
  color: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: number;
  name: string;
  emoji: string;
  created_at: string;
  updated_at: string;
}

export interface AssignmentRow {
  id: number;
  block_id: number;
  child_id: number;
  task_id: number;
  display_order: number;
  created_at: string;
}

export interface AssignmentJoined extends AssignmentRow {
  block_name: string;
  child_name: string;
  task_name: string;
  task_emoji: string;
}
