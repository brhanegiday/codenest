import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// ── Types ─────────────────────────────────────────────────────────────────────
type ThreadStatus = 'open' | 'resolved' | 'orphaned';

interface ThreadAnchor {
  file_path:     string;
  line_start:    number;
  line_end:      number;
  fingerprint:   string;
  anchored_code: string;
}

interface Reply {
  id:          string;
  body:        string;
  author_type: 'human' | 'ai';
  created_at:  string;
  edited_at:   string | null;
}

interface Thread {
  id:         string;
  type:       'private' | 'shared';
  status:     ThreadStatus;
  anchor:     ThreadAnchor;
  replies:    Reply[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type HostMessage =
  | { type: 'openThreadPanel'; anchor: ThreadAnchor; existingThread?: Thread }
  | { type: 'threadSaved'; thread: Thread };

type WebviewMessage =
  | { type: 'createThread'; anchor: ThreadAnchor; body: string }
  | { type: 'addReply';     threadId: string; body: string }
  | { type: 'editReply';    threadId: string; replyId: string; body: string }
  | { type: 'resolveThread'; threadId: string }
  | { type: 'deleteThread'; threadId: string }
  | { type: 'cancelThread' };

// ── VS Code API ───────────────────────────────────────────────────────────────
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();
function post(msg: WebviewMessage) { vscode.postMessage(msg); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text: string): { __html: string } {
  const escaped = escapeHtml(text);
  const html = escaped
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  return { __html: html };
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

// ── Icons (inline SVG) ────────────────────────────────────────────────────────
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.23 1a1.82 1.82 0 0 1 1.29.54 1.82 1.82 0 0 1 0 2.58L5.3 13.34l-3.65.81.81-3.65L11.65 1.54A1.82 1.82 0 0 1 13.23 1zm0 1.18a.64.64 0 0 0-.45.19L3.7 11.43l-.41 1.87 1.87-.41L14.23 3.82a.64.64 0 0 0 0-.9.64.64 0 0 0-.45-.18l-.55-.54z"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6.5 1h3a.5.5 0 0 1 .5.5V2h3a.5.5 0 0 1 0 1h-.5v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2.5 13V3H2a.5.5 0 0 1 0-1h3V1.5a.5.5 0 0 1 .5-.5zM4 3v10a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V3H4zm2.5 2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5z"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
  </svg>
);

const ReopenIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
    <path d="M8 1.5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5H6a.5.5 0 0 1 0-1h1.5V2a.5.5 0 0 1 .5-.5z"/>
  </svg>
);

// ── Reply card ────────────────────────────────────────────────────────────────
function ReplyCard({
  reply,
  isLead,
  threadId,
  showMarkdown,
}: {
  reply:        Reply;
  isLead:       boolean;
  threadId:     string;
  showMarkdown: boolean;
}) {
  const [editing, setEditing]   = useState(false);
  const [editVal, setEditVal]   = useState(reply.body);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Keep editVal in sync if thread is refreshed from host
  useEffect(() => { setEditVal(reply.body); }, [reply.body]);

  const startEdit = () => {
    setEditVal(reply.body);
    setEditing(true);
    requestAnimationFrame(() => editRef.current?.focus());
  };

  const saveEdit = () => {
    const trimmed = editVal.trim();
    if (!trimmed || trimmed === reply.body) { setEditing(false); return; }
    post({ type: 'editReply', threadId, replyId: reply.id, body: trimmed });
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditVal(reply.body);
    setEditing(false);
  };

  const handleEditKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') cancelEdit();
  };

  const initial = reply.author_type === 'ai' ? 'AI' : 'You';

