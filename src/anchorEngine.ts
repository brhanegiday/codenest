// src/anchorEngine.ts
import * as vscode from 'vscode';
import * as fs     from 'node:fs';
import * as path   from 'node:path';
import { Thread } from './types';
import { findAnchor, computeFingerprint } from './utils/fingerprint';
import { StorageManager } from './storageManager';

export class AnchorEngine {
  private storage:      StorageManager;
  private repoRoot:     string;
  private onReconciled: (threads: Thread[]) => void;

  constructor(
    storage:      StorageManager,
    repoRoot:     string,
    onReconciled: (threads: Thread[]) => void,
  ) {
    this.storage      = storage;
    this.repoRoot     = repoRoot;
    this.onReconciled = onReconciled;
  }

  // Call once from extension.ts activate()
  registerListeners(context: vscode.ExtensionContext): void {
    // On file save — reconcile anchors for that file
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        this.reconcileFile(doc.fileName);
      })
    );

    // On file delete — orphan all threads anchored to that file
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    context.subscriptions.push(
      watcher,
      watcher.onDidDelete(uri => this.handleDelete(uri.fsPath)),
    );
  }

  // ── core reconciliation ───────────────────────────────────────────
  async reconcileFile(absolutePath: string): Promise<void> {
    // path.relative() uses OS separators (backslash on Windows), but
    // anchor.file_path is stored with forward slashes via
    // vscode.workspace.asRelativePath(). Normalise here so they match.
    const relativePath = path.relative(this.repoRoot, absolutePath)
      .split(path.sep).join('/');
    const store        = this.storage.load();

    const fileThreads = store.threads.filter(
      t => t.anchor.file_path === relativePath && !t.deleted_at
    );
    if (fileThreads.length === 0) { return; }

    let fileLines: string[];
    try {
      fileLines = fs.readFileSync(absolutePath, 'utf-8').split('\n');
    } catch {
      // File unreadable — treat all threads as orphaned
      fileLines = [];
    }

    let changed = false;

    for (const thread of fileThreads) {
      const result = findAnchor(
        fileLines,
        thread.anchor.fingerprint,
        thread.anchor.anchored_code,
        thread.anchor.line_start,
        thread.anchor.line_end,
      );

      if (!result) {
        // No match anywhere — orphan the thread
        if (thread.status !== 'orphaned') {
          thread.status     = 'orphaned';
          thread.updated_at = new Date().toISOString();
          changed = true;
        }
        continue;
      }

      const { lineStart, lineEnd, confidence } = result;
      const linesMoved = lineStart !== thread.anchor.line_start
                      || lineEnd   !== thread.anchor.line_end;
      const isFuzzy    = confidence === 'fuzzy';

      if (linesMoved || isFuzzy) {
        thread.anchor.line_start = lineStart;
        thread.anchor.line_end   = lineEnd;

        if (!isFuzzy) {
          // Exact match at new position — refresh fingerprint to new location
          thread.anchor.fingerprint = computeFingerprint(fileLines, lineStart, lineEnd);
        } else {
          // Fuzzy match — update anchored_code to current content so next
          // save uses fresh text for comparison
          thread.anchor.anchored_code = fileLines
            .slice(lineStart - 1, lineEnd)
            .join('\n');
        }

        // Restore orphaned thread to open if we found it again
        if (thread.status === 'orphaned') {
          thread.status = 'open';
        }

        thread.updated_at = new Date().toISOString();
        changed = true;
      }
    }

    if (changed) {
      this.storage.save(store);
      this.onReconciled(store.threads);
    }
  }

  // ── file deleted ──────────────────────────────────────────────────
  private handleDelete(absolutePath: string): void {
    const relativePath = path.relative(this.repoRoot, absolutePath)
      .split(path.sep).join('/');
    const store        = this.storage.load();
    let changed        = false;

    for (const t of store.threads) {
      if (t.anchor.file_path === relativePath
          && !t.deleted_at
          && t.status !== 'orphaned') {
        t.status     = 'orphaned';
        t.updated_at = new Date().toISOString();
        changed      = true;
      }
    }

    if (changed) { this.storage.save(store); }
  }
}
