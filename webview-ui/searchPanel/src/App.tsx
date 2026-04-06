import { useState, useEffect, useRef, useCallback } from 'react';
import { Thread, ThreadStatus, relativeTime, basename } from './types';
import './App.css';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

type StatusFilter = 'all' | ThreadStatus;

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Open',     value: 'open' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Orphaned', value: 'orphaned' },
];

function StatusBadge({ status }: { status: ThreadStatus }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function ResultRow({ thread }: { thread: Thread }) {
  const navigate = () =>
    vscode.postMessage({ type: 'navigateToThread', threadId: thread.id });

  const body = thread.replies[0]?.body ?? '';
  const preview = body.length > 80 ? body.slice(0, 80) + '…' : body;

  return (
    <div className="result-row" onClick={navigate}>
      <div className="result-top">
        <span className="file-name">{basename(thread.anchor.file_path)}</span>
        <span className="line-num">:{thread.anchor.line_start}</span>
        <StatusBadge status={thread.status} />
        <span className="result-time">{relativeTime(thread.updated_at)}</span>
      </div>
      <div className="result-preview">{preview}</div>
    </div>
  );
}

export default function App() {
  const [query,   setQuery]   = useState('');
  const [filter,  setFilter]  = useState<StatusFilter>('all');
  const [results, setResults] = useState<Thread[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for search results from the extension host
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

  // Fire search on every query/filter change, debounced 50ms
  const fireSearch = useCallback((q: string, f: StatusFilter) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
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

  // Fire initial load on mount
  useEffect(() => { fireSearch('', 'all'); }, [fireSearch]);

  return (
    <div className="search-panel">
      {/* ── Input ── */}
      <div className="search-bar">
        <span className="search-icon">⌕</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search threads…"
          value={query}
          onChange={handleQueryChange}
          autoFocus
          spellCheck={false}
        />
        {query && (
          <button className="clear-btn" onClick={() => { setQuery(''); fireSearch('', filter); }}>
            ✕
          </button>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div className="filter-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            className={`tab ${filter === tab.value ? 'tab-active' : ''}`}
            onClick={() => handleFilterChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Results ── */}
      <div className="results">
        {results.length === 0 ? (
          <div className="empty-state">
            {query
              ? `No threads match "${query}"`
              : 'No threads yet. Select code and press Ctrl+Shift+N.'}
          </div>
        ) : (
          results.map(t => <ResultRow key={t.id} thread={t} />)
        )}
      </div>
    </div>
  );
}
