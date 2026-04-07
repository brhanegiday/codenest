// src/webviews/threadPanel.ts
import * as vscode from 'vscode';
import * as path   from 'node:path';
import * as fs     from 'node:fs';
import { ThreadAnchor, Thread } from '../types';
import { ThreadManager } from '../threadManager';

export class ThreadPanelProvider {
  /**
   * Open (or re-open) the Thread Panel webview.
   * Pass existingThread to show an existing thread's replies.
   * Omit it for the "create new thread" flow.
   */
  static open(
    context:         vscode.ExtensionContext,
    anchor:          ThreadAnchor,
    threadMgr:       ThreadManager,
    existingThread?: Thread,
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'brana.threadPanel',
      existingThread ? 'Brana Thread' : 'Brana: New Thread',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(
            path.join(context.extensionPath, 'out', 'webview', 'threadPanel'),
          ),
        ],
        retainContextWhenHidden: true,
      },
    );

    panel.webview.html = ThreadPanelProvider.getHtml(panel.webview, context);

    // The React app registers its message listener inside useEffect on mount.
    // A brief delay ensures the listener is ready before we post the initial state.
    setTimeout(() => {
      panel.webview.postMessage({
        type:           'openThreadPanel',
        anchor,
        existingThread,
      });
    }, 150);

    // ── Messages from the webview ─────────────────────────────────────
    panel.webview.onDidReceiveMessage(
      (msg) => {
        switch (msg.type as string) {

          case 'createThread': {
            const thread = threadMgr.createThread(
              msg.anchor as ThreadAnchor,
              msg.body   as string,
            );
            panel.webview.postMessage({ type: 'threadSaved', thread });
            break;
          }

          case 'addReply': {
            threadMgr.addReply(msg.threadId as string, msg.body as string);
            const updated = threadMgr.getThread(msg.threadId as string);
            if (updated) {
              panel.webview.postMessage({ type: 'threadSaved', thread: updated });
            }
            break;
          }

          case 'editReply': {
            threadMgr.editReply(
              msg.threadId as string,
              msg.replyId  as string,
              msg.body     as string,
            );
            const updated = threadMgr.getThread(msg.threadId as string);
            if (updated) {
              panel.webview.postMessage({ type: 'threadSaved', thread: updated });
            }
            break;
          }

          case 'resolveThread':
            threadMgr.toggleStatus(msg.threadId as string);
            break;

          case 'deleteThread':
            threadMgr.deleteThread(msg.threadId as string);
            panel.dispose();
            break;

          case 'cancelThread':
            panel.dispose();
            break;
        }
      },
      undefined,
      context.subscriptions,
    );
  }

  // ── HTML generation ───────────────────────────────────────────────
  private static getHtml(
    webview: vscode.Webview,
    context: vscode.ExtensionContext,
  ): string {
    const assetsDir = path.join(
      context.extensionPath, 'out', 'webview', 'threadPanel', 'assets',
    );

    // Verify build exists — show a helpful error if the webview wasn't built.
    const scriptPath = path.join(assetsDir, 'index.js');
    if (!fs.existsSync(scriptPath)) {
      return `<!DOCTYPE html><html><body style="color:#f48771;padding:16px">
        <strong>Brana:</strong> webview assets not found.<br>
        Run <code>pnpm run build:webview</code> then reload.
      </body></html>`;
    }

    const scriptUri = webview.asWebviewUri(vscode.Uri.file(scriptPath));
    const styleUri  = webview.asWebviewUri(
      vscode.Uri.file(path.join(assetsDir, 'index.css')),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Brana Thread</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
