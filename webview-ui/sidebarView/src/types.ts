// Mirror of src/types/index.ts — keep in sync manually.
export type ThreadStatus = 'open' | 'resolved' | 'orphaned';

export interface ThreadAnchor {
  file_path:     string;
  line_start:    number;
  line_end:      number;
  fingerprint:   string;
  anchored_code: string;
}

export interface Reply {
  id:          string;
  body:        string;
  author_type: 'human' | 'ai';
  created_at:  string;
  edited_at:   string | null;
}

export interface Thread {
  id:         string;
  type:       'private' | 'shared';
  status:     ThreadStatus;
  anchor:     ThreadAnchor;
  replies:    Reply[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}
