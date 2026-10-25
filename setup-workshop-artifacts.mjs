#!/usr/bin/env node
/**
 * Immersive Experience: deterministic GitHub Issue / PR preparation.
 * Requirements: Node.js 22+, Git, an existing GitHub repository and API-capable
 * GitHub credentials (GITHUB_TOKEN / GH_TOKEN, gh auth, or Git credential helper).
 * No Copilot CLI, npm installation, or other JavaScript packages are required.
 *
 * From the repository root:
 *   node setup-workshop-artifacts.mjs --dry-run
 *   node setup-workshop-artifacts.mjs
 *
 * See --help for options. Never commit access tokens to the repository.
 */

import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const yes = args.has('--yes');

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage: node setup-workshop-artifacts.mjs [--dry-run] [--yes]

--dry-run  Inspect repository and show planned actions; create nothing.
--yes      Skip the interactive confirmation (for controlled automation).

Run from the repository root after setup-immersive-repo.sh.
Requires repository Issues and PR permissions, but NOT Copilot CLI.`);
  process.exit(0);
}

if ([...args].some(a => !['--dry-run', '--yes'].includes(a))) {
  console.error('Unknown option. Run with --help.');
  process.exit(2);
}

function git(...a) {
  return execFileSync('git', a, {
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function tryCommand(cmd, argv, options = {}) {
  try {
    return execFileSync(cmd, argv, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch {
    return '';
  }
}

function remoteRepo() {
  const url = git('remote', 'get-url', 'origin');
  const m = url.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/
  );

  if (!m) {
    throw new Error(
      `Expected a github.com repository as 'origin'; found: ${url}`
    );
  }

  const [, owner, repo] = m;

  if (owner.toLowerCase() === 'copilot-academy') {
    throw new Error(
      'Refusing to create artifacts in the original Copilot Academy source repository.'
    );
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`
  };
}

function findToken() {
  // Environment variables take precedence.
  if (process.env.GH_TOKEN) {
    return { token: process.env.GH_TOKEN, from: 'GH_TOKEN' };
  }

  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, from: 'GITHUB_TOKEN' };
  }

  // GitHub CLI (gh) is NOT GitHub Copilot CLI.
  // This is optional and not required.
  const gh = tryCommand('gh', ['auth', 'token']);

  if (gh) {
    return {
      token: gh,
      from: 'GitHub CLI authentication'
    };
  }

  // Reuse cached HTTPS credentials if available.
  // Disable interactive prompts to prevent hanging.
  const cred = tryCommand('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never'
    }
  });

  const p = cred
    .split(/\r?\n/)
    .find(line => line.startsWith('password='));

  if (p) {
    return {
      token: p.slice('password='.length),
      from: 'Git credential helper'
    };
  }

  return null;
}

const API = 'https://api.github.com';
let auth = null;

async function api(method, path, body) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'immersive-workshop-artifact-setup',
    ...(auth ? {
      Authorization: `Bearer ${auth.token}`
    } : {}),
    ...(body ? {
      'Content-Type': 'application/json'
    } : {})
  };

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details =
      typeof payload.message === 'string'
        ? payload.message
        : 'Unexpected response';

    const explanation =
      response.status === 403
        ? 'Check repository Issues/Pull requests write permissions and enterprise token policies.'
        : response.status === 401
          ? 'Authentication failed; check your GitHub credentials.'
          : '';

    throw new Error(
      `${method} ${path}: HTTP ${response.status} — ${details}. ${explanation}`.trim()
    );
  }

  return payload;
}

async function paged(path) {
  const items = [];

  for (let page = 1; page <= 20; page++) {
    const separator = path.includes('?') ? '&' : '?';

    const chunk = await api(
      'GET',
      `${path}${separator}per_page=100&page=${page}`
    );

    if (!Array.isArray(chunk)) {
      throw new Error('Expected a GitHub API list.');
    }

    items.push(...chunk);

    if (chunk.length < 100) {
      return items;
    }
  }

  throw new Error(
    'Too many existing artifacts; stopping rather than risking duplicate creation.'
  );
}

// ============================================================
// GITHUB ISSUES
// ============================================================

