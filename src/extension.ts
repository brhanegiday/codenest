// src/extension.ts
import * as vscode from 'vscode';
import { StorageManager }    from './storageManager';
import { DecorationManager } from './decorationManager';
import { ThreadManager, ISearchIndex } from './threadManager';
import { computeFingerprint }  from './utils/fingerprint';
import { Thread } from './types';

// Minimal stub satisfying ISearchIndex until Step 6 wires the real one.
class StubSearchIndex implements ISearchIndex {
  rebuild(_threads: Thread[]): void {}
  upsert(_thread: Thread): void {}
  remove(_threadId: string): void {}
}

export function activate(context: vscode.ExtensionContext) {
  // ── 1. Resolve repo root ─────────────────────────────────────────
  const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repoRoot) {
    return;   // No workspace open — extension stays dormant
  }

  // ── 2. Instantiate modules ────────────────────────────────────────
  const storage     = new StorageManager(repoRoot);
  const decorations = new DecorationManager(context);
  const searchIndex = new StubSearchIndex();
  const threadMgr   = new ThreadManager(storage, searchIndex, decorations);

  context.subscriptions.push(decorations);

  // ── 3. Bootstrap — load threads and decorate open editors ─────────
  const store = storage.load();

  vscode.window.visibleTextEditors.forEach(editor =>
    decorations.refresh(editor, store.threads)
  );

  // ── 4. Refresh on every editor change ────────────────────────────
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        decorations.refresh(editor, storage.load().threads);
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      editors.forEach(editor =>
        decorations.refresh(editor, storage.load().threads)
      );
    }),
  );

  // ── 5. Register commands ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('codenest.createThread', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage(
          'CodeNest: Select some code first, then add a thread.'
        );
        return;
      }

      const doc       = editor.document;
      const sel       = editor.selection;
      const fileLines = doc.getText().split('\n');
      const lineStart = sel.start.line + 1;   // 1-indexed
      const lineEnd   = sel.end.line   + 1;

      const anchor = {
        file_path:     vscode.workspace.asRelativePath(doc.fileName),
        line_start:    lineStart,
        line_end:      lineEnd,
        fingerprint:   computeFingerprint(fileLines, lineStart, lineEnd),
        anchored_code: doc.getText(sel),
      };

      const thread = threadMgr.createThread(anchor, 'Test thread');

      vscode.window.showInformationMessage(
        `CodeNest: Thread created on line ${lineStart} (id: ${thread.id.slice(0, 8)}…)`
      );
    }),
  );
}

export function deactivate(): void {}
