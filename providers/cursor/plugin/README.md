# Yuno

Cursor plugin that helps you build and test a [Yuno](https://y.uno) integration
without leaving the editor — integration best practices, plus Yuno's official
remote [Model Context Protocol](https://modelcontextprotocol.io/) server.

## Install

1. Open **Cursor Settings → Plugins**.
2. Search for **Yuno**.
3. Click **Install**, then complete the Yuno sign-in prompt.

Or run `/add-plugin yuno` in chat.

## MCP

```json
{
  "mcpServers": {
    "yuno": {
      "type": "http",
      "url": "https://mcp-edge.agents.y.uno/mcp"
    }
  }
}
```

Auth is OAuth 2.1 with Dynamic Client Registration and PKCE (`S256`). Cursor
registers itself and prompts for Yuno sign-in when the plugin connects — there is
no API key or client ID to configure.

The hosted runtime is the source of truth for tool names and schemas.

## What agents can do

45 tools in three groups. **The payments tools write:** they create, modify and
delete real resources in whichever Yuno environment your credentials belong to.

| Category | Capabilities | Writes? |
| --- | --- | --- |
| Payments | Create, authorize, capture, cancel and refund payments; checkout sessions; create, retrieve and cancel payment links | **yes** |
| Customers | Create, retrieve and update customers; enroll, retrieve and **unenroll** stored payment methods | **yes** |
| Subscriptions | Create, retrieve, update, pause, resume and cancel subscriptions; create, update and **delete** installment plans | **yes** |
| Recipients | Create, retrieve, update and **delete** payout recipients — these are money-routing destinations | **yes** |
| Documentation | Search and read the official Yuno API documentation; submit feedback to the docs team | submits feedback |
| Analytics | Ask questions about your organization's payment data — approval rates, provider performance, conversion | read-only |

The hosted runtime is the source of truth for the exact tool list and schemas.

## Skills

| Skill | Covers |
| --- | --- |
| `yuno-auth-and-environments` | API keys, test vs live, and the environment confirmation rule |
| `yuno-payment-flows` | Customer, session, payment, and transaction patterns; capture, cancel, refund; tokens; 3DS |
| `yuno-webhooks` | Endpoint setup, HMAC signature verification, idempotency, retries |
| `yuno-sdk-setup` | SDK initialization, the OpenAPI spec, and version upgrade guidance |
| `yuno-errors-and-testing` | Statuses, decline reasons, what is retryable, sandbox and 3DS testing |

## Commands

- `/explain-error` — diagnose a Yuno error, decline, or unexpected status, and
  say whether it is retryable.
- `/test-cards` — surface the documented sandbox test cards and 3DS scenarios,
  after confirming you are in test mode.

## Working on real money

These tools create and modify real payment resources. Which environment is
affected depends entirely on the credentials bound to your Yuno user. **This
plugin exposes a single MCP endpoint with no environment parameter**, so neither
you nor the agent can tell test from live by looking at a tool call.

The `yuno-auth-and-environments` skill instructs the agent to establish the
environment and confirm with you first. Keep it enabled — but know what it is:
context the model is asked to follow, not a control the server enforces. The
OAuth scopes are identity-only (`openid`, `profile`, `email`), so one token
reaches all 45 tools. There is no read-only mode.

## Docs

- Documentation: <https://docs.y.uno>
- Developer resources: <https://docs.y.uno/docs/developers>
- Remote Yuno MCP server: <https://docs.y.uno/docs/ai-capabilities/remote-yuno-mcp-server>
- Support: <support@y.uno>

Logo is Yuno's official isotype (`YUNO_ISO_BLUE_1`), supplied by Yuno: a 1:1 SVG
on the brand background plate, as the marketplace listing expects.

## License

MIT
