#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { catalog, sets, contractIdentity, catalogErrors, plan, snapshot, hash, checkBundle, summarize } from '../src/core.mjs';

const usage = `Code Crusader — Node 20+, no packages or services

  node bin/assurance.mjs catalog
  node bin/assurance.mjs list --select repository-hygiene [--exclude P-08]
  node bin/assurance.mjs inventory --root PATH
  node bin/assurance.mjs plan --root PATH --files src/a.js,README.md --select P,Q
    --project ID --authorization REF [--mode review|validation]
    [--purpose project-assessment|harness-drill]
    [--features features.json] [--validity-days N --validity-policy REF]
    [--target source|runtime --revision COMMIT --environment NAME --deployment ID]
    [--git-base refs/heads/develop when selected controls require Git]
    [--files-from files.json instead of --files]
  node bin/assurance.mjs fingerprint --root PATH --files-from files.json
  node bin/assurance.mjs check --input bundle.json --root PATH [--evidence-root PATH]
  node bin/assurance.mjs summarize --input bundle.json --root PATH [--evidence-root PATH]
  node bin/assurance.mjs report --input bundle.json --root PATH [--evidence-root PATH]
    [--controls B-02,B-08 or --controls all for an explicit control appendix]
  node bin/assurance.mjs verify --input bundle.json --root PATH --target source|runtime
    --manifest-hash APPROVED_SHA256 [--evidence-root PATH]
  node bin/assurance.mjs inspect-git --root PATH --base refs/heads/develop

JSON goes to stdout; redirect to an approved private file outside the scoped files.
check: 0 = valid records, including incomplete templates. verify: 0 = scoped eligibility.
Exit 1 = invalid, incomplete or unavailable; 2 = usage/input error.
The tool never runs application commands, fetches, installs, cleans up, or releases.
`;
function jsonFile(path) {
  const stat = path && statSync(path);
  if (!stat || !stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('Input missing or too large');
  const bytes = readFileSync(path);
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}
const output = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') process.stdout.write(usage);
  else {
    const allowed = {
      catalog: [], list: ['select', 'exclude'], inventory: ['root'],
      plan: ['root', 'files', 'files-from', 'select', 'exclude', 'project', 'authorization', 'mode', 'purpose', 'features', 'validity-days', 'validity-policy', 'revision', 'environment', 'deployment', 'target', 'git-base'],
      fingerprint: ['root', 'files', 'files-from'],
      check: ['input', 'root', 'evidence-root', 'manifest-hash'], summarize: ['input', 'root', 'evidence-root', 'manifest-hash'],
      report: ['input', 'root', 'evidence-root', 'manifest-hash', 'controls'],
      verify: ['input', 'root', 'evidence-root', 'manifest-hash', 'target'], 'inspect-git': ['root', 'base']
    };
    if (!Object.hasOwn(allowed, command)) throw new Error('Unknown command');
    const flags = Object.create(null);
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      if (!args[i].startsWith('--') || !allowed[command].includes(key) || Object.hasOwn(flags, key)
        || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid arguments');
      flags[key] = args[i + 1];
    }
    const requireFlags = keys => { if (keys.some(key => !flags[key])) throw new Error('Required argument missing'); };
    const split = value => value ? value.split(',') : [];
    const paths = () => {
      if (Boolean(flags.files) === Boolean(flags['files-from'])) throw new Error('Choose one file-list input');
      return flags['files-from'] ? jsonFile(flags['files-from']) : split(flags.files);
    };
    const errors = catalogErrors();
    if (errors.length) { output({ errors }); process.exitCode = 1; }
    else if (command === 'catalog') output({ ...contractIdentity(), controls: catalog.controls.length, modules: catalog.modules.length, sets: Object.keys(sets.sets), errors: [] });
    else if (command === 'inventory') {
      requireFlags(['root']);
      const { trackedFiles } = await import('../src/git.mjs');
      output(trackedFiles(flags.root));
    } else if (command === 'inspect-git') {
      requireFlags(['root', 'base']);
      const { inspectGit } = await import('../src/git.mjs');
      output(inspectGit(flags.root, flags.base));
    } else if (command === 'list') {
      requireFlags(['select']);
      const { select } = await import('../src/core.mjs');
      const ids = select(split(flags.select), split(flags.exclude));
      output(catalog.controls.filter(control => ids.includes(control.id)));
    } else if (command === 'fingerprint') {
      requireFlags(['root']); output(snapshot(flags.root, paths()));
    } else if (command === 'plan') {
      requireFlags(['root', 'select', 'project', 'authorization']);
      output(plan({ root: flags.root, paths: paths(), selectors: split(flags.select), exclusions: split(flags.exclude),
        projectId: flags.project, authorizationRef: flags.authorization, mode: flags.mode, purpose: flags.purpose,
        assessmentTarget: flags.target, gitBase: flags['git-base'],
        features: flags.features ? jsonFile(flags.features) : {},
        validityDays: flags['validity-days'] ? Number(flags['validity-days']) : null,
        validityPolicyRef: flags['validity-policy'] ?? null,
        metadata: { source_revision: flags.revision, environment: flags.environment, deployment: flags.deployment } }));
    } else {
      requireFlags(['input', 'root']);
      if (command === 'verify') requireFlags(['manifest-hash', 'target']);
      if (flags['manifest-hash'] && !/^[a-f0-9]{64}$/.test(flags['manifest-hash'])) throw new Error('Invalid manifest hash');
      if (flags.target && !['source', 'runtime'].includes(flags.target)) throw new Error('Invalid target');
      const bundle = jsonFile(flags.input);
      const errors = checkBundle(bundle, { root: flags.root, evidenceRoot: flags['evidence-root'], expectedManifestHash: flags['manifest-hash'] });
      const eligibilityErrors = [];
      if (command === 'verify' && !errors.length) {
        if (bundle.manifest.assessment_target !== flags.target) eligibilityErrors.push('Requested assessment target mismatch');
        if (bundle.report.gate_recommendation !== 'eligible_for_owner_review') eligibilityErrors.push('Assessment incomplete or not eligible');
      }
      if (command === 'report') {
        const { renderReport } = await import('../src/report.mjs');
        const controlIds = flags.controls === 'all' ? bundle?.report?.assigned_control_ids ?? [] : split(flags.controls);
        process.stdout.write(renderReport(bundle, errors, { controlIds }));
      } else if (command === 'verify') {
        const summary = summarize(bundle, errors);
        summary.verification = { eligible: !errors.length && !eligibilityErrors.length, errors: eligibilityErrors };
        if (eligibilityErrors.length) { summary.assessment_complete = false; summary.gate_recommendation = 'blocked'; }
        output(summary);
      } else if (command === 'summarize') output(summarize(bundle, errors));
      else output({ record_validation: errors.length ? 'invalid' : 'valid', errors,
        manifest_hash: bundle?.manifest ? hash(bundle.manifest) : null,
        meaning: 'This checks records and scoped file freshness, not evidence truth or release readiness.' });
      if (errors.length || eligibilityErrors.length) process.exitCode = 1;
    }
  }
} catch (error) {
  const safeMessages = ['Unknown command', 'Invalid arguments', 'Required argument missing', 'Choose one file-list input',
    'Unknown selector', 'Empty selection', 'Unknown feature key', 'Features must be an object', 'Invalid manifest hash', 'Invalid target',
    'Git observation unavailable', 'An explicit full base ref is required', 'Git observation exceeded its time budget', 'Git branch limit exceeded',
    'Git state changed during observation', 'Git filter limit exceeded', 'Select the exact Git working-tree root', 'Control appendix outside frozen scope'];
  const detail = safeMessages.includes(error.message) || error.message?.startsWith('Invalid planning contract: ') ? error.message
    : 'Malformed input, unsafe path, or unavailable file/executable. Raw inputs withheld.';
  process.stderr.write('Unable to process command: ' + detail + ' Run help for usage.\n');
  process.exitCode = 2;
}
