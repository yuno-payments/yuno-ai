# Security

## Reporting a vulnerability

Report security issues to **security@y.uno**. Do not open a public GitHub issue
for a suspected vulnerability.

## What this repository contains

This repository contains **no server code, no business logic, and no
credentials**. It is a packaging layer: manifests that address Yuno's hosted MCP
endpoint, plus documentation-grounded skills written in Markdown.

The MCP server itself is hosted by Yuno at `https://mcp-edge.agents.y.uno/mcp`
and is not part of this repository. Tool names and schemas are served by that
endpoint at runtime — they are not declared here.

## Authentication

The plugin declares no variables and ships no secrets. Authentication is
OAuth 2.1 with Dynamic Client Registration and PKCE (`S256`), performed by the
client against the endpoint above. No API key or client ID is configured in this
repository, and none should ever be committed to it.

## Operating on real money

The Yuno MCP tools can create and modify real payment resources. The environment
acted upon is determined entirely by the credentials bound to the signed-in
user, and this plugin exposes a single MCP endpoint with no environment
parameter — a tool call does not reveal which environment it reaches. The
`yuno-auth-and-environments` skill instructs the agent to establish the
environment and confirm before any money-moving operation.

That skill is **guidance, not enforcement**. It ships in the agent's context and a
model may ignore it. The server applies no scope restriction of its own: the
advertised OAuth scopes are `openid`, `profile` and `email`, so one issued token
reaches every tool, including `paymentRefund`, `recipientDelete` and
`installmentPlanDelete`. If your organization needs read-only access to Yuno data,
this connector cannot provide it today — contact support@y.uno.

If you believe a plugin skill instructs an agent to do something unsafe, treat
that as a security report and use the address above.
