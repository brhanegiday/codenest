import { useState, useEffect, useRef, useCallback } from 'react';
import { Thread, ThreadStatus, relativeTime, basename } from './types';
import './App.css';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

type StatusFilter = 'all' | ThreadStatus;

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',      value: 'all'      },
  { label: 'Open',     value: 'open'     },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Orphaned', value: 'orphaned' },
];

// ── Search icon ───────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.156a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/>
  </svg>
);

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ThreadStatus }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ query }: { query: string }) {
  if (query) {
    return (
      <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </div>
        <p className="empty-title">No matches for "{query}"</p>
        <p className="empty-hint">Try a different keyword or clear the filter.</p>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <p className="empty-title">No threads yet</p>
      <p className="empty-hint">Select code and press <kbd>Ctrl+Shift+N</kbd> to create one.</p>
    </div>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────
function ResultRow({ thread }: { thread: Thread }) {
  const navigate = () =>
    vscode.postMessage({ type: 'navigateToThread', threadId: thread.id });

  const body    = thread.replies[0]?.body ?? '';
  const preview = body.length > 90 ? body.slice(0, 90) + '…' : body;
  const replyCount = thread.replies.length;

  return (
    <div className="result-row" onClick={navigate} title={thread.anchor.file_path}>
      <div className="result-top">
        <span className="result-file">{basename(thread.anchor.file_path)}</span>
        <span className="result-line">:{thread.anchor.line_start}</span>
        <div className="result-right">
          <StatusBadge status={thread.status} />
          <span className="result-time">{relativeTime(thread.updated_at)}</span>
        </div>
      </div>
      <div className="result-preview">{preview}</div>
      {replyCount > 1 && (
        <div className="result-replies">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.6 }}>
            <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v2.5H14a.5.5 0 0 1 .354.854l-2.5 2.5a.5.5 0 0 1-.708 0l-2.5-2.5A.5.5 0 0 1 8.5 7.5H10V5h-5v-.5A1.5 1.5 0 0 1 6.5 3h-1.5A2.5 2.5 0 0 0 2.5 5.5v7A2.5 2.5 0 0 0 5 15h6a2.5 2.5 0 0 0 2.5-2.5V11h-1v1.5A1.5 1.5 0 0 1 11 14H5a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 5 4v-.5z"/>
          </svg>
          {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [query,   setQuery]   = useState('');
  const [filter,  setFilter]  = useState<StatusFilter>('all');
  const [results, setResults] = useState<Thread[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string; results?: Thread[] };
      if (msg.type === 'searchResults' && msg.results) {
        setResults(msg.results);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const fireSearch = useCallback((q: string, f: StatusFilter) => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); }
    debounceRef.current = setTimeout(() => {
      vscode.postMessage({
        type:   'searchQuery',
        query:  q,
        status: f === 'all' ? undefined : f,
      });
    }, 50);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    fireSearch(q, filter);
  };

  const handleFilterChange = (f: StatusFilter) => {
    setFilter(f);
    fireSearch(query, f);
  };

  const clearQuery = () => {
    setQuery('');
    fireSearch('', filter);
  };

  useEffect(() => { fireSearch('', 'all'); }, [fireSearch]);

  return (
    <div className="search-panel">

      {/* ── Search bar ── */}
      <div className="search-bar">
        <span className="search-icon-wrap" aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          className="search-input"
          type="text"
          placeholder="Search threads…"
          value={query}
          onChange={handleQueryChange}
          autoFocus
          spellCheck={false}
          aria-label="Search threads"
        />
        {query && (
          <button className="clear-btn" onClick={clearQuery} title="Clear search" aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div className="filter-tabs" role="tablist">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={filter === tab.value}
            className={`tab ${filter === tab.value ? 'tab-active' : ''}`}
            onClick={() => handleFilterChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Results ── */}
      <div className="results" role="list">
        {results.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <>
            <div className="results-count">
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </div>
            {results.map(t => <ResultRow key={t.id} thread={t} />)}
          </>
        )}
      </div>
    </div>
  );
}
