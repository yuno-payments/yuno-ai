# Contributing

## Ground every claim in the documentation

Skills are read by agents that will act on them. A confidently wrong field name
produces broken integration code and is worse than an omission.

- Every version, endpoint, field name, status value, and error code stated in a
  skill must be traceable to a page listed in that skill's `## Sources` section.
- Link <https://docs.y.uno> rather than copying it. A copy drifts silently.
- If a fact cannot be verified in the docs, omit it or link the page instead of
  asserting it.

## Cursor is the authoring provider

Write skills, commands, and assets under `providers/cursor/plugin/`, then run:

```bash
node scripts/sync-providers.mjs
```

Never hand-edit the generated directories under other providers. To verify that
everything is mirrored:

```bash
node scripts/sync-providers.mjs --check
```

**Nothing enforces this on the server.** The organization blocks
`.github/workflows/`, so there is no CI to catch a hand-edit to a generated
directory — it would merge silently. Enable the local gate once per clone:

```bash
git config core.hooksPath .githooks
```

That runs the sync check and the manifest validator before every commit. Run
both by hand before opening a PR if you skip the hook.

Note that `scripts/validate-plugins.mjs` is Cursor's official validator and
therefore only reads the Cursor provider. A manifest-only error in the Grok or
Agent Plugins manifest — a wrong `version`, a bad `$schema` — is not caught by
either script. Check those two by hand when you touch them.

## Frontmatter

Skills (`skills/<name>/SKILL.md`) require `name` and `description`. The `name`
must match the directory name exactly. Write the `description` so an agent knows
*when* to load the skill: state the task it guides, then list the concrete
phrases a developer would actually type.

Commands (`commands/*.md`) require `name` and `description`.

## Versioning

Bump `version` in every provider's `plugin.json` and in both marketplace
manifests together, and add a `CHANGELOG.md` entry. Published plugins are
re-reviewed on each update.

## Never commit

Credentials of any kind, real payment data, customer PII, or internal endpoints.
This repository is public.
