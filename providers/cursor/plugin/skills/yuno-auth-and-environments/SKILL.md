---
name: yuno-auth-and-environments
description: >-
  Authoritative guide to Yuno API credentials, the Sandbox/Production split, and the
  confirmation ritual required before any money-moving operation. Use whenever
  authenticating to the Yuno API, choosing or creating API keys, wiring the Yuno MCP
  server, switching between Test Mode and Live Mode, setting up a sandbox, or picking a
  base URL. Use BEFORE creating, authorizing, capturing, cancelling or refunding a
  payment, creating a payment link, creating or cancelling a subscription, creating a
  customer or recipient, or calling any Yuno MCP tool that writes. Also use for key
  rotation, allowed-IP restrictions, leaked or committed credentials, and 3DS or test-card
  setup.
---

# Yuno authentication and environments

## STOP — read this before any write operation

You are running inside an autonomous coding agent that executes multi-step plans without a
human reading every step. The Yuno MCP tools shipped with this plugin can create real
payments, capture and refund real money, and create real customers, subscriptions and
recipients. Yuno Sandbox and Production are the **same product with the same API surface**. Nothing in
a tool call names the environment, so you must establish it before you write.

**Two different transports reach Yuno, and they answer this question differently. Check which
one you are on first — the server URL tells you.**

