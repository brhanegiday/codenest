// src/decorationManager.ts
import * as vscode from 'vscode';
import { Thread } from './types';

export class DecorationManager {
  private openDec:     vscode.TextEditorDecorationType;
  private resolvedDec: vscode.TextEditorDecorationType;
  private orphanDec:   vscode.TextEditorDecorationType;

  constructor(context: vscode.ExtensionContext) {
    const icon = (name: string) =>
      vscode.Uri.file(context.asAbsolutePath(`media/${name}`));

    this.openDec = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon('thread-open.svg'),
      gutterIconSize: 'contain',
    });

    this.resolvedDec = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon('thread-resolved.svg'),
      gutterIconSize: 'contain',
      opacity: '0.5',
    });

    this.orphanDec = vscode.window.createTextEditorDecorationType({
      gutterIconPath: icon('thread-orphan.svg'),
      gutterIconSize: 'contain',
      backgroundColor: new vscode.ThemeColor(
        'diffEditor.removedLineBackground'
      ),
      isWholeLine: true,
    });
  }

  // Call this any time threads change for a file.
  // Always passes the FULL updated list — VS Code replaces all decorations
  // of a given type on each call, so partial updates leave stale icons.
  refresh(editor: vscode.TextEditor, allThreads: Thread[]): void {
    const filePath = vscode.workspace.asRelativePath(
      editor.document.fileName
    );

    const fileThreads = allThreads.filter(
      t => t.anchor.file_path === filePath && !t.deleted_at
    );

    // Range must span actual characters for hoverMessage to fire.
    // Number.MAX_SAFE_INTEGER covers the full line without knowing its length.
    const toRange = (t: Thread) =>
      new vscode.Range(
        t.anchor.line_start - 1, 0,
        t.anchor.line_start - 1, Number.MAX_SAFE_INTEGER
      );

    const makeOption = (t: Thread): vscode.DecorationOptions => ({
      range: toRange(t),
      hoverMessage: new vscode.MarkdownString(
        `**${t.replies[0]?.body.slice(0, 80) ?? ''}...**\n\n` +
        `${t.replies.length} repl${t.replies.length === 1 ? 'y' : 'ies'} · ` +
        `${t.status}`
      ),
    });

    editor.setDecorations(
      this.openDec,
      fileThreads.filter(t => t.status === 'open').map(makeOption)
    );
    editor.setDecorations(
      this.resolvedDec,
      fileThreads.filter(t => t.status === 'resolved').map(makeOption)
    );
    editor.setDecorations(
      this.orphanDec,
      fileThreads.filter(t => t.status === 'orphaned').map(makeOption)
    );
  }

  dispose(): void {
    this.openDec.dispose();
    this.resolvedDec.dispose();
    this.orphanDec.dispose();
  }
}