const issues = [
  {
    title: 'Improve test coverage for API',
    body: `## Summary
Improve test coverage across the existing Express API, including routes, malformed input, error paths, and database failures.

## Scope
- Cover uncovered routes under \`api/src/routes/\`, including supplier, product, order, order detail, order-detail delivery, delivery, and headquarters; extend branch tests as needed.
- Assert appropriate status codes and response bodies for supported GET/POST/PUT/DELETE paths.
- Cover nonexistent IDs, invalid IDs, missing fields, incorrect types, malformed JSON, and empty request bodies.
- Exercise database connection/query failures and verify server errors do not disclose internal details.
- Include repository-layer tests where useful.

## Implementation guidance
- Follow existing Vitest + Supertest patterns and use an isolated SQLite database or mocks.
- Review \`.github/instructions/api.instructions.md\` and existing test conventions before changing code.
- Keep production code changes minimal and explain any that are necessary.

## Acceptance criteria
- Automated tests cover the requested success and failure paths.
- Existing tests remain passing.
- \`make test-coverage\` is the validation command; report its result and any measured coverage improvement.
- Implement this work in an isolated agent/work branch; open a separate PR, without modifying existing workshop feature branches.
`,
  },
  {
    title: 'Add BDD test coverage for shopping cart',
    body: `## Summary
Add executable behavior-driven (BDD) test coverage for the existing shopping cart feature.

## Starting point
- **Base your work on \`feature-add-cart-page\`**, which contains the cart implementation.
- **Create a separate working branch or isolated agent session** and open a PR targeting \`feature-add-cart-page\`; do not commit tests directly to the cart feature branch or change its existing PR.
- When delegating, use the repository's \`.github/agents/bdd-specialist.agent.md\` custom agent, if available.

## Behaviors to cover
- Adding one or more products, including repeated additions.
- Removing items, including empty-cart behavior.
- Increasing and decreasing quantities and appropriate edge cases.
- Navigation cart badge counts as cart contents change.
- Line totals and cart subtotal calculations.

## Testing framework: assess before choosing
The frontend has Playwright tests and some Gherkin \`.feature\` files, but may not yet have an executable BDD runner. Inspect existing configuration first, then choose and configure a suitable runner only if necessary. Favor existing conventions and avoid duplicate test infrastructure.

## Acceptance criteria
- Clear Given/When/Then scenarios are executable with bound step definitions; no pending steps.
- A documented command runs the BDD suite, with any browser/runtime prerequisites identified.
- Tests use robust accessible selectors or minimal test IDs.
- Document validation outcomes and any existing application defects discovered. Do not silently mask or fix unrelated cart behavior.
- Existing test suites remain passing, or failures are clearly reported.
- Open a separate PR with test changes, leaving the original cart PR available for the Code Review exercise.
`,
  },
];

// ============================================================
// GITHUB PULL REQUESTS
// ============================================================

const prs = [
  {
    title: 'Add Terms of Service Download',
    head: 'feature-add-tos-download',
    base: 'main',
    body: `## Summary
Adds downloadable Terms of Service documents in English and German.

## Changes
- New API legal route for localized Terms of Service PDF documents and supporting model/repository code.
- Frontend TermsDownload component, linked through the footer and application routes.

## Workshop purpose
Prepared, **unmerged** feature PR for Exercise 3 — Consistent Standards. Review and customization are intentionally left for the exercise.
`,
  },
  {
    title: 'Add Shopping Cart Feature',
    head: 'feature-add-cart-page',
    base: 'main',
    body: `## Summary
Adds a shopping cart to the demo storefront.

## Changes
- CartContext and associated cart/storage integration.
- Cart page and item quantity/remove controls.
- Navbar cart icon and item-count badge.
- Add-to-cart functionality on the Products page.

## Workshop purpose
Prepared, **unmerged** feature PR for Exercise 5 — Code Review. Known defects and validation findings are intentionally left for participants to investigate; do not preemptively repair or review them as part of setup.
`,
  },
];

// ============================================================
// WORKSHOP ARTIFACT SETUP
// ============================================================

