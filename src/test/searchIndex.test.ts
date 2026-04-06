import * as assert from 'assert';
import { SearchIndex } from '../searchIndex';
import { Thread } from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  const now = new Date().toISOString();
  return {
    id:         overrides.id,
    type:       'private',
    status:     overrides.status  ?? 'open',
    deleted_at: overrides.deleted_at ?? null,
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    anchor: overrides.anchor ?? {
      file_path:     'src/foo.ts',
      line_start:    1,
      line_end:      1,
      fingerprint:   'abc',
      anchored_code: 'const x = 1;',
    },
    replies: overrides.replies ?? [{
      id:          'r-' + overrides.id,
      body:        overrides.id + ' body text',
      author_type: 'human',
      created_at:  now,
      edited_at:   null,
    }],
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

suite('SearchIndex', () => {
  let idx: SearchIndex;

  // Rebuild a fresh index before each test
  setup(() => { idx = new SearchIndex(); });

  // ── rebuild / empty query ─────────────────────────────────────────

  test('empty query returns all non-deleted threads', () => {
    const t1 = makeThread({ id: 't1' });
    const t2 = makeThread({ id: 't2' });
    const t3 = makeThread({ id: 't3', deleted_at: new Date().toISOString() });
    idx.rebuild([t1, t2, t3]);
    const results = idx.query('');
    assert.strictEqual(results.length, 2);
    assert.ok(results.every(t => !t.deleted_at));
  });

  test('empty query results are sorted by updated_at descending', () => {
    const older = makeThread({ id: 'older', updated_at: '2026-01-01T00:00:00.000Z' });
    const newer = makeThread({ id: 'newer', updated_at: '2026-06-01T00:00:00.000Z' });
    idx.rebuild([older, newer]);
    const results = idx.query('');
    assert.strictEqual(results[0].id, 'newer');
    assert.strictEqual(results[1].id, 'older');
  });

  // ── token matching ────────────────────────────────────────────────

  test('single token matches thread body text', () => {
    const t = makeThread({ id: 'match', replies: [{
      id: 'r1', body: 'authentication flow needs review',
      author_type: 'human', created_at: new Date().toISOString(), edited_at: null,
    }]});
    idx.rebuild([t, makeThread({ id: 'nomatch' })]);
    const results = idx.query('authentication');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'match');
  });

  test('single token matches anchored_code content', () => {
    const t = makeThread({ id: 'code-match', anchor: {
      file_path: 'src/bar.ts', line_start: 5, line_end: 5,
      fingerprint: 'fp', anchored_code: 'function computeHash(input: string)',
    }});
    idx.rebuild([t, makeThread({ id: 'nomatch' })]);
    const results = idx.query('computeHash');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'code-match');
  });

  test('single token matches file path', () => {
    const t = makeThread({ id: 'path-match', anchor: {
      file_path: 'src/auth/AuthService.ts', line_start: 1, line_end: 1,
      fingerprint: 'fp', anchored_code: '',
    }});
    idx.rebuild([t, makeThread({ id: 'nomatch' })]);
    const results = idx.query('authservice');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'path-match');
  });

  test('multiple tokens use AND logic — both must match', () => {
    const both = makeThread({ id: 'both', replies: [{
      id: 'r', body: 'token-alpha and token-beta are both here',
      author_type: 'human', created_at: new Date().toISOString(), edited_at: null,
    }]});
    const one = makeThread({ id: 'one', replies: [{
      id: 'r', body: 'only token-alpha here',
      author_type: 'human', created_at: new Date().toISOString(), edited_at: null,
    }]});
    idx.rebuild([both, one]);
    const results = idx.query('token-alpha token-beta');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'both');
  });

  test('search is case-insensitive', () => {
    const t = makeThread({ id: 'ci', replies: [{
      id: 'r', body: 'The AuthManager class handles sessions',
      author_type: 'human', created_at: new Date().toISOString(), edited_at: null,
    }]});
    idx.rebuild([t]);
    assert.strictEqual(idx.query('authmanager').length, 1);
    assert.strictEqual(idx.query('AUTHMANAGER').length, 1);
    assert.strictEqual(idx.query('AuthManager').length, 1);
  });

  // ── status filter ─────────────────────────────────────────────────

  test('status filter excludes non-matching threads', () => {
    const open     = makeThread({ id: 'open',     status: 'open' });
    const resolved = makeThread({ id: 'resolved', status: 'resolved' });
    const orphaned = makeThread({ id: 'orphaned', status: 'orphaned' });
    idx.rebuild([open, resolved, orphaned]);

    assert.deepStrictEqual(idx.query('', 'open').map(t => t.id),     ['open']);
    assert.deepStrictEqual(idx.query('', 'resolved').map(t => t.id), ['resolved']);
    assert.deepStrictEqual(idx.query('', 'orphaned').map(t => t.id), ['orphaned']);
  });

  test('status filter combined with token search', () => {
    const openMatch     = makeThread({ id: 'om', status: 'open',     replies: [{ id:'r', body:'needle here', author_type:'human', created_at: new Date().toISOString(), edited_at: null }] });
    const resolvedMatch = makeThread({ id: 'rm', status: 'resolved', replies: [{ id:'r', body:'needle here', author_type:'human', created_at: new Date().toISOString(), edited_at: null }] });
    idx.rebuild([openMatch, resolvedMatch]);
    const results = idx.query('needle', 'open');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'om');
  });

  // ── deleted threads ───────────────────────────────────────────────

  test('deleted threads never appear in results', () => {
    const active  = makeThread({ id: 'active' });
    const deleted = makeThread({ id: 'deleted', deleted_at: new Date().toISOString() });
    idx.rebuild([active, deleted]);
    // Even though we search for the word that's in deleted's body
    const all = idx.query('');
    assert.ok(all.every(t => t.id !== 'deleted'));
  });

  // ── upsert ───────────────────────────────────────────────────────

  test('upsert adds a new thread to the index', () => {
    idx.rebuild([]);
    const t = makeThread({ id: 'new' });
    idx.upsert(t);
    assert.strictEqual(idx.query('').length, 1);
  });

  test('upsert updates an existing entry', () => {
    const t = makeThread({ id: 'upd', replies: [{
      id: 'r', body: 'original text', author_type: 'human',
      created_at: new Date().toISOString(), edited_at: null,
    }]});
    idx.rebuild([t]);

    // Mutate the thread and upsert
    const updated: Thread = {
      ...t,
      replies: [{ ...t.replies[0], body: 'updated text' }],
    };
    idx.upsert(updated);

    assert.strictEqual(idx.query('updated').length, 1);
    assert.strictEqual(idx.query('original').length, 0);
  });

  test('upsert with deleted_at removes entry', () => {
    const t = makeThread({ id: 'gone' });
    idx.rebuild([t]);
    assert.strictEqual(idx.query('').length, 1);

    idx.upsert({ ...t, deleted_at: new Date().toISOString() });
    assert.strictEqual(idx.query('').length, 0);
  });

  // ── remove ───────────────────────────────────────────────────────

  test('remove deletes the entry from results', () => {
    const t1 = makeThread({ id: 'keep' });
    const t2 = makeThread({ id: 'drop' });
    idx.rebuild([t1, t2]);
    idx.remove('drop');
    const results = idx.query('');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'keep');
  });

  test('remove on unknown id is a no-op', () => {
    const t = makeThread({ id: 'only' });
    idx.rebuild([t]);
    idx.remove('does-not-exist');
    assert.strictEqual(idx.query('').length, 1);
  });
});
