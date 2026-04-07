import { useState, useEffect } from 'react';
import { Thread, relativeTime, basename } from './types';
import './App.css';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

type HostMessage =
  | { type: 'allThreads'; threads: Thread[] };

// ── Helpers ───────────────────────────────────────────────────────────────────
function preview(thread: Thread, maxLen = 72): string {
  const body = thread.replies[0]?.body ?? '';
  return body.length > maxLen ? body.slice(0, maxLen) + '…' : body;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <line x1="9" y1="10" x2="15" y2="10"/>
          <line x1="9" y1="14" x2="13" y2="14"/>
        </svg>
      </div>
      <p className="empty-title">No threads yet</p>
      <p className="empty-hint">Select code in the editor and press<br/><kbd>Ctrl+Shift+N</kbd> to add a thread.</p>
    </div>
  );
}

// ── Thread row ────────────────────────────────────────────────────────────────
function ThreadRow({
  thread,
  onNavigate,
  onReattach,
}: {
  thread:      Thread;
  onNavigate:  (t: Thread) => void;
  onReattach?: (t: Thread) => void;
}) {
  const isOrphaned = thread.status === 'orphaned';

  return (
    <div
      className={`thread-row ${isOrphaned ? 'thread-row-orphaned' : ''}`}
      onClick={() => onNavigate(thread)}
      title={thread.anchor.file_path}
    >
      <div className="thread-row-top">
        <span className="row-file">{basename(thread.anchor.file_path)}</span>
        <span className="row-line">:{thread.anchor.line_start}</span>
        <span className="row-time">{relativeTime(thread.updated_at)}</span>
      </div>
      <div className="thread-row-preview">{preview(thread)}</div>
      {isOrphaned && onReattach && (
        <button
          className="reattach-btn"
          onClick={e => { e.stopPropagation(); onReattach(thread); }}
          title="Re-attach this orphaned thread to new code"
        >
          ↩ Re-attach
        </button>
      )}
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({
  title,
  count,
  accent,
  defaultOpen = true,
  children,
}: {
  title:        string;
  count:        number;
  accent?:      string;
  defaultOpen?: boolean;
  children:     React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) { return null; }

  return (
    <div className="section">
      <button
        className="section-header"
        onClick={() => setOpen(o => !o)}
        style={accent ? { '--accent': accent } as React.CSSProperties : undefined}
      >
        <span className={`chevron ${open ? 'chevron-open' : ''}`}>›</span>
        <span className="section-title" style={accent ? { color: accent } : undefined}>
          {title}
        </span>
        <span className="section-badge">{count}</span>
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
      if (msg.type === 'allThreads') { setThreads(msg.threads); }
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

  return (
    <div className="sidebar">

      {/* ── Stats bar ── */}
      <div className="stats-bar">
        <span className="stat-item">
          <span className="stat-dot stat-dot-open" />
          <span className="stat-num">{open.length}</span> open
        </span>
        <span className="stat-sep" />
        <span className="stat-item">
          <span className="stat-dot stat-dot-resolved" />
          <span className="stat-num">{resolved.length}</span> resolved
        </span>
        {orphaned.length > 0 && (
          <>
            <span className="stat-sep" />
            <span className="stat-item stat-warn">
              <span className="stat-dot stat-dot-orphaned" />
              <span className="stat-num">{orphaned.length}</span> orphaned
            </span>
          </>
        )}
      </div>

      {/* ── Empty state ── */}
      {active.length === 0 && <EmptyState />}

      {/* ── Orphaned (highest priority, always open) ── */}
      {orphaned.length > 0 && (
        <Section
          title="Orphaned"
          count={orphaned.length}
          accent="var(--vscode-editorWarning-foreground, #cca700)"
          defaultOpen
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

      {/* ── Footer ── */}
      {resolved.length > 0 && (
        <div className="footer">
          <button className="toggle-link" onClick={() => setHideResolved(h => !h)}>
            {hideResolved ? '↓ Show resolved' : '↑ Hide resolved'}
          </button>
        </div>
      )}
    </div>
  );
}
