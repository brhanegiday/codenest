// src/extension.ts
import * as vscode from 'vscode';
import * as path   from 'node:path';
import { StorageManager }        from './storageManager';
import { DecorationManager }     from './decorationManager';
import { ThreadManager }         from './threadManager';
import { SearchIndex }           from './searchIndex';
import { AnchorEngine }          from './anchorEngine';
import { ThreadPanelProvider }   from './webviews/threadPanel';
import { SidebarViewProvider }   from './webviews/sidebarView';
import { SearchPanelProvider }   from './webviews/searchPanel';
import { computeFingerprint }    from './utils/fingerprint';
import { Thread } from './types';

/** Open a file and reveal a specific 1-indexed line in the editor. */
async function navigateToThread(thread: Thread, repoRoot: string): Promise<void> {
  const absPath = path.join(repoRoot, thread.anchor.file_path);
  try {
    const doc    = await vscode.workspace.openTextDocument(absPath);
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    const line   = thread.anchor.line_start - 1;  // 0-indexed
    const range  = new vscode.Range(line, 0, line, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(line, 0, line, 0);
  } catch {
    vscode.window.showWarningMessage(
      `Brana: Could not open ${thread.anchor.file_path}`,
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  // ── 0. Output channel for diagnostics ────────────────────────────
  const outputChannel = vscode.window.createOutputChannel('Brana');
  context.subscriptions.push(outputChannel);

  // ── 1. Resolve repo root ─────────────────────────────────────────
  const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!repoRoot) { return; }

  // ── 2. Instantiate modules ────────────────────────────────────────
  const storage     = new StorageManager(repoRoot);
  const decorations = new DecorationManager(context);
  const searchIndex = new SearchIndex();
  const threadMgr   = new ThreadManager(storage, searchIndex, decorations);

  context.subscriptions.push(decorations);

  // ── 3. Bootstrap ─────────────────────────────────────────────────
  const store = storage.load();
  searchIndex.rebuild(store.threads);
  vscode.window.visibleTextEditors.forEach(e => decorations.refresh(e, store.threads));

  // ── 4. Editor decoration refresh ─────────────────────────────────
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) decorations.refresh(editor, storage.load().threads);
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      editors.forEach(e => decorations.refresh(e, storage.load().threads));
    }),
  );

  // ── 5. Anchor Engine ──────────────────────────────────────────────
  const anchorEngine = new AnchorEngine(
    storage, repoRoot,
    updatedThreads => {
      searchIndex.rebuild(updatedThreads);
      vscode.window.visibleTextEditors.forEach(e => decorations.refresh(e, updatedThreads));
      sidebarProvider.refresh();
    },
  );
  anchorEngine.registerListeners(context);

  // ── 6. Re-attach state ────────────────────────────────────────────
  // When the user clicks "Re-attach" in the sidebar, we store the threadId
  // and prompt them to select code. The next createThread command picks it up.
  let pendingReattachId: string | null = null;

  // ── 7. Sidebar & Search webview providers ─────────────────────────
  const sidebarProvider = new SidebarViewProvider(
    context, storage, repoRoot, outputChannel,
    (threadId) => {
      pendingReattachId = threadId;
      vscode.window.showInformationMessage(
        'Brana: Select the new anchor code in the editor, then press Ctrl+Shift+N (or Cmd+Shift+N).',
      );
    },
    (thread) => navigateToThread(thread, repoRoot),
  );

  const searchProvider = new SearchPanelProvider(
    context, searchIndex, outputChannel,
    (thread) => navigateToThread(thread, repoRoot),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('brana.sidebarView', sidebarProvider),
    vscode.window.registerWebviewViewProvider('brana.searchView',  searchProvider),
  );

  // Wire sidebar refresh to every thread mutation
  threadMgr.onMutation = () => sidebarProvider.refresh();

  // ── 8. Commands ───────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('brana.searchThreads', () => {
      vscode.commands.executeCommand('brana.searchView.focus');
    }),
    vscode.commands.registerCommand('brana.createThread', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Brana: Open a file first.');
        return;
      }

      const doc       = editor.document;
      const sel       = editor.selection;
      const fileLines = doc.getText().split('\n');
      const filePath  = vscode.workspace.asRelativePath(doc.fileName);
      const lineStart = sel.start.line + 1;
      const lineEnd   = sel.isEmpty ? lineStart : sel.end.line + 1;

      // ── Re-attach mode ────────────────────────────────────────────
      if (pendingReattachId) {
        if (sel.isEmpty) {
          vscode.window.showInformationMessage(
            'Brana: Select the new anchor code first, then press Ctrl+Shift+N.',
          );
          return;
        }
        const newAnchor = {
          file_path:     filePath,
          line_start:    lineStart,
          line_end:      lineEnd,
          fingerprint:   computeFingerprint(fileLines, lineStart, lineEnd),
          anchored_code: doc.getText(sel),
        };
        threadMgr.reattachThread(pendingReattachId, newAnchor);
        pendingReattachId = null;
        vscode.window.showInformationMessage('Brana: Thread re-attached.');
        return;
      }

      // ── Open existing thread if cursor is on one ──────────────────
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
            'Brana: Select some code first, then press Ctrl+Shift+N.',
          );
          return;
        }
        ThreadPanelProvider.open(context, anchor, threadMgr);
      }
    }),
  );
}

export function deactivate(): void {}
