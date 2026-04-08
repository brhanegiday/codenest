import { useState, useEffect } from 'react';
import { Thread, relativeTime, basename } from './types';
import './App.css';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

type HostMessage = { type: 'allThreads'; threads: Thread[] };

function preview(thread: Thread, maxLen = 80): string {
  const body = thread.replies[0]?.body ?? '';
  return body.length > maxLen ? body.slice(0, maxLen) + '…' : body;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.1"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <line x1="9" y1="10" x2="15" y2="10"/>
          <line x1="9" y1="14" x2="13" y2="14"/>
        </svg>
      </div>
      <p className="empty-title">No threads yet</p>
      <p className="empty-hint">
        Select code in the editor and press<br/>
        <kbd>Ctrl+Shift+N</kbd> to start a thread.
      </p>
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
  const replyCount = thread.replies.length;

  return (
    <div
      className={`thread-row status-${thread.status}`}
      onClick={() => onNavigate(thread)}
      title={thread.anchor.file_path}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onNavigate(thread)}
    >
      <div className={`thread-indicator indicator-${thread.status}`} />

      <div className="thread-content">
        <div className="thread-top">
          <span className="thread-file">{basename(thread.anchor.file_path)}</span>
          <span className="thread-line">:{thread.anchor.line_start}</span>
          {replyCount > 0 && (
            <span className="reply-count" title={`${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.6 }}>
                <path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2.5a2 2 0 0 0-1.6.8L8 14.333 6.1 11.8a2 2 0 0 0-1.6-.8H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12z"/>
              </svg>
              {replyCount}
            </span>
          )}
          <span className="thread-time">{relativeTime(thread.updated_at)}</span>
        </div>

        <div className="thread-preview">{preview(thread)}</div>

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
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({
  title,
  count,
  accentClass,
  defaultOpen = true,
  children,
}: {
  title:        string;
  count:        number;
  accentClass?: string;
  defaultOpen?: boolean;
  children:     React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) { return null; }

  return (
    <div className="section">
      <button
        className={`section-header ${accentClass ?? ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className={`chevron ${open ? 'open' : ''}`}>›</span>
        <span className="section-title">{title}</span>
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
        <span className="stat open-stat">
          <span className="stat-dot" />
          <strong>{open.length}</strong> open
        </span>
        <span className="stat-divider" />
        <span className="stat resolved-stat">
          <span className="stat-dot" />
          <strong>{resolved.length}</strong> resolved
        </span>
        {orphaned.length > 0 && (
          <>
            <span className="stat-divider" />
            <span className="stat orphaned-stat">
              <span className="stat-dot" />
              <strong>{orphaned.length}</strong> orphaned
            </span>
          </>
        )}
      </div>

      {/* ── Content ── */}
      {active.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="thread-list">
          {/* Orphaned first — highest priority */}
          <Section title="Orphaned" count={orphaned.length} accentClass="accent-orphaned" defaultOpen>
            {orphaned.map(t => (
              <ThreadRow key={t.id} thread={t} onNavigate={navigate} onReattach={reattach} />
            ))}
          </Section>

          <Section title="Open" count={open.length} accentClass="accent-open" defaultOpen>
            {open.map(t => <ThreadRow key={t.id} thread={t} onNavigate={navigate} />)}
          </Section>

          {!hideResolved && (
            <Section title="Resolved" count={resolved.length} accentClass="accent-resolved" defaultOpen={false}>
              {resolved.map(t => <ThreadRow key={t.id} thread={t} onNavigate={navigate} />)}
            </Section>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      {resolved.length > 0 && active.length > 0 && (
        <div className="sidebar-footer">
          <button className="footer-btn" onClick={() => setHideResolved(h => !h)}>
            {hideResolved ? '↓ Show resolved' : '↑ Hide resolved'}
          </button>
        </div>
      )}
    </div>
  );
}
