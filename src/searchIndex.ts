// src/searchIndex.ts
import { Thread, ThreadStatus } from './types';
import { ISearchIndex } from './threadManager';

interface IndexEntry {
  thread:     Thread;
  searchText: string;  // pre-computed lowercase blob
}

function toSearchText(t: Thread): string {
  return [
    t.replies.map(r => r.body).join(' '),
    t.anchor.anchored_code,
    t.anchor.file_path,
  ].join(' ').toLowerCase();
}

const byUpdated = (a: Thread, b: Thread) =>
  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

export class SearchIndex implements ISearchIndex {
  private entries: IndexEntry[] = [];

  // Rebuild entire index — call on load and after any thread mutation
  // that may affect multiple threads (e.g. after anchor reconciliation).
  rebuild(threads: Thread[]): void {
    this.entries = threads
      .filter(t => !t.deleted_at)
      .map(t => ({ thread: t, searchText: toSearchText(t) }));
  }

  // Update a single thread — avoids full rebuild on every mutation.
  upsert(thread: Thread): void {
    if (thread.deleted_at) {
      this.remove(thread.id);
      return;
    }
    const entry: IndexEntry = { thread, searchText: toSearchText(thread) };
    const idx = this.entries.findIndex(e => e.thread.id === thread.id);
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
  }

  remove(threadId: string): void {
    this.entries = this.entries.filter(e => e.thread.id !== threadId);
  }

  // Returns threads matching ALL query tokens (AND logic),
  // optionally filtered by status, sorted by updated_at descending.
  query(raw: string, status?: ThreadStatus): Thread[] {
    const tokens = raw.toLowerCase().trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      return this.entries
        .filter(e => !status || e.thread.status === status)
        .map(e => e.thread)
        .sort(byUpdated);
    }

    return this.entries
      .filter(e => {
        if (status && e.thread.status !== status) { return false; }
        return tokens.every(tok => e.searchText.includes(tok));
      })
      .map(e => e.thread)
      .sort(byUpdated);
  }
}
