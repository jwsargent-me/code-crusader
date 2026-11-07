import { spawnSync } from 'node:child_process';
import { realpathSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Fixed Git built-ins only. No shell, fetch, aliases, hooks, external diff, or cleanup.
// This collector emits observations; it does not prove retirement safety or pass controls.
function gitReader(root) {
  const actualRoot = realpathSync.native(resolve(root));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_COUNT: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_PARAMETERS', 'GIT_NAMESPACE']) delete env[name];
  for (const key of Object.keys(env)) if (key.startsWith('GIT_TRACE') || key === 'GIT_CURL_VERBOSE') delete env[key];
  Object.assign(env, { GIT_TRACE: '0', GIT_TRACE2: '0', GIT_TRACE2_EVENT: '0', GIT_TRACE2_PERF: '0' });
  const deadline = Date.now() + 20000;
  const run = (...args) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Git observation exceeded its time budget');
    const result = spawnSync('git', ['--no-lazy-fetch', '--no-replace-objects', '--no-optional-locks', '--no-pager', '-c', 'core.fsmonitor=false', '-C', actualRoot, ...args], {
      encoding: 'utf8', timeout: Math.min(10000, remaining), maxBuffer: 4 * 1024 * 1024,
      env
    });
    if (result.status !== 0 || result.error) throw new Error('Git observation unavailable');
    return result.stdout;
  };
  // Do not let inherited repository-routing variables select another repository.
  const repo = run('rev-parse', '--show-toplevel').trim();
  if (relative(actualRoot, realpathSync.native(repo)) !== '') throw new Error('Select the exact Git working-tree root');
  return { actualRoot, run };
}

export function trackedFiles(root) {
  const { run } = gitReader(root);
  return run('ls-files', '-z').split('\0').filter(Boolean);
}

export function inspectGit(root, base) {
  if (typeof base !== 'string' || !/^refs\/(heads|remotes)\/[A-Za-z0-9_./-]+$/.test(base) || base.includes('..')) throw new Error('An explicit full base ref is required');
  const { actualRoot, run } = gitReader(root);
  const baseOid = run('rev-parse', '--verify', base + '^{commit}').trim();
  const head = run('rev-parse', '--verify', 'HEAD').trim();
  const readRelevantRefs = () => run('for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/remotes', 'refs/tags', 'refs/stash');
  const refState = readRelevantRefs();
  const refs = run('for-each-ref', '--format=%(refname)%00%(objectname)%00%(upstream)%00%(committerdate:iso-strict)', 'refs/heads').trim();
  if (refs.split('\n').length > 256) throw new Error('Git branch limit exceeded');
  const branches = refs ? refs.split('\n').map(line => {
    const [ref, oid, upstream, lastCommitAt] = line.replace(/\r$/, '').split('\0');
    const [baseOnly, branchOnly] = run('rev-list', '--left-right', '--count', baseOid + '...' + oid).trim().split(/\s+/).map(Number);
    let upstreamDivergence = null;
    if (upstream) try {
      const upstreamOid = run('rev-parse', '--verify', upstream + '^{commit}').trim();
      const [ahead, behind] = run('rev-list', '--left-right', '--count', oid + '...' + upstreamOid).trim().split(/\s+/).map(Number);
      upstreamDivergence = { ahead, behind };
    } catch { /* Missing local upstream ref remains unknown. */ }
    return { ref, oid, upstream: upstream || null, last_commit_at: lastCommitAt,
      base_divergence: { base_only: baseOnly, branch_only: branchOnly }, upstream_divergence: upstreamDivergence,
      commits_not_in_local_remote_refs: Number(run('rev-list', '--count', oid, '--not', '--remotes').trim()) };
  }) : [];
  const status = run('status', '--porcelain=v1', '-z', '--untracked-files=normal', '--ignore-submodules=all');
  const worktrees = run('worktree', 'list', '--porcelain', '-z').split('\0').filter(Boolean);
  const stashes = run('stash', 'list', '--format=%H').trim().split(/\r?\n/).filter(Boolean);
  const operations = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']
    .filter(name => existsSync(resolve(actualRoot, run('rev-parse', '--git-path', name).trim())));
  const shallow = run('rev-parse', '--is-shallow-repository').trim() === 'true';
  if (run('rev-parse', '--verify', 'HEAD').trim() !== head
    || readRelevantRefs() !== refState
    || run('for-each-ref', '--format=%(refname)%00%(objectname)%00%(upstream)%00%(committerdate:iso-strict)', 'refs/heads').trim() !== refs
    || run('status', '--porcelain=v1', '-z', '--untracked-files=normal', '--ignore-submodules=all') !== status
    || run('rev-parse', '--verify', base + '^{commit}').trim() !== baseOid) throw new Error('Git state changed during observation');
  return { kind: 'git_observation', captured_at: new Date().toISOString(), root: actualRoot,
    head, base: { ref: base, oid: baseOid }, branches, working_tree_dirty: status.length > 0,
    working_tree_status_hash: createHash('sha256').update(status).digest('hex'), shallow_history: shallow, ref_state: refState,
    worktree_metadata: worktrees, stash_count: stashes.length, in_progress_operations: operations,
    limitations: ['Local refs only; remote-tracking refs may be stale. No fetch or hosted PR/CI query was performed.',
      'Untracked ignored files and unreachable commits are not inventoried. Other worktrees are listed but not inspected.',
      'Reachability and commit counts do not prove patch equivalence, owner intent, PR state, or deletion safety.',
      'Lazy fetching and replacement objects are disabled. Shallow or incomplete object history cannot establish full ancestry.',
      'Only branch, remote, tag and stash refs are fingerprinted. Internal tool/checkpoint namespaces are excluded.',
      'No branch, stash, worktree, or file was changed. No control is automatically passed.'] };
}
