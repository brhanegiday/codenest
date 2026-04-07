// src/types/index.ts

export type ThreadStatus = 'open' | 'resolved' | 'orphaned';
export type ThreadType   = 'private' | 'shared';   // 'shared' activates in v0.3
export type AuthorType   = 'human' | 'ai';         // 'ai' activates in v0.2

export interface ThreadAnchor {
  file_path:     string;   // relative to repo root, e.g. 'src/auth/AuthService.ts'
  line_start:    number;   // 1-indexed
  line_end:      number;   // 1-indexed, same as line_start for single line
  fingerprint:   string;   // SHA-1 hash of surrounding lines at creation
  anchored_code: string;   // verbatim copy of selected code at creation
}

export interface Reply {
  id:          string;         // UUID v4
  body:        string;         // plain text or Markdown
  author_type: AuthorType;
  created_at:  string;         // ISO 8601
  edited_at:   string | null;
}

export interface Thread {
  id:         string;          // UUID v4
  type:       ThreadType;
  status:     ThreadStatus;
  anchor:     ThreadAnchor;
  replies:    Reply[];         // index 0 = original note
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601
  deleted_at: string | null;   // null = active; set on soft delete
}

export interface ThreadStore {
  schema_version: number;      // start at 1; increment on breaking change
  repo_id:        string;      // SHA-256 of absolute repo root path
  threads:        Thread[];
}

// Messages passed between Extension Host <-> Webview
export type HostMessage =
  | { type: 'openThreadPanel'; anchor: ThreadAnchor; existingThread?: Thread }
  | { type: 'threadSaved';     thread: Thread }
  | { type: 'searchResults';   results: Thread[] }
  | { type: 'allThreads';      threads: Thread[] };

export type WebviewMessage =
  | { type: 'createThread'; anchor: ThreadAnchor; body: string }
  | { type: 'addReply';     threadId: string; body: string }
  | { type: 'editReply';    threadId: string; replyId: string; body: string }
  | { type: 'resolveThread'; threadId: string }
  | { type: 'deleteThread'; threadId: string }
  | { type: 'searchQuery';  query: string; status?: ThreadStatus }
  | { type: 'reattachThread'; threadId: string; newAnchor: ThreadAnchor };
