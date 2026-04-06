// src/webviews/searchPanel.ts
import * as vscode from 'vscode';
import * as path   from 'node:path';
import * as fs     from 'node:fs';
import { Thread, ThreadStatus } from '../types';
import { SearchIndex } from '../searchIndex';

export class SearchPanelProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly context:       vscode.ExtensionContext,
    private readonly searchIndex:   SearchIndex,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly onNavigate:    (thread: Thread) => void,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(
          path.join(this.context.extensionPath, 'out', 'webview', 'searchPanel'),
        ),
      ],
    };

    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage((msg) => {
      switch (msg.type as string) {
        case 'searchQuery': {
          const query  = (msg.query  as string | undefined) ?? '';
          const status = (msg.status as ThreadStatus | undefined);
          const results = this.searchIndex.query(query, status);
          view.webview.postMessage({ type: 'searchResults', results });
          break;
        }
        case 'error':
          this.outputChannel.appendLine(
            `[Search Error] ${msg.message as string}\n${msg.stack as string}`,
          );
          break;
        case 'navigateToThread': {
          // Re-run query to find the thread object from the index
          const all = this.searchIndex.query('');
          const thread = all.find(t => t.id === msg.threadId);
          if (thread) this.onNavigate(thread);
          break;
        }
      }
    });
  }

  // ── HTML ──────────────────────────────────────────────────────────
  private getHtml(webview: vscode.Webview): string {
    const assetsDir = path.join(
      this.context.extensionPath, 'out', 'webview', 'searchPanel', 'assets',
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
