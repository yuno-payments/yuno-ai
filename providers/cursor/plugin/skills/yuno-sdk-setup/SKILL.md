---
name: yuno-sdk-setup
description: >-
  Guides correct installation, initialization, and version upgrades of Yuno's
  client SDKs (Web, iOS, Android, Flutter, React Native), the Yuno MCP server,
  and the Yuno Agent Toolkit, plus generating an API client from Yuno's OpenAPI
  spec. Use when the developer says "add Yuno to my app", "install the Yuno
  SDK", "set up Yuno checkout", "initialize Yuno", "Yuno.initialize", "mount
  checkout", "startCheckout", "@yuno-payments/sdk-web", "YunoSDK", "com.yuno.payments",
  "yuno pub add", "Yuno React Native", "which Yuno SDK version", "upgrade the
  Yuno SDK", "Yuno breaking change", "Yuno OpenAPI", "generate a Yuno client",
  "Yuno MCP server", or "Yuno agent toolkit". Also use before writing any Yuno
  integration code, to confirm the package name and version rather than guessing.
---

# Yuno SDK setup and upgrades

Yuno is a payment orchestration platform. Your integration has two halves:

1. **A client SDK** that collects payment data and returns a **one-time token (OTT)**.
   Yuno ships client SDKs only: Web, iOS, Android, Flutter, React Native.
