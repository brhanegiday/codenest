import { useState, useEffect } from 'react';
import { Thread, ThreadStatus, relativeTime, basename } from './types';
import './App.css';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

type HostMessage =
  | { type: 'allThreads'; threads: Thread[] }
  | { type: 'reattachMode'; threadId: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
function preview(thread: Thread, maxLen = 60): string {
  const body = thread.replies[0]?.body ?? '';
  return body.length > maxLen ? body.slice(0, maxLen) + '…' : body;
}

// ── Thread row ────────────────────────────────────────────────────────────────
function ThreadRow({ thread, onNavigate, onReattach }: {
  thread:     Thread;
  onNavigate: (t: Thread) => void;
  onReattach?: (t: Thread) => void;
}) {
  return (
    <div className="thread-row" onClick={() => onNavigate(thread)}>
      <div className="thread-row-top">
        <span className="file-name">{basename(thread.anchor.file_path)}</span>
        <span className="line-num">:{thread.anchor.line_start}</span>
        <span className="thread-time">{relativeTime(thread.updated_at)}</span>
      </div>
      <div className="thread-preview">{preview(thread)}</div>
      {thread.status === 'orphaned' && onReattach && (
        <button
          className="btn-reattach"
          onClick={e => { e.stopPropagation(); onReattach(thread); }}
        >
          Re-attach
        </button>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ title, count, defaultOpen = true, accent, children }: {
  title: string; count: number; defaultOpen?: boolean;
  accent?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="section">
      <button
        className="section-header"
        style={accent ? { color: accent } : undefined}
        onClick={() => setOpen(o => !o)}
      >
        <span className="chevron">{open ? '▾' : '▸'}</span>
        {title}
        <span className="section-count">{count}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [threads, setThreads]           = useState<Thread[]>([]);
  const [hideResolved, setHideResolved] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage;
      if (msg.type === 'allThreads') setThreads(msg.threads);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const navigate = (t: Thread) =>
    vscode.postMessage({ type: 'navigateToThread', threadId: t.id });

  const reattach = (t: Thread) =>
    vscode.postMessage({ type: 'reattachThread', threadId: t.id });

  const active   = threads.filter(t => !t.deleted_at);
  const open     = active.filter(t => t.status === 'open');
  const orphaned = active.filter(t => t.status === 'orphaned');
  const resolved = active.filter(t => t.status === 'resolved');

  const total    = active.length;

  return (
    <div className="sidebar">
      {/* ── Stats bar ── */}
      <div className="stats-bar">
        <span className="stat"><span className="stat-num">{open.length}</span> open</span>
        <span className="stat-sep">·</span>
        <span className="stat"><span className="stat-num">{resolved.length}</span> resolved</span>
        {orphaned.length > 0 && (
          <>
            <span className="stat-sep">·</span>
            <span className="stat stat-warn">
              <span className="stat-num">{orphaned.length}</span> orphaned
            </span>
          </>
        )}
      </div>

      {total === 0 && (
        <div className="empty-state">
          No threads yet. Select code and press <kbd>Ctrl+Shift+N</kbd> to add one.
        </div>
      )}

      {/* ── Orphaned (always first, always visible) ── */}
      {orphaned.length > 0 && (
        <Section
          title="Orphaned"
          count={orphaned.length}
          accent="var(--vscode-editorWarning-foreground, #cca700)"
        >
          {orphaned.map(t => (
            <ThreadRow key={t.id} thread={t} onNavigate={navigate} onReattach={reattach} />
          ))}
        </Section>
      )}

      {/* ── Open ── */}
      <Section title="Open" count={open.length}>
        {open.map(t => <ThreadRow key={t.id} thread={t} onNavigate={navigate} />)}
      </Section>

      {/* ── Resolved ── */}
      {!hideResolved && (
        <Section title="Resolved" count={resolved.length} defaultOpen={false}>
          {resolved.map(t => <ThreadRow key={t.id} thread={t} onNavigate={navigate} />)}
        </Section>
      )}

      {/* ── Footer controls ── */}
      {resolved.length > 0 && (
        <div className="footer">
          <button className="btn-toggle" onClick={() => setHideResolved(h => !h)}>
            {hideResolved ? 'Show resolved' : 'Hide resolved'}
          </button>
        </div>
      )}
    </div>
  );
}
