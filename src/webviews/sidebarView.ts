// src/webviews/sidebarView.ts
import * as vscode from 'vscode';
import * as path   from 'node:path';
import * as fs     from 'node:fs';
import { Thread } from '../types';
import { StorageManager } from '../storageManager';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly context:       vscode.ExtensionContext,
    private readonly storage:       StorageManager,
    private readonly repoRoot:      string,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly onReattach:    (threadId: string) => void,
    private readonly onNavigate:    (thread: Thread) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(
          path.join(this.context.extensionPath, 'out', 'webview', 'sidebarView'),
        ),
      ],
    };

    view.webview.html = this.getHtml(view.webview);

    // Push initial thread list once the webview is ready
    view.webview.onDidReceiveMessage((msg) => {
      switch (msg.type as string) {
        case 'navigateToThread': {
          const store  = this.storage.load();
          const thread = store.threads.find(t => t.id === msg.threadId);
          if (thread) this.onNavigate(thread);
          break;
        }
        case 'reattachThread':
          this.onReattach(msg.threadId as string);
          break;
        case 'error':
          this.outputChannel.appendLine(
            `[Sidebar Error] ${msg.message as string}\n${msg.stack as string}`,
          );
          break;
      }
    });

    // Send threads once the webview signals it's mounted,
    // and also eagerly after a short delay as a safety net.
    setTimeout(() => this.refresh(), 100);
  }

  /** Push the current thread list to the webview. Call after every mutation. */
  refresh(): void {
    if (!this.view) { return; }
    const store = this.storage.load();
    const active = store.threads.filter(t => !t.deleted_at);
    this.view.webview.postMessage({ type: 'allThreads', threads: active });
  }

  // ── HTML ──────────────────────────────────────────────────────────
  private getHtml(webview: vscode.Webview): string {
    const assetsDir = path.join(
      this.context.extensionPath, 'out', 'webview', 'sidebarView', 'assets',
    );
    const scriptPath = path.join(assetsDir, 'index.js');
    if (!fs.existsSync(scriptPath)) {
      return `<body style="color:#f48771;padding:12px">
        Run <code>pnpm run build:webview</code> then reload.
      </body>`;
    }
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(scriptPath));
    const styleUri  = webview.asWebviewUri(vscode.Uri.file(path.join(assetsDir, 'index.css')));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src ${webview.cspSource};"/>
  <link rel="stylesheet" href="${styleUri}"/>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