  return (
    <div className={`reply-card ${isLead ? 'reply-lead' : ''}`}>
      <div className="reply-avatar" aria-hidden="true">{initial}</div>
      <div className="reply-content">
        {editing ? (
          <>
            <textarea
              ref={editRef}
              className="edit-textarea"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={handleEditKey}
              rows={4}
              spellCheck
            />
            <div className="edit-actions">
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={saveEdit}
                disabled={!editVal.trim() || editVal.trim() === reply.body}
              >
                Save edit
              </button>
            </div>
          </>
        ) : (
          <div
            className="reply-body"
            dangerouslySetInnerHTML={
              showMarkdown
                ? renderMarkdown(reply.body)
                : { __html: escapeHtml(reply.body).replace(/\n/g, '<br>') }
            }
          />
        )}
        <div className="reply-meta">
          {reply.edited_at && <span className="edited-tag">edited</span>}
          <span>{relativeTime(reply.created_at)}</span>
          {!editing && (
            <button className="icon-btn" onClick={startEdit} title="Edit reply">
              <EditIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [anchor, setAnchor]               = useState<ThreadAnchor | null>(null);
  const [thread, setThread]               = useState<Thread | null>(null);
  const [body, setBody]                   = useState('');
  const [showMarkdown, setShowMarkdown]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage;
      if (msg.type === 'openThreadPanel') {
        setAnchor(msg.anchor);
        setThread(msg.existingThread ?? null);
        setBody('');
        setShowMarkdown(false);
        setConfirmDelete(false);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
      if (msg.type === 'threadSaved') {
        setThread(msg.thread);
        setBody('');
        setConfirmDelete(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed || !anchor) { return; }
    if (thread) {
      post({ type: 'addReply', threadId: thread.id, body: trimmed });
    } else {
      post({ type: 'createThread', anchor, body: trimmed });
    }
    setBody('');
  }, [body, anchor, thread]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleResolve = () => {
    if (!thread) { return; }
    post({ type: 'resolveThread', threadId: thread.id });
    setThread(prev => prev
      ? { ...prev, status: prev.status === 'resolved' ? 'open' : 'resolved' }
      : null,
    );
  };

  const handleDelete = () => {
    if (!thread) { return; }
    if (!confirmDelete) { setConfirmDelete(true); return; }
    post({ type: 'deleteThread', threadId: thread.id });
  };

  const handleCancel = () => {
    if (body.trim()) { setBody(''); } else { post({ type: 'cancelThread' }); }
  };

  if (!anchor) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <span>Loading thread…</span>
      </div>
    );
  }

  const fileLabel   = basename(anchor.file_path);
  const lineLabel   = anchor.line_end !== anchor.line_start
    ? `${anchor.line_start}–${anchor.line_end}`
    : `${anchor.line_start}`;
  const isOrphaned  = thread?.status === 'orphaned';
  const isResolved  = thread?.status === 'resolved';

  return (
    <div className="panel">

      {/* ── Orphaned banner ── */}
      {isOrphaned && (
        <div className="orphan-banner">
          <span className="orphan-icon">⚠</span>
          <span>This thread is orphaned — its code has changed. Re-attach it from the sidebar.</span>
        </div>
      )}

      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <span className="file-icon">📄</span>
          <div className="header-path">
            <span className="file-name">{fileLabel}</span>
            <span className="file-rest">
              {anchor.file_path.includes('/') ? ' · ' + anchor.file_path.split('/').slice(0, -1).join('/') : ''}
            </span>
          </div>
          <span className="line-badge">:{lineLabel}</span>
        </div>
        {thread && (
          <span className={`status-badge status-${thread.status}`}>
            {thread.status}
          </span>
        )}
      </div>

      {/* ── Anchored code context ── */}
      {anchor.anchored_code && (
        <div className="code-context">
          <div className="code-context-label">Anchored code</div>
          <pre className="code-block"><code>{anchor.anchored_code}</code></pre>
        </div>
      )}

      {/* ── Replies ── */}
      {thread && thread.replies.length > 0 && (
        <div className="replies">
          {thread.replies.map((reply, i) => (
            <ReplyCard
              key={reply.id}
              reply={reply}
              isLead={i === 0}
              threadId={thread.id}
              showMarkdown={showMarkdown}
            />
          ))}
        </div>
      )}

      {/* ── Compose ── */}
      <div className="compose">
        <div className="compose-header">
          <span className="compose-label">
            {thread ? 'Add a reply' : 'New thread'}
          </span>
          <button
            className={`toggle-btn ${showMarkdown ? 'toggle-active' : ''}`}
            onClick={() => setShowMarkdown(p => !p)}
            title="Toggle Markdown preview"
          >
            {showMarkdown ? 'Edit' : 'Preview'}
          </button>
        </div>

        {showMarkdown && body ? (
          <div
            className="preview-pane"
            dangerouslySetInnerHTML={renderMarkdown(body)}
          />
        ) : (
          <textarea
            ref={textareaRef}
            className="compose-textarea"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={thread ? 'Add a reply… (Markdown supported)' : 'Add a note, decision, or question… (Markdown supported)'}
            rows={4}
            spellCheck
          />
        )}

        {/* ── Actions ── */}
        {confirmDelete ? (
          <div className="confirm-row">
            <span className="confirm-text">Permanently delete this thread?</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
          </div>
        ) : (
          <div className="toolbar">
            {thread ? (
              <>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={handleDelete}
                  title="Delete thread"
                >
                  <TrashIcon /> Delete
                </button>
                <div className="toolbar-spacer" />
                <button
                  className={`btn btn-sm btn-icon ${isResolved ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={handleResolve}
                  title={isResolved ? 'Reopen thread' : 'Mark as resolved'}
                >
                  {isResolved ? <><ReopenIcon /> Reopen</> : <><CheckIcon /> Resolve</>}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={!body.trim()}
                  title="Save reply (⌘↵ / Ctrl+↵)"
                >
                  Reply <kbd>⌘↵</kbd>
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={handleCancel}>Cancel</button>
                <div className="toolbar-spacer" />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={!body.trim()}
                  title="Save thread (⌘↵ / Ctrl+↵)"
                >
                  Save <kbd>⌘↵</kbd>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
