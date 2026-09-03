# Provider plugins

This directory contains one plugin per AI coding client. Each provider keeps its
own manifest and assets in its own subdirectory so that adding a provider never
disturbs the others.

| Provider | Manifest | MCP file | Transport |
| --- | --- | --- | --- |
| Cursor | `providers/cursor/plugin/.cursor-plugin/plugin.json` | `mcp.json` | `http` |
| Grok Build | `providers/grok/plugin/.grok-plugin/plugin.json` | `.mcp.json` (dotted) | `http` |
| Agent Plugins (open standard) | `providers/agent-plugins/plugin/plugin.json` | `mcp.json` | `streamable-http` |

All three implement the same lineage — the
[Agent Plugins 1.0.0 schemas](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json) —
but they are **separate products with separate marketplaces and separate reviews**.
The MCP filename and the transport string differ between them. Do not rename or
normalise them to match: a dotted `.mcp.json` under Cursor, or `http` where a
client expects `streamable-http`, is silently ignored.

## Skills

**Do not edit skill files under `providers/*/plugin/skills/` by hand.**

Cursor is the authoring provider. Every other provider's `skills/` directory is
generated from it by `scripts/sync-providers.mjs`, and manual edits there are
overwritten on the next sync.

Skills are grounded in the published documentation at <https://docs.y.uno>.
When a skill states a version, an endpoint, a field name, or a status value,
that claim must be traceable to a documentation page listed in the skill's
`## Sources` section. Never copy a doc into a skill and let it drift — link it.
