// src/extension.ts
import * as vscode from 'vscode';
import { StorageManager }      from './storageManager';
import { DecorationManager }   from './decorationManager';
import { ThreadManager }       from './threadManager';
import { SearchIndex }         from './searchIndex';
import { AnchorEngine }        from './anchorEngine';
import { ThreadPanelProvider } from './webviews/threadPanel';
import { computeFingerprint }  from './utils/fingerprint';

export function activate(context: vscode.ExtensionContext) {
  // ── 1. Resolve repo root ─────────────────────────────────────────
  const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repoRoot) {
    return;   // No workspace open — extension stays dormant
  }

  // ── 2. Instantiate modules ────────────────────────────────────────
  const storage     = new StorageManager(repoRoot);
  const decorations = new DecorationManager(context);
  const searchIndex = new SearchIndex();
  const threadMgr   = new ThreadManager(storage, searchIndex, decorations);

  context.subscriptions.push(decorations);

  // ── 3. Bootstrap — load threads, populate index, decorate editors ──
  const store = storage.load();
  searchIndex.rebuild(store.threads);

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

  // ── 5. Anchor Engine ──────────────────────────────────────────────
  const anchorEngine = new AnchorEngine(
    storage,
    repoRoot,
    updatedThreads => {
      searchIndex.rebuild(updatedThreads);
      vscode.window.visibleTextEditors.forEach(editor =>
        decorations.refresh(editor, updatedThreads)
      );
    },
  );
  anchorEngine.registerListeners(context);

  // ── 6. Commands ───────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('codenest.createThread', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage(
          'CodeNest: Open a file first.'
        );
        return;
      }

      const doc       = editor.document;
      const sel       = editor.selection;
      const fileLines = doc.getText().split('\n');
      const filePath  = vscode.workspace.asRelativePath(doc.fileName);

      // Use current line when nothing is selected
      const lineStart = sel.start.line + 1;   // 1-indexed
      const lineEnd   = sel.isEmpty
        ? lineStart
        : sel.end.line + 1;

      // If a thread is already anchored to this line, open it for viewing
      const currentStore = storage.load();
      const existing = currentStore.threads.find(
        t => t.anchor.file_path === filePath
          && t.anchor.line_start <= lineStart
          && t.anchor.line_end   >= lineStart
          && !t.deleted_at,
      );

      const anchor = {
        file_path:     filePath,
        line_start:    lineStart,
        line_end:      lineEnd,
        fingerprint:   computeFingerprint(fileLines, lineStart, lineEnd),
        anchored_code: sel.isEmpty ? '' : doc.getText(sel),
      };

      if (existing) {
        ThreadPanelProvider.open(context, existing.anchor, threadMgr, existing);
      } else {
        if (sel.isEmpty) {
          vscode.window.showInformationMessage(
            'CodeNest: Select some code first, then press Ctrl+Shift+N to add a thread.'
          );
          return;
        }
        ThreadPanelProvider.open(context, anchor, threadMgr);
      }
    }),
  );
}

export function deactivate(): void {}