| You are on | Auth | How the environment is set | Can you see it? |
| --- | --- | --- | --- |
| `mcp-edge.agents.y.uno` — **what this plugin installs** | OAuth 2.1, browser sign-in, no keys anywhere | By the Yuno identity and organization the user signed in as | No. There are no credentials for you to inspect |
| `mcp.prod.y.uno` — the [documented remote server](https://docs.y.uno/docs/ai-capabilities/remote-yuno-mcp-server.md) | `public-api-key` / `private-secret-key` / `account-code` headers | By which pair of keys was configured | Only if you were told which keys |
| The REST API directly | Key headers | By the base URL and the keys | Yes — `api-sandbox.y.uno` is Sandbox |

On this plugin's transport there are **no API keys at all**. Asking "which keys are loaded"
has no answer here, and neither you nor the user can flip an environment switch: the
environment follows the sign-in. That is why the probe below is not a formality — under
OAuth it is the only evidence you can actually gather.

### Required behaviour

1. **Never assume an environment — establish it.** Do not default to Sandbox and do not
   announce one you have not established. On the OAuth transport you have no key to read,
   so a stated default is a guess dressed as a fact, and the user will believe it.
2. **Establish it once per session, before the first write**, by running the checklist
   below. The read-only probe is the primary evidence; the user's own answer about which
   Yuno account they signed in as is the corroboration.
3. **Before every operation that creates, authorizes, captures, refunds or cancels a
   payment, or that creates, updates, deletes or cancels a subscription, payment link,
   installment plan, stored payment method or recipient — say what you established, say how
   you established it, and wait.** State the evidence, never a credential you cannot see:
   > "You are signed in as <user> on the Yuno organization <org>. A read of <resource>
   > returned <what you actually saw>, which indicates **<environment>**. Confirm before I
   > create the payment."
   Never fold a money-moving call into a batch that runs unattended.
4. **If the probe is inconclusive, say so and stop.** "I could not establish the
   environment" is a legitimate outcome and the correct thing to report. Do not substitute
   a guess, and do not proceed because the request seemed low-risk — you cannot judge the
   blast radius of a call whose environment you do not know.
5. **Never write credentials into source files, commits, examples, or chat output.** Use
   environment variables and reference them by name (`process.env.YUNO_PRIVATE_SECRET_KEY`).
   Never paste a real key value into a code sample, a config file you commit, or a README.
   Yuno states it plainly: *"Do not share your secret API keys in public places like GitHub
   or Bitbucket to avoid malicious API calls."*
   ([Authentication](https://docs.y.uno/reference/getting-started/authentication.md))
6. **Refuse to "just test it quickly in production."** Route the user to the Yuno Testing
   Gateway instead (see below). It is sandbox-only by design.
7. **Treat retries as dangerous.** Use `X-Idempotency-Key` and follow the retry rules below;
   a naive retry with a fresh key duplicates a real charge.

---

## The credential model

### Two-tier hierarchy

Yuno issues credentials at two levels
([Developers credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md)):

| Tier | Scope |
| --- | --- |
| **Organization keys** | Grant access to **all accounts** in your organization. Assigned when you register. The broadest credential you can hold. |
| **Account keys** | Scoped to a single account, operating independently between Test and Live modes. |

**Prefer the narrowest credential that does the job.** For work touching one account, use
that account's key. Reach for an organization key only when the task genuinely spans accounts.

### Customized API keys — prefer these

Yuno supports **customized API keys**, created in the Dashboard under **Developers →
Authentication → Customized API keys → Create key**. When creating one you set the key name
and the member who can access it, one or more **accounts** the key is associated with, and
one or more **products** it can reach (subscriptions, payments, installment plans, and more).

**Recommend a customized API key scoped to the minimum accounts and products over a broad
organization key, every time.** This is the closest thing Yuno has to a restricted key, and
the single most effective way to bound what an autonomous agent can do with a leaked or
misused credential.

The key value is **displayed only once at creation** — copy and store it immediately, because
you cannot view it again. If it is lost or must be rotated, **roll (regenerate)** the key,
which invalidates the previous value
([Developers credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md)).

### Request headers

Every Yuno API request requires the `public-api-key` and `private-secret-key` headers. Some
requests additionally take `X-Idempotency-Key`, a UUID unique per request
([Authentication](https://docs.y.uno/reference/getting-started/authentication.md)). Take the
endpoint path from the [API reference](https://docs.y.uno/reference/getting-started/api-reference-overview)
or [openapi.json](https://docs.y.uno/openapi.json) — never guess it.

**Paths in the OpenAPI spec are unversioned; `/v1` lives in the base URL and you must
add it.** The spec lists `/payments`, so the request URL is
`https://api-sandbox.y.uno/v1/payments`. Composing the base URL below with a bare
spec path returns **404** — the same call with `/v1` returns 401, which is the path
existing and asking for auth.

```sh
curl --request POST \
     --url "$YUNO_BASE_URL/v1/<path from the API reference>" \
     --header "public-api-key: $YUNO_PUBLIC_API_KEY" \
     --header "private-secret-key: $YUNO_PRIVATE_SECRET_KEY" \
     --header "X-Idempotency-Key: $(uuidgen)" \
     --header 'content-type: application/json'
```

The `public-api-key` initializes client-side SDKs; the `private-secret-key` is for
server-side calls only and must never reach a browser bundle, a mobile app, or a public
repository
([Set up your account](https://docs.y.uno/docs/how-yuno-works/step-1-set-up-your-account.md)).
Both live at [dashboard.y.uno/developers](https://dashboard.y.uno/developers), and per account
at [dashboard.y.uno/accounts](https://dashboard.y.uno/accounts).

---

## The environment model

### What actually distinguishes test from live

**Yuno maintains separate keys for Test and Live environments.** The documentation is
explicit:

> "Yuno maintains separate keys for Test and Live environments, keeping credentials isolated
> between environments and reducing the risk of accidentally using live credentials in
> testing."
> — [Developers credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md)

> "Sandbox and Production use **different API keys**. The credentials you use in Test Mode
> (Sandbox) are not the same as those for Live Mode (Production). In the dashboard, the keys
> shown depend on which environment you have selected."
> — [API environments](https://docs.y.uno/reference/getting-started/api-environments.md)

**The docs describe no key prefix, no naming convention, and no marker in the key value that
tells you which environment a key belongs to.** Do not invent one and do not pattern-match
on the string. The only reliable way to know a key's environment is to know **which
Dashboard mode it was copied from**. Ask the user; do not guess.

### Base URLs

The REST base URL *does* differ per environment
([API environments](https://docs.y.uno/reference/getting-started/api-environments.md)):

| Environment | Purpose | Base URL |
| --- | --- | --- |
| **Sandbox** | Testing and development. No live data or real transactions. | `https://api-sandbox.y.uno/v1` |
| **Production (US)** | Live. Real transactions and accounting. | `https://api.y.uno/v1` |
| **Production (EMEA)** | Live. Real transactions and accounting. | `https://api.eu.y.uno/v1` |

These are the three `servers` entries in the OpenAPI spec, `/v1` included. The
[API environments](https://docs.y.uno/reference/getting-started/api-environments.md)
page lists the same hosts without the version segment; add it.

For direct REST calls, the URL is a real signal — **read it and report it before acting.**
For MCP tool calls it is not: the MCP server exposes a single endpoint and takes no base-URL
or environment argument, so the credentials remain the only guardrail. Same rule, different
amount of help from the transport.

Yuno enforces a **60-second timeout** on all endpoints.

### Dashboard: Test Mode and Live Mode

One account, one login, one toggle
([Environments](https://docs.y.uno/docs/using-yuno/environments.md)):

- **Test Mode (Sandbox)** — new organizations start "Inactive" with Test Mode access only.
- **Live Mode (Production)** — requires submitting an activation request. Status moves
  "Inactive" → "Under Verification" → active. Test Mode stays available throughout.
- Switch with the **Test mode** toggle. The same username and password work for both.

Two regional dashboards exist: `https://dashboard.y.uno` (US) and
`https://dashboard.eu.y.uno` (EMEA). Organizations and users replicate across regions;
**accounts do not**. A user created via the public API is created in both US and EMEA
regardless of which base URL was called. The Test/Live toggle is separate from the regional
split and does not change your region.

### Verify the environment BEFORE running anything

Run this checklist and report the result to the user before the first write call.

1. **Which transport are you on?** Read the server URL. `mcp-edge.agents.y.uno` means
   OAuth and no keys — skip step 2, the probe is your evidence. `mcp.prod.y.uno` or a REST
   base URL means keys, and `api-sandbox.y.uno` names Sandbox outright.
2. **Keys only — where did they come from?** Ask which Dashboard mode was toggled when the
   user copied them. Nothing in the value itself reveals it; Yuno publishes no prefix
   convention. Skip this step entirely on the OAuth transport.
3. **Read-only probe — on OAuth this is the primary check, not a sanity check.** Before any
   write, issue a read and show the user what came back. Look for signals and name them:
   whether any payments exist at all, whether the amounts and customers look like seeded
   test data, which providers appear, and whether the account or organization identifier
   matches what the user expects. Report what you saw, not what you concluded from a hunch.
4. **Is the Yuno Test Payment Gateway among the providers?** It exists only in Sandbox. Real
   acquirers in the results mean you are not in Sandbox. This is the single strongest signal
   the probe can return.
5. **State the conclusion, cite the evidence, and get confirmation** before proceeding. If
   the evidence was thin, say it was thin.

When the user writes REST or key-based MCP integration code, keep the two environments in
separate env files (`.env.sandbox`, `.env.production`), never one file with commented-out
blocks — a commented-out production key is one uncomment away from a real charge. This does
not apply to the OAuth transport, which has no key file to get wrong.

---

## Testing

### Yuno Test Payment Gateway

The **Yuno Test Payment Gateway** is a connection that simulates card processing. It is
**available only in the sandbox environment and cannot be used in production**. No API keys
or credentials are required to connect it
([Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway.md)).

Setup: Dashboard → **Connections** → **Yuno Test Payment Gateway** → **Connect** and name it.
Then [Routing](https://dashboard.y.uno/routing) → **Not published** → **Card** → **Set Up**:
create a Card route, add conditions (card brand, country), point them at the Yuno Test
Payment Gateway, and set **All other payments** to **Cancel**. Finally
[Checkout builder](https://dashboard.y.uno/checkout-builder) → enable **Card** → **Publish**.

A test payment needs `public-api-key`, `private-secret-key` and `account_id` from the
Dashboard, plus the gateway connected, a route built, and the checkout builder configured.

### Test cards

Test card numbers, expiry dates, security codes and expected response codes are published in
the [Yuno Testing Gateway doc](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway.md#test-card-payments-with-yuno-testing-gateway),
with tables per scheme (Visa, Mastercard, Amex, and others). The **Transaction Response
Code** column defines the payment status the card will return. The Visa set, verbatim from
that page (all use expiry `11/28`, CVV `123`, cardholder `John Doe`):

| Card number | Response |
| --- | --- |
| 4507990000000002 | `SUCCEEDED` |
| 4507990000000010 | `INSUFFICIENT_FUNDS` |
| 4507990000000028 | `DECLINED_BY_BANK` |
| 4507990000000036 | `DO_NOT_HONOR` |
| 4507990000000044 | `INVALID_SECURITY_CODE` |
| 4507990000000051 | `INVALID_CARD_DATA` |
| 4507990000000069 | `REPORTED_STOLEN` |
| 4507990000000077 | `ERROR` |

Other schemes follow the same last-four pattern with different BINs. **Read the doc for the
scheme you need rather than extrapolating** — the mapping is only guaranteed for the numbers
actually listed there.

### 3D Secure

3DS test cards, per scheme, with expected 3DS2 results and 3DS1 VERes/PARes responses, are in
[3DS configuration and testing](https://docs.y.uno/docs/direct-integration-use-cases/3ds-configuration-and-testing.md).
In the preview environment a simulator mocks the Directory Server and Access Control Server,
so both frictionless and challenge outcomes are testable. Challenge flows complete with these
OTP codes, valid for Visa, Mastercard and Amex alike:

| OTP | 3DS2 transaction status | 3DS1 transaction status |
| --- | --- | --- |
| `1234` | `Y` (ECI 01) | `Y` (ECI 05) |
| `1111` | `N` | `N` |
| `2222` | `R` | — |
| `3333` | `U` | — |
| `4444` | `A` | — |

To configure 3DS: connect a 3DS-enabled connection (the Yuno Test Payment Gateway works),
enable the **3D Secure credentials** checkbox and fill in the provider details, add 3DS to
routing, and enable Card in the Checkout Builder. Contact Yuno for test 3DS credentials.

---

## Idempotency — the retry that doubles a charge

`X-Idempotency-Key` is a UUID that must be unique per request. If the first request with a
key created a payment (any status), later requests with that key return **the original
payment** rather than creating a new one, and the retry's body is ignored. Two errors mark
the other outcomes: `400 REQUEST_IN_PROCESS` (still processing — retry with the same key
after a few seconds) and `400 IDEMPOTENCY_DUPLICATED` (the first request failed before a
payment existed — the key is spent, correct the request and use a new one)
([Authentication](https://docs.y.uno/reference/getting-started/authentication.md)).

The rule an autonomous agent must not get wrong: on an unclear outcome — timeout, connection
error, `500`, unparseable response — retry **with the same key**. Use a new key only to start
a genuinely new attempt. **Never retry an unclear failure with a new key**; if the original
actually succeeded, you have just charged the customer twice.

---

## Security hygiene

**Scope note.** Everything in this section is about API keys — rotation, allowed IPs, what
to do when one leaks. It applies to REST integrations, to the key-based MCP server, and to
the Dashboard. It does **not** apply to this plugin's OAuth transport, where there is no key
to roll: if that access is compromised, the response is to revoke the session and the user's
Yuno access, not to regenerate a credential.


**Rotation.** Customized API keys are rolled (regenerated) from the Dashboard; rolling
invalidates the previous key. Because the value is shown only once, rotation means
distributing the new value to every consumer before the old one stops working — plan for a
brief window and update secrets stores first.

**Allowed IPs.** Restrict API access to specific addresses or ranges: Dashboard →
**Developers** → **Authentication** → **List of allowed IPs**. Accepts individual addresses
(`192.168.1.1`) and CIDR ranges (`192.168.1.0/24`), comma/semicolon/space/Enter separated;
requests from addresses outside the list are rejected. Two facts matter: **if no IPs are
added, IPs are not validated by default**, and changes take effect **immediately** — an
incomplete list breaks live payment traffic the moment you save
([Developers credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md)).

**If a key leaks** — committed to git, pasted into a ticket, shipped in a client bundle,
logged — roll it in the Dashboard immediately, then **contact Yuno support**: *"If you
suspect credential exposure or unauthorized access, contact our support team immediately."*
Deploy the new value to every consumer, then constrain the blast radius by tightening allowed
IPs and replacing the broad key with a customized key scoped to the minimum accounts and
products. Purging the commit does not undo the exposure — rotate first, clean history after.

**Account security.** Enable two-factor authentication for your account or enforce it across
the organization, and review passwords periodically. SSO via SAML 2.0 is available. Dashboard
→ profile image → **Security**
([Security](https://docs.y.uno/docs/using-yuno/settings/security.md)).

**Webhooks.** Always use HTTPS endpoints and verify signatures — HMAC or the `x-api-key` /
`x-secret` pair configured on the webhook — so you can trust the events you act on. See the
`yuno-webhooks` skill.

---

## Sources

- https://docs.y.uno/docs/developers.md
- https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md
- https://docs.y.uno/docs/using-yuno/environments.md
- https://docs.y.uno/reference/getting-started/api-environments.md
- https://docs.y.uno/reference/getting-started/authentication.md
- https://docs.y.uno/docs/how-yuno-works/step-1-set-up-your-account.md
- https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway.md
- https://docs.y.uno/docs/direct-integration-use-cases/3ds-configuration-and-testing.md
- https://docs.y.uno/docs/using-yuno/settings/security.md
- https://docs.y.uno/docs/ai-capabilities/remote-yuno-mcp-server.md
- https://docs.y.uno/docs/ai-capabilities/building-ai-integrations-with-yunos-llms-and-mcp.md