2. **Your backend**, calling the Yuno REST API to create a checkout session and a
   payment. There is **no official Yuno server-side SDK** — see [No server SDK](#no-server-side-sdk).

Never send raw card data from your own server unless you are PCI DSS compliant
(that is the `DIRECT` workflow). The default path is SDK → OTT → your backend.

## Pick an integration type

| Type | Who renders the UI | Docs |
| --- | --- | --- |
| Seamless / Full checkout | Yuno (pre-built UI) | [quickstart](https://docs.y.uno/docs/sdks/overview/quickstart.md) |
| Lite | You pick the payment method, Yuno renders the form | [choose-integration](https://docs.y.uno/docs/sdks/overview/choose-integration.md) |
| Headless | You build everything; SDK only tokenizes | [headless-web](https://docs.y.uno/docs/sdks/headless-web/payment.md) |
| Secure Fields | Your own form, Yuno-hosted fields (Web only) | [secure-fields](https://docs.y.uno/docs/sdks/customization/secure-fields/index.md) |

Default to Seamless unless UI control is explicitly needed: Headless makes the
integrator responsible for 3DS transitions and fraud data collection.

## Environments and credentials

| Environment | Base URL |
| --- | --- |
| Sandbox | `https://api-sandbox.y.uno` |
| Production (US) | `https://api.y.uno` |
| Production (EMEA) | `https://api.eu.y.uno` |

Sandbox and production use **different API keys**. Every REST call needs the
`public-api-key` and `private-secret-key` headers; all endpoints have a
**60-second timeout**.
Source: [api-environments](https://docs.y.uno/reference/getting-started/api-environments.md),
[authentication](https://docs.y.uno/reference/getting-started/authentication.md).

Only the **public** API key belongs in client code. The private secret key is
backend-only.

## Web

```bash
npm install @yuno-payments/sdk-web
```

Or via CDN — note the CDN path pins a **major.minor line**, not a patch:

```html
<script src="https://sdk-web.y.uno/v1.10/main.js"></script>
```

```javascript
import { Yuno } from '@yuno-payments/sdk-web';

const yuno = await Yuno.initialize('YOUR_PUBLIC_API_KEY');

// Your backend calls POST https://api-sandbox.y.uno/v1/checkout/sessions with
// { country, customer_payer: { id }, amount: { currency, value } }
const session = await fetch('/api/create-session', { method: 'POST' }).then((r) => r.json());

await yuno.startCheckout({
  checkoutSession: session.checkout_session,
  elementSelector: '#payment-form',
  countryCode: 'US',
  async yunoCreatePayment(oneTimeToken) {
    // Your backend calls POST https://api-sandbox.y.uno/v1/payments with
    // { payment_method: { token: oneTimeToken }, checkout: { session } }
    await fetch('/api/process-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ one_time_token: oneTimeToken, checkout_session: session.checkout_session }),
    }).then((r) => r.json());

    // Required whenever the payment response has sdk_action_required: true
    await yuno.continuePayment();
  },
});

await yuno.mountCheckout();
```

Trigger the flow with `await yuno.startPayment()`.
Full parameter list: [Web reference](https://docs.y.uno/docs/sdks/resources/references/web.md).

## iOS

CocoaPods and Swift Package Manager both work:

```ruby
pod 'YunoSDK'
```

```swift
dependencies: [
    .package(url: "https://github.com/yuno-payments/yuno-sdk-ios", from: "2.23.1")
]
```

```swift
import YunoSDK

Yuno.initialize(apiKey: "YOUR_PUBLIC_API_KEY", config: YunoConfig())
```

Implement `YunoPaymentDelegate`: supply `checkoutSession`, `countryCode`, and
`viewController`; handle `yunoCreatePayment(with:)` by calling your backend then
`Yuno.continuePayment()`; read the outcome in `yunoPaymentResult(_:)`.
See [iOS payments](https://docs.y.uno/docs/sdks/seamless-sdk/ios-payments.md) and,
on Swift 6, [concurrency](https://docs.y.uno/docs/sdks/resources/swift-6-concurrency.md).

## Android

```kotlin
repositories {
    maven { url "https://yunopayments.jfrog.io/artifactory/snapshots-libs-release" }
}

dependencies {
    implementation 'com.yuno.payments:android-sdk:2.22.0'
}
```

Initialize in your `Application` subclass. See
[Android payments](https://docs.y.uno/docs/sdks/seamless-sdk/android-payments.md)
and [Android reference](https://docs.y.uno/docs/sdks/resources/references/android.md).

## Flutter

```bash
flutter pub add yuno
```

Requires `FlutterFragmentActivity` for `MainActivity`, Android `minSdkVersion` 21+,
iOS 14.0+, and the same JFrog maven repository in `android/build.gradle`.
See [Flutter](https://docs.y.uno/docs/sdks/additional-platforms/flutter.md).

## React Native

```bash
npm install @yuno-payments/yuno-sdk-react-native
cd ios && pod install
```

```typescript
import { YunoSdk } from '@yuno-payments/yuno-sdk-react-native';

YunoSdk.initialize({ apiKey: 'YOUR_PUBLIC_API_KEY', countryCode: 'US' });
```

Requires react-native 0.70+, Node.js 16+, Android minSdk 21, iOS 14.0+.
TypeScript definitions ship with the package.
See [React Native SDK](https://docs.y.uno/docs/sdks/additional-platforms/react-native/index.md).

## No server-side SDK

Yuno publishes **no** official Python, Node, Java, Go, PHP, Ruby, or .NET server
SDK — the docs index lists client SDKs only. Integrate the backend one of two ways:

**Generate a client from the OpenAPI 3.1 spec:**

- JSON: `https://docs.y.uno/openapi.json`
- YAML: `https://docs.y.uno/openapi.yaml`

```bash
npx @openapitools/openapi-generator-cli generate \
  -i https://docs.y.uno/openapi.json \
  -g python \
  -o ./yuno-client
```

**Or call the REST API directly:**

Generate a fresh `X-Idempotency-Key` per request — never reuse a literal. Yuno
returns the *first* response for a repeated key, so a copy-pasted constant makes
every later call replay the first payment instead of creating a new one.

```bash
curl -X POST https://api-sandbox.y.uno/v1/payments \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -H 'content-type: application/json' \
  -H 'public-api-key: YOUR_PUBLIC_API_KEY' \
  -H 'private-secret-key: YOUR_PRIVATE_SECRET_KEY' \
  -d '{"payment_method":{"token":"OTT"},"checkout":{"session":"SESSION_ID"}}'
```

Source: [developer resources](https://docs.y.uno/docs/developers.md).

## MCP server and Agent Toolkit

Use these when the agent itself should **call** Yuno (create customers, payments,
subscriptions), not when a human is hand-writing a checkout integration.

**Local MCP server** — for Cursor, Claude Desktop, and other MCP clients:

```json
{
  "mcpServers": {
    "yuno-mcp": {
      "command": "npx",
      "args": ["@yuno-payments/yuno-mcp@latest"],
      "env": {
        "YUNO_ACCOUNT_CODE": "your_account_code",
        "YUNO_PUBLIC_API_KEY": "your_public_api_key",
        "YUNO_PRIVATE_SECRET_KEY": "your_private_secret_key"
      }
    }
  }
}
```

`YUNO_COUNTRY_CODE` and `YUNO_CURRENCY` are optional. Tools include
`customer.create`, `payments.create`, `payments.refund`, `subscriptions.create`,
and `documentation.read`.
Source: [building AI integrations](https://docs.y.uno/docs/ai-capabilities/building-ai-integrations-with-yunos-llms-and-mcp.md).

**Remote MCP server** — hosted, for centralized auth and policy:

```json
{
  "mcpServers": {
    "Yuno": {
      "transport": "http",
      "url": "https://mcp.prod.y.uno/mcp",
      "headers": {
        "public-api-key": "<YUNO_PUBLIC_API_KEY>",
        "private-secret-key": "<YUNO_PRIVATE_SECRET_KEY>",
        "account-code": "<YUNO_ACCOUNT_CODE>"
      }
    }
  }
}
```

Sessions are IP-bound, rate-limited to **15 requests per minute**, and expire after
30 minutes idle / 6 hours absolute.
Source: [remote MCP server](https://docs.y.uno/docs/ai-capabilities/remote-yuno-mcp-server.md).

**Agent Toolkit** — function calling for Vercel AI SDK, Genkit, LangChain, OpenAI
Chat, and OpenAI Agents SDK. Node.js 18+.

```bash
npm install @yuno-payments/agent-toolkit
```

```typescript
import { createYunoAgentToolkit } from '@yuno-payments/agent-toolkit/ai-sdk';

const toolkit = await createYunoAgentToolkit({
  accountCode: process.env.YUNO_ACCOUNT_CODE!,
  publicApiKey: process.env.YUNO_PUBLIC_API_KEY!,
  privateSecretKey: process.env.YUNO_PRIVATE_SECRET_KEY!,
  actions: { customers: { create: true }, payments: { retrieve: true, refund: true } },
});
```

**Each adapter exports its own factory — the symbol is not shared.** Swapping only
the import path fails for four of the five frameworks:

| Adapter | Export |
| --- | --- |
| `/ai-sdk` | `createYunoAgentToolkit` |
| `/genkit` | `createYunoGenkitToolkit` |
| `/langchain` | `YunoLangChainToolkit.create(...)` — a static method, not a function |
| `/openai` | `createYunoOpenAIToolkit` |
| `/openai-agents` | `createYunoOpenAIAgentsToolkit` |

Always `await toolkit.close()`. Restrict `actions` to what the agent needs —
`ALL_TOOLS_ENABLED` grants everything.
Source: [agent toolkit](https://docs.y.uno/docs/ai-capabilities/agent-toolkit.md).

**Maturity.** The Agent Toolkit is pre-1.0: `latest` is `0.1.2` with four
published versions. Treat its API as unstable, pin an exact version rather than a
caret range, and prefer the hosted MCP server for anything that must keep working
across upgrades.

## VERSIONS

Last verified: **2026-09-03**. Regenerate this table by re-reading each source.

| Component | Package / coordinate | Version | Verified from |
| --- | --- | --- | --- |
| Web SDK (npm) | `@yuno-payments/sdk-web` | `8.4.0` | npm `latest` dist-tag |
| Web SDK (docs line) | CDN `https://sdk-web.y.uno/v1.10/main.js` | `v1.10.12` (2026-09-02) | [changelog/web](https://docs.y.uno/changelog/web.md) |
| iOS SDK | `YunoSDK` (CocoaPods) / `yuno-payments/yuno-sdk-ios` (SPM) | `2.23.1` (2026-08-27) | [changelog/ios](https://docs.y.uno/changelog/ios.md); git tag `2.23.1` |
| Android SDK | `com.yuno.payments:android-sdk` | `2.22.0` (2026-08-24) | [changelog/android](https://docs.y.uno/changelog/android.md) |
| Flutter SDK | `yuno` (pub.dev) | `1.0.19` | [changelog/flutter](https://docs.y.uno/changelog/flutter.md); pub.dev API |
| React Native SDK | `@yuno-payments/yuno-sdk-react-native` | `1.4.0` (2026-08-14) | [changelog/react-native](https://docs.y.uno/changelog/react-native.md); npm |
| MCP server | `@yuno-payments/yuno-mcp` | `1.5.5` | npm `latest` dist-tag |
| Agent Toolkit | `@yuno-payments/agent-toolkit` | `0.1.2` | npm `latest` dist-tag |
| REST API | path-versioned `/v1/...` | `v1` | [api-environments](https://docs.y.uno/reference/getting-started/api-environments.md) |
| OpenAPI spec | `https://docs.y.uno/openapi.json` | OpenAPI `3.1` | [developers](https://docs.y.uno/docs/developers.md) |

**Two traps in this table.**

1. The **Web SDK npm version and the documented Web SDK version are different
   number lines.** npm `@yuno-payments/sdk-web` is at `8.4.0`; the changelog and
   CDN path track `v1.10.x`. Do not "correct" one to the other and do not
   assume `8.4.0` maps to `v1.10.12`. Check both sources.
2. The **quickstart pins stale mobile versions** — it shows `pod 'YunoSDK', '~> 2.11.1'`
   and `android-sdk:2.9.0`, while the changelogs are at `2.23.1` and `2.22.0`.
   Treat the per-platform changelog as authoritative for versions.

Yuno does **not** publish a dated API version header (no Stripe-style
`2026-09-03` pin). The REST API is versioned only by the `/v1` path segment, so
there is no API version to pin in a config file.

## Upgrade guidance

**Detect an old version:**

```bash
npm ls @yuno-payments/sdk-web @yuno-payments/yuno-sdk-react-native
npm outdated @yuno-payments/sdk-web
pod outdated | grep -i yuno              # iOS
./gradlew dependencies | grep yuno       # Android
flutter pub outdated | grep '^yuno'      # Flutter
```

For the Web CDN build, read the version out of the `<script src>` — a hardcoded
`v1.9` or lower is stale. Grep the repo for `sdk-web.y.uno` to find pinned URLs.

**Before upgrading, check in this order:**

1. The platform changelog for `BREAKING` entries between your version and the target.
2. The [migration guides](https://docs.y.uno/changelog/index.md) — Web has explicit
   ones for v1.4→v1.5, v1.1→v1.2, and v1.0→v1.1.
3. Callback signatures. Real example: Android `2.22.0` added a `StatusMessage?`
   parameter to `callbackPaymentState` / `callbackEnrollmentState` and to
   `returnStatus` overrides — a compile break you must fix, though reading the
   message is optional.
4. On Flutter and React Native, the **native** iOS/Android SDK versions bump
   underneath you. Flutter `1.0.19` pulls Android `2.22.0` and iOS `2.23.1`;
   React Native `1.4.0` pulls iOS `2.22.0` and Android `2.21.1`. A native-only
   fix may require a wrapper release, not a direct native bump.

**Upgrade order:** bump in sandbox first, re-run the [test cards](https://docs.y.uno/docs/sdks/overview/quickstart.md)
including a 3DS challenge, and only then promote. Client SDK upgrades do not
require backend changes, because the REST API stays on `/v1`.

## Sources

Docs (each read as its `.md` twin):
`docs/developers`, `llms.txt`, `docs/sdks/overview/quickstart`,
`docs/sdks/overview/choose-integration`, `docs/sdks/seamless-sdk/{web,ios,android}-payments`,
`docs/sdks/additional-platforms/flutter`, `docs/sdks/additional-platforms/react-native/index`,
`docs/sdks/resources/references/web`, `docs/how-yuno-works/step-2-your-first-payment`,
`changelog/{web,ios,android,flutter,react-native}`,
`changelog/migration-guides/web/v1-4-to-v1-5`,
`reference/getting-started/{authentication,api-environments}`,
`docs/ai-capabilities/{remote-yuno-mcp-server,agent-toolkit,building-ai-integrations-with-yunos-llms-and-mcp}`
— all under `https://docs.y.uno/`.

Repositories and registries:

- https://github.com/yuno-payments/yuno-mcp (package.json, tags, releases)
- https://github.com/yuno-payments/yuno-sdk-ios (git tags)
- npm: `@yuno-payments/sdk-web`, `@yuno-payments/yuno-mcp`, `@yuno-payments/agent-toolkit`, `@yuno-payments/yuno-sdk-react-native`
- pub.dev: `yuno`
