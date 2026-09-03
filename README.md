# Yuno for AI coding agents

Plugins that teach AI coding agents how to integrate [Yuno](https://y.uno) —
correctly, on the first try, without leaving the editor.

Each plugin bundles two things:

- **Skills** — documentation-grounded guidance on payment flows, authentication
  and environments, webhooks, SDK setup, and error handling.
- **The Yuno MCP server** — live access to the Yuno API, the official
  documentation, and your organization's payment data.

| Provider | Install | Status |
| --- | --- | --- |
| Cursor | `/add-plugin yuno` | Pending marketplace review |
| Grok | `/add-plugin yuno` | Pending marketplace review |

## What the agent can do once installed

- Scaffold a Yuno integration that follows the documented patterns instead of a
  guess: customers, checkout sessions, payments, transactions, tokens.
- Verify webhook signatures correctly and make handlers idempotent.
- Explain a declined payment or an unexpected transaction status, and say
  whether it is retryable.
- Search the official Yuno documentation without leaving the chat.
- Answer questions about your own payment data in plain language — approval
  rates, provider performance, conversion.

## Repository layout

```
.cursor-plugin/marketplace.json     Cursor marketplace manifest
.grok-plugin/marketplace.json       Grok marketplace manifest
providers/
  cursor/plugin/                    Cursor plugin (authoring source)
    .cursor-plugin/plugin.json
    mcp.json
    skills/                         the guidance layer
    commands/
    assets/
  grok/plugin/                      generated from the Cursor plugin
    .grok-plugin/plugin.json
    .mcp.json
scripts/sync-providers.mjs          mirrors shared content across providers
```

Cursor is the authoring provider. Everything shared is written there and mirrored
outward — see [`providers/README.md`](providers/README.md).

## What this repository does not contain

No server code, no business logic, no credentials, no tool implementations.

The MCP server is hosted by Yuno at `https://mcp-edge.agents.y.uno/mcp`. Tool
names and schemas are served by that endpoint at runtime and are deliberately not
declared here — the hosted runtime is the source of truth. Adding a tool to the
server surfaces it in every client without changing this repository.

Authentication is OAuth 2.1 with Dynamic Client Registration and PKCE (`S256`).
The plugin declares no variables: there is no API key or client ID to configure,
and none should ever be committed here.

## Working on real money

The Yuno MCP tools can create and modify real payment resources. Which
environment is affected depends entirely on the credentials bound to the
signed-in user. The plugin exposes **a single MCP endpoint with no environment
parameter**, so an agent calling a tool cannot see which environment it acts on —
it can only know by knowing which credentials were bound.

The `yuno-auth-and-environments` skill instructs the agent to establish the
environment and confirm with you before any operation that moves money.

**Be clear about what that is.** It is guidance written into the agent's context —
not a server-side control. A model can ignore it. There is no read-only mode to
fall back on either: the OAuth scopes are `openid`, `profile` and `email`, pure
identity, so a single issued token reaches **all 45 tools**, deletes included.
Approving this connector is all-or-nothing. Treat every session as capable of
moving money, and keep a human in the loop for anything that does.

## Contributing

Skills must be traceable to <https://docs.y.uno>. Every version, endpoint, field
name, and status value stated in a skill belongs in that skill's `## Sources`
section. Link the documentation rather than copying it — a copy drifts, and a
confidently wrong field name is worse than a missing one.

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Support

- Documentation: <https://docs.y.uno>
- Support: <support@y.uno>
- Security: <security@y.uno> — see [`SECURITY.md`](SECURITY.md)

## License

[MIT](LICENSE)
