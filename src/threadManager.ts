// src/threadManager.ts
import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { Thread, Reply, ThreadAnchor, WebviewMessage } from './types';
import { StorageManager }    from './storageManager';
import { DecorationManager } from './decorationManager';

// Minimal stub interface so ThreadManager doesn't depend on SearchIndex
// being fully implemented yet. SearchIndex will satisfy this in Step 6.
export interface ISearchIndex {
  rebuild(threads: Thread[]): void;
  upsert(thread: Thread): void;
  remove(threadId: string): void;
}

export class ThreadManager {
  constructor(
    private storage:     StorageManager,
    private searchIndex: ISearchIndex,
    private decorations: DecorationManager,
  ) {}

  // ── create ────────────────────────────────────────────────────────
  createThread(anchor: ThreadAnchor, body: string): Thread {
    const now = new Date().toISOString();
    const thread: Thread = {
      id:         crypto.randomUUID(),
      type:       'private',
      status:     'open',
      anchor,
      replies: [{
        id:          crypto.randomUUID(),
        body,
        author_type: 'human',
        created_at:  now,
        edited_at:   null,
      }],
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    const store = this.storage.load();
    store.threads.push(thread);
    this.storage.save(store);
    this.searchIndex.upsert(thread);
    this.refreshDecorations(anchor.file_path);
    return thread;
  }

  // ── reply ─────────────────────────────────────────────────────────
  addReply(threadId: string, body: string): void {
    const store  = this.storage.load();
    const thread = store.threads.find(t => t.id === threadId);
    if (!thread) { return; }
    const reply: Reply = {
      id:          crypto.randomUUID(),
      body,
      author_type: 'human',
      created_at:  new Date().toISOString(),
      edited_at:   null,
    };
    thread.replies.push(reply);
    thread.updated_at = reply.created_at;
    this.storage.save(store);
    this.searchIndex.upsert(thread);
  }

  // ── resolve / reopen ──────────────────────────────────────────────
  toggleStatus(threadId: string): void {
    const store  = this.storage.load();
    const thread = store.threads.find(t => t.id === threadId);
    if (!thread) { return; }
    thread.status     = thread.status === 'open' ? 'resolved' : 'open';
    thread.updated_at = new Date().toISOString();
    this.storage.save(store);
    this.searchIndex.upsert(thread);
    this.refreshDecorations(thread.anchor.file_path);
  }

  // ── soft delete ───────────────────────────────────────────────────
  deleteThread(threadId: string): void {
    const store  = this.storage.load();
    const thread = store.threads.find(t => t.id === threadId);
    if (!thread) { return; }
    thread.deleted_at = new Date().toISOString();
    thread.updated_at = thread.deleted_at;
    this.storage.save(store);
    this.searchIndex.remove(threadId);
    this.refreshDecorations(thread.anchor.file_path);
  }

  // ── re-attach orphan ──────────────────────────────────────────────
  reattachThread(threadId: string, newAnchor: ThreadAnchor): void {
    const store  = this.storage.load();
    const thread = store.threads.find(t => t.id === threadId);
    if (!thread) { return; }
    thread.anchor     = newAnchor;
    thread.status     = 'open';
    thread.updated_at = new Date().toISOString();
    this.storage.save(store);
    this.searchIndex.upsert(thread);
    this.refreshDecorations(newAnchor.file_path);
  }

  // ── handle messages from any Webview ─────────────────────────────
  handleWebviewMessage(msg: WebviewMessage): void {
    switch (msg.type) {
      case 'createThread':   this.createThread(msg.anchor, msg.body);           break;
      case 'addReply':       this.addReply(msg.threadId, msg.body);             break;
      case 'resolveThread':  this.toggleStatus(msg.threadId);                   break;
      case 'deleteThread':   this.deleteThread(msg.threadId);                   break;
      case 'reattachThread': this.reattachThread(msg.threadId, msg.newAnchor);  break;
      case 'searchQuery':    /* handled by SearchIndex directly */               break;
    }
  }

  // ── helpers ───────────────────────────────────────────────────────
  private refreshDecorations(filePath: string): void {
    const store = this.storage.load();
    vscode.window.visibleTextEditors.forEach(editor => {
      const rel = vscode.workspace.asRelativePath(editor.document.fileName);
      if (rel === filePath) {
        this.decorations.refresh(editor, store.threads);
      }
    });
  }
}
