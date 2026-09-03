---
name: yuno-payment-flows
description: >-
  Guides integration with Yuno's Payments API: the object chain (customer,
  session, payment, transaction), payment and transaction status lifecycles,
  authorization vs capture, cancel and refund semantics, tokenization, and 3D
  Secure. Use when creating a payment, choosing between the SDK checkout,
  a direct server-to-server integration or a payment link, integrating Yuno's
  checkout session, handling authorization and capture, capturing or canceling
  an authorization, issuing a full or partial refund, reading a payment
  `status` / `sub_status`, debugging a PENDING or WAITING_ADDITIONAL_STEP
  payment, working with one-time, vaulted or network tokens, enrolling a
  payment method, or wiring up 3DS challenge redirects.
---

# Yuno payment flows

Yuno is a payment orchestrator: one API in front of many processors. Every claim below
links to the doc that states it. When a fact is not in these docs, check
[the docs index](https://docs.y.uno/llms.txt) instead of guessing.

## API surface

Paths below are relative to the servers declared in the
[OpenAPI spec](https://docs.y.uno/openapi.json), which lists three:

| Environment | Base URL |
| --- | --- |
| Sandbox | `https://api-sandbox.y.uno/v1` |
| Production (US) | `https://api.y.uno/v1` |
| Production (EMEA) | `https://api.eu.y.uno/v1` |

Ask which region the account belongs to rather than defaulting — a US account
pointed at the EMEA host will fail to authenticate, and the two production hosts
are otherwise indistinguishable. See
[API environments](https://docs.y.uno/reference/getting-started/api-environments.md).
Authenticate with the `public-api-key` and `private-secret-key` headers. Mutating
operations (create payment, capture, refund, cancel-or-refund) also require
`X-Idempotency-Key` — always send it, since retries without it can double-charge.

| Operation | Endpoint |
| --- | --- |
| Create customer | `POST /customers` |
| Create customer session (enrollment) | `POST /customers/sessions` |
| Create checkout session | `POST /checkout/sessions` |
| Create / authorize payment | `POST /payments` |
| Retrieve payment by id | `GET /payments/{payment_id}` |
| Retrieve payment by merchant order id | `GET /payments` |
| Capture authorization | `POST /payments/{payment_id}/transactions/{transaction_id}/capture` |
| Cancel authorization | `POST /payments/{payment_id}/transactions/{transaction_id}/cancel` |
| Refund a transaction | `POST /payments/{id}/transactions/{transaction_id}/refund` |
| Cancel **or** refund (Yuno decides) | `POST /payments/{payment_id}/cancel-or-refund` |
| Cancel or refund a given transaction | `POST /payments/{payment_id}/transactions/{transaction_id}/cancel-or-refund` |
| Enroll a payment method (direct) | `POST /customers/{customer_id}/payment-methods` |
| Create payment link | `POST /payment-links` |

## Object chain and order of operations

The canonical sequence is customer -> session -> payment details -> payment, and the
payment then accumulates transactions.
See [Payment flow](https://docs.y.uno/docs/how-yuno-works/how-yuno-payment-flow-works.md).

1. **Create the customer first.** Every payment links to a customer; the response `id`
   is what later steps reference via `customer_payer.id`.
   Supply your own `merchant_customer_id`.
   ([Customers](https://docs.y.uno/docs/basic-concepts/customers.md))
2. **Create a session — only for SDK/Checkout.** A *checkout session* initiates a
   payment; create a new one for every payment. A *customer session* is a different
   object, used to enroll and store payment methods. Both return the payment methods
   enabled in your dashboard.
   ([Sessions](https://docs.y.uno/docs/basic-concepts/sessions.md))
3. **Collect payment details.** The SDK captures sensitive data and returns a one-time
   token. A direct integration collects card data on your own servers, which requires
   PCI compliance.
4. **Create the payment.**

The `workflow` field on `POST /payments` selects the integration style. Enum:
`SDK_CHECKOUT` (default, recommended), `DIRECT` (back-to-back with provider info), and
`REDIRECT` (back-to-back with provider redirection).

Do not create a checkout session for a direct integration — direct payments carry the
transaction details inline. The `checkout` object is required when `workflow` is
`SDK_CHECKOUT` or omitted, and not required for `DIRECT` or `REDIRECT`; when present, it
must contain `checkout.session`. Required top-level fields on create: `account_id`,
`description`, `country`, `merchant_order_id`, `amount`, `payment_method`, `checkout`.

Use a **payment link** when there is no site or app to integrate — it is a shareable
link, created with `POST /payment-links`, with its own status set (see below).

## Payment vs transaction

A **payment** is the order. A **transaction** is one attempt or operation against a
processor. One payment holds many transactions, because routing adds them for fallbacks,
retries, split routing, 3DS, and fraud screening.
([Transactions](https://docs.y.uno/docs/basic-concepts/transactions.md))

**Read `status` and `sub_status` on the payment, not the transactions.** Yuno states this
explicitly: the payment status is the latest state regardless of how many transactions
ran. Use transactions for diagnosis, never as the source of truth for whether you got
paid. ([Payment status reference](https://docs.y.uno/reference/payments/status-and-response-codes/payment.md))

Transaction types: `PURCHASE`, `AUTHORIZE`, `CAPTURE`, `REFUND`, `CANCEL`, `VERIFY`,
`CHARGEBACK`, `THREE_D_SECURE`, `FRAUD_SCREENING`, `SPLIT_TRANSFER`,
`SPLIT_TRANSFER_REVERSE`, `SPLIT_TRANSFER_REVERSAL`.
([Transaction reference](https://docs.y.uno/reference/payments/status-and-response-codes/transaction.md))

`PURCHASE`, `AUTHORIZE` and `VERIFY` are primary transactions — they start the payment.
Everything else is secondary and modifies the outcome of a primary one.

### Payment status lifecycle

Real values, with the substatuses you will actually branch on:

| `status` | `sub_status` values | Meaning |
| --- | --- | --- |
| `CREATED` | `CREATED` | Payment just created. |
| `READY_TO_PAY` | `CREATED` | Waiting for customer action (direct async APMs). Can expire. |
| `PENDING` | `AUTHORIZED`, `IN_PROCESS`, `WAITING_ADDITIONAL_STEP`, `PENDING_PROVIDER_CONFIRMATION`, `PENDING_FRAUD_REVIEW`, `PENDING_OTP_COMPLETION` | Not final. `AUTHORIZED` = card authorized, awaiting capture. |
| `VERIFIED` | `VERIFIED` | Zero-amount card authorization succeeded. |
| `SUCCEEDED` | `APPROVED`, `PARTIALLY_APPROVED`, `CAPTURED`, `PARTIALLY_CAPTURED`, `PARTIALLY_REFUNDED`, `PARTIALLY_CHARGEBACKED`, `FRAUD_DECLINED`, `REFUND_RETRY_IN_PROCESS`, `CAPTURE_RETRY_IN_PROCESS`, `CAPTURE_RETRY_PROCESS_FAILED` | Funds moved. |
| `REFUNDED` | `REFUNDED`, `PENDING_PROVIDER_CONFIRMATION` | Refund succeeded, or still pending at the provider. |
| `CANCELED` | `CANCELED`, `PENDING_PROVIDER_CONFIRMATION` | Authorization voided. |
| `DECLINED` | `DECLINED`, `FRAUD_DECLINED` | Provider or fraud screening declined it. |
| `REJECTED` | `REJECTED` | Rejected by Yuno. |
| `EXPIRED` | `EXPIRED` | Offline method or authorization expired. |
| `IN_DISPUTE` | `RECEIVED`, `PENDING_REVIEW` | Chargeback or inquiry open. |
| `CHARGEBACK` | `LOST` | Funds lost. |
| `ERROR` | `ERROR`, `TIMEOUT`, `PENDING_REVERSE`, `REVERSED_BY_TIMEOUT` | Transversal — can occur at any point. |
| `FRAUD` | `FRAUD_VERIFIED` | Standalone fraud verification passed. |

Two traps in that table. `SUCCEEDED` / `FRAUD_DECLINED` means the payment succeeded and
**funds have moved** even though fraud screening declined — do not treat it as a failure.
And `SUCCEEDED` / `PARTIALLY_CAPTURED` is also emitted when a refund or chargeback
*errored*, meaning the payment remains approved.

Synchronous methods go from `CREATED` straight to a terminal status inside the same API
response, so no webhook is needed. Asynchronous methods pass through `PENDING` and
deliver the final status by webhook — configure webhooks, do not poll on a loop.
([Payment methods](https://docs.y.uno/docs/basic-concepts/payment-methods.md))

## Authorization, capture, cancel, refund

`capture` lives at `payment_method.detail.card.capture` — not at the top level of the
request. ([Cancel and capture flow](https://docs.y.uno/docs/payment-features/Cancel-and-capture-flow.md))

- `capture: true` — single step. Authorization and capture happen together as a purchase.
- `capture: false` — authorization only. You must later capture or cancel it.

Three capture modes:

| Mode | How | Constraint |
| --- | --- | --- |
| Real-time | `capture: true` | Always the full amount. |
| Manual | `capture: false`, then call the capture endpoint | The only mode that can capture an amount different from the authorized one. |
| Delayed | `capture: false` + `delayed_capture_settings.delay` | Full amount only. |

`delayed_capture_settings` and `delayed_cancel_settings` are valid **only** when
`capture = false`; with `capture = true` they must be omitted or `null`. `delay` is an
ISO 8601 duration (`"PT3H"`, `"P7D"`, `"P1M"`). `simplified_mode: true` makes Yuno retry
the scheduled operation on error. Yuno recommends not configuring both delayed settings
at once. Calling capture or cancel before the scheduled time executes immediately and
cancels the scheduled trigger.

**Capture and cancel apply only to payments in `PENDING` status.**
([Capture](https://docs.y.uno/docs/direct-integration-use-cases/capture-payments.md),
[Cancel](https://docs.y.uno/docs/direct-integration-use-cases/cancel-payments.md))
Both need the payment `id` *and* the `transaction_id` from `transaction.id` of the create
response. Leave `amount` empty for a full operation; send it for a partial one.

Expected results:

- Capture: `type = CAPTURE`, `status = SUCCEEDED`, `payment.status = SUCCEEDED`,
  `payment.sub_status = CAPTURED` or `PARTIALLY_CAPTURED`.
- Cancel: `type = CANCEL`, `status = SUCCEEDED`, `payment.status = CANCELED`,
  `payment.sub_status = CANCELED`.
- Refund: `status = REFUNDED`, `sub_status = REFUNDED`, `transaction.type = REFUND`,
  `transaction.status = SUCCEEDED`.

Refunds return funds to the original payment method and can only be created for charges
not yet refunded. Full when `amount` is omitted, partial when it is present.
([Refund](https://docs.y.uno/docs/direct-integration-use-cases/refund-payments.md))

Which `transaction_id` a refund needs depends on how you captured:

- Created and captured in one operation -> use `transaction.id` from the create response.
- Authorized then captured separately -> use the `id` returned by the **capture** call,
  not the authorization's.

Do not run two captures, or two refunds, concurrently on the same payment. Wait for the
in-flight one to finish. If you do not know whether the payment was captured, use
`POST /payments/{payment_id}/cancel-or-refund` — Yuno cancels an uncaptured payment and
refunds a captured one, and it needs no `transaction_id`.

Cancel authorizations you will not capture, promptly: providers enforce time limits on
uncaptured authorizations that vary by provider and region, and the customer's funds stay
held until you release them.

## Tokens and PCI scope

Yuno's tokenization is PCI DSS Level 1; your systems store tokens, never raw card data.
Most merchants using the SDK reduce their scope to SAQ A.
([Tokens](https://docs.y.uno/docs/basic-concepts/tokens.md))

| | One-time token | Vaulted token | Network token |
| --- | --- | --- | --- |
| Created by | Yuno SDK, per checkout session | Yuno on enrollment | Card networks |
| Validity | Single transaction | Until unenrolled | Auto-renewed by the network |
| Cross-processor | No | Yes | Yes |
| Requires enrollment | No | Yes | Applied automatically to enrolled cards |

Use one-time tokens for guest checkout, vaulted tokens for returning customers and
subscriptions, and network tokens for recurring charges where authorization rates matter
(they survive card reissues, cutting involuntary declines).

`vault_on_success: true` converts a successful one-time payment into a vaulted token
without a separate enrollment call — **but only if the payment references an existing
Yuno customer through `customer_payer.id`**. Sending customer data inline does not create
the customer, and no vaulting occurs. The `vaulted_token` comes back only when the payment
reaches `SUCCEEDED`.
([Create payment](https://docs.y.uno/docs/direct-integration-use-cases/create-payment-basic.md))

Enrollment is what creates a vaulted token deliberately. Not every method is enrollable:
cards and several wallets are, while cash and most bank-transfer methods are not.
([Enroll payment methods](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods.md))

## 3D Secure

3DS is configured in the dashboard on the CARD route, not per request — Routing > Card
Routes > 3DS Step. Enabling it changes the payment flow, so handle the extra state before
you turn it on. ([3D Secure](https://docs.y.uno/docs/security-and-compliance/3d-secure.md))

Two outcomes: a **frictionless** flow authenticates in the background, a **challenge**
flow asks the cardholder for a one-time password or biometric check. With the SDK, Yuno
handles the logic. With a direct integration (PCI-compliant merchants only), handle this
state machine explicitly:

1. The payment comes back `PENDING` / `WAITING_ADDITIONAL_STEP`.
2. `sdk_action_required` is `true`.
3. `redirect_url` is set in `payment.payment_method.payment_method_detail.card`.

You are responsible for redirecting the customer to that `redirect_url`. Yuno returns them
to the `callback_url` you supplied at payment creation. The final outcome arrives by
webhook; you can also re-read the payment.

The 3DS transaction has its own statuses: `CREATED` (waiting for the SDK session id),
`PENDING` (challenge required, `redirect_url` returned), `IN_PROCESS` (customer is doing
the challenge), `SUCCEEDED`, `DECLINED` (bank declined the completed challenge), `ERROR`.
Once the 3DS transaction is `SUCCEEDED`, Yuno creates a separate `PURCHASE` transaction to
actually charge the customer — so a successful 3DS is not yet a successful payment.

Authentication results land in
`payment_method.detail.card.card_data.three_d_secure`: `version`,
`electronic_commerce_indicator`, `cryptogram`, `transaction_id`,
`directory_server_transaction_id`, `pares_status`, `acs_id`, `liability_shift`.
`liability_shift` can be `null` even on some successful authentications, so do not treat
`null` as `false` when deciding chargeback exposure.

## Payment link statuses

`CREATED` (active), `USED`, `CANCELED`, `EXPIRED`, `ERROR`.
([Payment link status](https://docs.y.uno/reference/payment-links/status-payment-links.md))

## Traps worth naming

- **Metadata used for routing must be set on the checkout session, not only the payment.**
  Setting it only on the payment object does not activate route logic.
  ([Create payment](https://docs.y.uno/reference/payments/create-payment.md))
- **A new checkout session is required for every payment.** They are not reusable.
- **Capture and cancel need `transaction_id`, not just the payment id** — and the refund
  path takes a *different* transaction id depending on how the payment was captured.
- **Skipping `X-Idempotency-Key`** on create, capture, refund, or cancel-or-refund means a
  network retry can charge twice.
- **Treating `PENDING` as failure.** For async methods it is the normal path; the result
  arrives by webhook.
- **Nothing is configured by code alone.** A payment method needs a connection, a route,
  and (for checkout) the checkout builder set up in the dashboard before it appears.
- **Sandbox card testing needs the Yuno Test Payment Gateway connection enabled.**
- **Reading a transaction status instead of `payment.status` / `payment.sub_status`.**

## Sources

- https://docs.y.uno/docs/how-yuno-works/how-yuno-payment-flow-works.md
- https://docs.y.uno/docs/basic-concepts/customers.md
- https://docs.y.uno/docs/basic-concepts/sessions.md
- https://docs.y.uno/docs/basic-concepts/payments-1.md
- https://docs.y.uno/docs/basic-concepts/transactions.md
- https://docs.y.uno/docs/basic-concepts/tokens.md
- https://docs.y.uno/docs/basic-concepts/payment-methods.md
- https://docs.y.uno/docs/direct-integration-use-cases/create-payment-basic.md
- https://docs.y.uno/docs/direct-integration-use-cases/capture-payments.md
- https://docs.y.uno/docs/direct-integration-use-cases/cancel-payments.md
- https://docs.y.uno/docs/direct-integration-use-cases/refund-payments.md
- https://docs.y.uno/docs/payment-features/Cancel-and-capture-flow.md
- https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods.md
- https://docs.y.uno/docs/security-and-compliance/3d-secure.md
- https://docs.y.uno/reference/payments/create-payment.md
- https://docs.y.uno/reference/payments/authorize-payment.md
- https://docs.y.uno/reference/payments/capture-authorization.md
- https://docs.y.uno/reference/payments/cancel-payment.md
- https://docs.y.uno/reference/payments/refund-payment.md
- https://docs.y.uno/reference/payments/cancel-or-refund-a-payment.md
- https://docs.y.uno/reference/payments/cancel-or-refund-payment-with-transaction.md
- https://docs.y.uno/reference/payments/retrieve-payment-by-id-v2.md
- https://docs.y.uno/reference/payments/retrieve-payment-by-merchant-order-id.md
- https://docs.y.uno/reference/payments/status-and-response-codes/payment.md
- https://docs.y.uno/reference/payments/status-and-response-codes/transaction.md
- https://docs.y.uno/reference/payment-links/status-payment-links.md
- https://docs.y.uno/reference/payment-links/create-payment-link.md
- https://docs.y.uno/reference/checkout-sessions/create-checkout-session.md
- https://docs.y.uno/reference/customer-sessions-enrollment/create-customer-session.md
- https://docs.y.uno/reference/customers/create-customer.md
- https://docs.y.uno/reference/payment-methods-direct-workflow/enroll-payment-method-api.md
