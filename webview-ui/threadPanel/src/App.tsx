import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// ── Types (mirror of src/types/index.ts — keep in sync) ──────────────────────
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
  | { type: 'resolveThread'; threadId: string }
  | { type: 'deleteThread'; threadId: string }
  | { type: 'cancelThread' };

// ── VS Code API ────────────────────────────────────────────────────────────────
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
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(text: string): { __html: string } {
  const escaped = escapeHtml(text);
  const html = escaped
    // code fences
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // bold
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    // newlines (outside pre blocks — rough but good enough for v0.1)
    .replace(/\n/g, '<br>');
  return { __html: html };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  const [anchor, setAnchor]               = useState<ThreadAnchor | null>(null);
  const [thread, setThread]               = useState<Thread | null>(null);
  const [body, setBody]                   = useState('');
  const [showPreview, setShowPreview]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Message listener ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage;

      if (msg.type === 'openThreadPanel') {
        setAnchor(msg.anchor);
        setThread(msg.existingThread ?? null);
        setBody('');
        setShowPreview(false);
        setConfirmDelete(false);
        // Focus textarea after React re-renders
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

  // ── Actions ────────────────────────────────────────────────────────
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
    // Optimistic update
    setThread(prev => prev
      ? { ...prev, status: prev.status === 'resolved' ? 'open' : 'resolved' }
      : null,
    );
  };

  const handleDelete = () => {
    if (!thread) { return; }
    if (!confirmDelete) { setConfirmDelete(true); return; }
    post({ type: 'deleteThread', threadId: thread.id });
    // Panel will be closed by the extension host after delete
  };

  const handleCancel = () => {
    if (body.trim()) {
      setBody('');
    } else {
      post({ type: 'cancelThread' });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (!anchor) {
    return <div className="loading">Initialising…</div>;
  }

  const locationLabel = `${anchor.file_path}:${anchor.line_start}${
    anchor.line_end !== anchor.line_start ? `–${anchor.line_end}` : ''
  }`;

  const replyPlaceholder = thread
    ? 'Add a reply… (Markdown supported)'
    : 'Add a note, decision, or question… (Markdown supported)';

  return (
    <div className="panel">
      {/* ── Header ── */}
      <div className="header">
        <span className="location">{locationLabel}</span>
        {thread && (
          <span className={`badge badge-${thread.status}`}>{thread.status}</span>
        )}
      </div>

      {/* ── Existing replies ── */}
      {thread && thread.replies.length > 0 && (
        <div className="replies">
          {thread.replies.map((reply, i) => (
            <div key={reply.id} className={`reply ${i === 0 ? 'reply-lead' : ''}`}>
              <div
                className="reply-body"
                dangerouslySetInnerHTML={
                  showPreview
                    ? renderMarkdown(reply.body)
                    : { __html: escapeHtml(reply.body).replace(/\n/g, '<br>') }
                }
              />
              <div className="reply-meta">
                {reply.edited_at ? 'edited · ' : ''}
                {relativeTime(reply.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Compose area ── */}
      <div className="compose">
        {showPreview && body ? (
          <div
            className="preview-pane"
            dangerouslySetInnerHTML={renderMarkdown(body)}
          />
        ) : (
          <textarea
            ref={textareaRef}
            className="input"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={replyPlaceholder}
            rows={5}
            spellCheck
          />
        )}

        {/* ── Toolbar ── */}
        <div className="toolbar">
          <button
            className="btn btn-ghost"
            onClick={() => setShowPreview(p => !p)}
            title="Toggle Markdown preview"
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>

          <div className="spacer" />

          {thread ? (
            <>
              {confirmDelete ? (
                <>
                  <span className="confirm-label">Delete this thread?</span>
                  <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>No</button>
                  <button className="btn btn-danger" onClick={handleDelete}>Yes, delete</button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={handleDelete} title="Delete thread">
                  Delete
                </button>
              )}
              {!confirmDelete && (
                <>
                  <button className="btn btn-ghost" onClick={handleResolve}>
                    {thread.status === 'resolved' ? 'Reopen' : 'Resolve'}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={!body.trim()}
                    title="Save reply (⌘↵)"
                  >
                    Reply <kbd>⌘↵</kbd>
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!body.trim()}
                title="Save thread (⌘↵)"
              >
                Save <kbd>⌘↵</kbd>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