async function main() {
  const repo = remoteRepo();

  console.log(`\nWorkshop target: ${repo.fullName}`);
  console.log(
    `Mode: ${dryRun ? 'DRY RUN — no changes' : 'prepare Issues and PRs'}`
  );

  auth = findToken();

  if (!auth && !dryRun) {
    throw new Error(
      'No GitHub API credential found. Git push access alone may not provide API access.\n' +
      'Use an approved GitHub token with Issues and Pull requests write permissions ' +
      '(GH_TOKEN/GITHUB_TOKEN), or authenticate with optional GitHub CLI: gh auth login. ' +
      'Copilot CLI is NOT required.'
    );
  }

  if (auth) {
    console.log(
      `Authentication: ${auth.from} (token not displayed)`
    );
  } else {
    console.log(
      'Authentication: none; read-only public-repository inspection'
    );
  }

  // Verify target repository.
  const {
    full_name: canonical,
    permissions
  } = await api('GET', `/repos/${repo.fullName}`);

  if (canonical?.toLowerCase() !== repo.fullName.toLowerCase()) {
    throw new Error(
      `GitHub returned unexpected repository: ${canonical}`
    );
  }

  if (
    !dryRun &&
    permissions &&
    !permissions.push &&
    !permissions.admin &&
    !permissions.maintain
  ) {
    throw new Error(
      'Authenticated identity does not appear to have write access to this repository.'
    );
  }

  // Verify required remote branches.
  for (const branch of [
    'main',
    'feature-add-tos-download',
    'feature-add-cart-page'
  ]) {
    await api(
      'GET',
      `/repos/${repo.fullName}/branches/${encodeURIComponent(branch)}`
    );
  }

  // Retrieve existing Issues and PRs.
  const [allIssues, allPrs] = await Promise.all([
    paged(`/repos/${repo.fullName}/issues?state=all`),
    paged(`/repos/${repo.fullName}/pulls?state=all`)
  ]);

  // Match Issues by exact title.
  const issuePlans = issues.map(spec => ({
    ...spec,
    existing: allIssues.find(
      i =>
        !i.pull_request &&
        i.title.trim().toLowerCase() === spec.title.toLowerCase()
    )
  }));

  // Match PRs by head and base branches.
  const prPlans = prs.map(spec => ({
    ...spec,
    existing: allPrs.find(
      p =>
        p.head?.ref === spec.head &&
        p.base?.ref === spec.base &&
        p.head?.repo?.full_name?.toLowerCase() ===
          repo.fullName.toLowerCase()
    )
  }));

  // Verify each missing PR has a valid branch comparison.
  for (const pr of prPlans.filter(p => !p.existing)) {
    const compared = await api(
      'GET',
      `/repos/${repo.fullName}/compare/${encodeURIComponent(pr.base)}...${encodeURIComponent(pr.head)}`
    );

    if (!(compared.ahead_by > 0)) {
      throw new Error(
        `Cannot create PR: ${pr.head} has no commits ahead of ${pr.base}.`
      );
    }
  }

  // Do not silently recreate closed or merged workshop artifacts.
  for (const entry of [...issuePlans, ...prPlans]) {
    if (entry.existing && entry.existing.state !== 'open') {
      throw new Error(
        `Existing ${'head' in entry ? 'PR' : 'Issue'} '${entry.title}' is ${entry.existing.state}. Resolve that status manually; no duplicate will be created.`
      );
    }

    if ('head' in entry && entry.existing?.draft) {
      throw new Error(
        `Existing PR '${entry.title}' is a draft. Mark it ready for review first.`
      );
    }
  }

  // Display the planned operations.
  console.log('\nPlanned artifacts:');

  for (const it of issuePlans) {
    const changed =
      it.existing && it.existing.body?.trim() !== it.body.trim();

    console.log(
      `  Issue: ${it.title} — ${
        it.existing
          ? `EXISTS ${it.existing.html_url}${
              changed ? ' (body differs; preserved)' : ''
            }`
          : 'CREATE'
      }`
    );
  }

  for (const it of prPlans) {
    const changed =
      it.existing && it.existing.body?.trim() !== it.body.trim();

    console.log(
      `  PR: ${it.title} (${it.head} -> ${it.base}) — ${
        it.existing
          ? `EXISTS ${it.existing.html_url}${
              changed ? ' (body differs; preserved)' : ''
            }`
          : 'CREATE'
      }`
    );
  }

  // Dry-run mode never creates artifacts.
  if (dryRun) {
    console.log(
      '\nDRY RUN COMPLETE. Nothing was created or modified.'
    );
    return;
  }

  // No work required if everything exists.
  if (
    [...issuePlans, ...prPlans].every(i => i.existing)
  ) {
    console.log(
      '\nCOMPLETE: All four artifacts already exist. No changes made.'
    );
    return;
  }

  // Require confirmation before making changes.
  if (!yes) {
    if (!input.isTTY) {
      throw new Error(
        'Interactive confirmation unavailable. Use --yes only after reviewing --dry-run output.'
      );
    }

    const rl = createInterface({ input, output });
    let answer;

    try {
      answer = await rl.question(
        `\nType ${repo.fullName} to create the missing artifacts: `
      );
    } finally {
      rl.close();
    }

    if (answer.trim() !== repo.fullName) {
      throw new Error(
        'Confirmation mismatch. No changes made.'
      );
    }
  }

  // Create missing Issues.
  for (const it of issuePlans) {
    if (it.existing) continue;

    const created = await api(
      'POST',
      `/repos/${repo.fullName}/issues`,
      {
        title: it.title,
        body: it.body
      }
    );

    console.log(
      `CREATED issue: ${created.html_url}`
    );
  }

  // Create missing Pull Requests.
  for (const it of prPlans) {
    if (it.existing) continue;

    const created = await api(
      'POST',
      `/repos/${repo.fullName}/pulls`,
      {
        title: it.title,
        body: it.body,
        base: it.base,
        head: it.head,
        draft: false
      }
    );

    console.log(
      `CREATED PR: ${created.html_url}`
    );
  }

  console.log(
    `\nSUCCESS: Workshop GitHub artifacts prepared in ${repo.fullName}.`
  );

  console.log(
    'Both PRs should remain open and unmerged for Exercises 3 and 5.'
  );
}

// Run setup and report errors.
main().catch(e => {
  console.error(`\nERROR: ${e.message}`);

  console.error(
    'Nothing is rolled back automatically. Rerun safely after fixing the issue; existing artifacts are skipped.'
  );

  process.exitCode = 1;
});
