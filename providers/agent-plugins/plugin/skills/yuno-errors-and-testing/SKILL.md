---
name: yuno-errors-and-testing
description: >-
  Guides error handling and testing for Yuno payments: reading payment status
  and sub_status, interpreting transaction response_code and hard/soft
  declines, using Merchant Advice Codes and AVS/CVV verification results,
  applying idempotency correctly, and testing in sandbox with the Yuno Testing
  Gateway and 3DS frictionless/challenge test cards. Use when the developer
  says "Yuno payment failed", "payment is PENDING forever", "what does
  DECLINED_BY_BANK mean", "should I retry this decline", "hard vs soft
  decline", "X-Idempotency-Key", "IDEMPOTENCY_DUPLICATED", "REQUEST_IN_PROCESS",
  "Yuno test cards", "test 3DS", "challenge flow", "sandbox not working",
  "sdk_action_required", "continuePayment", "AVS", "CVV check", "chargeback
  webhook", or when debugging any non-SUCCEEDED Yuno payment.
---

# Yuno errors, retries, and testing

## Read `status` + `sub_status`, never a single field

A Yuno **payment** is the order. Each payment holds one or more **transactions**
(purchase, authorize, verify, plus secondary refund/cancel/capture/chargeback/3DS/
fraud-screening ones). A payment can cross several providers via fallback, retry,
or split routing, so the transaction list is not a reliable summary.

Yuno's own guidance: take payment `status` and `sub_status` as the main reference
for state, because that stays correct regardless of how many transactions ran.
Source: [payment status](https://docs.y.uno/reference/payment.md),
[transactions](https://docs.y.uno/docs/basic-concepts/transactions.md).

The 14 top-level payment statuses:

`CREATED`, `READY_TO_PAY`, `PENDING`, `VERIFIED`, `EXPIRED`, `REJECTED`,
`DECLINED`, `SUCCEEDED`, `REFUNDED`, `CANCELED`, `IN_DISPUTE`, `CHARGEBACK`,
`ERROR`, `FRAUD`.

Group them by what your code should do:

| Payment status | Meaning | Action |
| --- | --- | --- |
| `CREATED`, `READY_TO_PAY` | Not paid yet; waiting on customer action | Keep the order open |
| `PENDING` | In flight — see `sub_status` | Wait for a webhook; do **not** poll tightly |
| `SUCCEEDED` | Authorized and/or captured | Fulfill |
| `VERIFIED` | Zero-amount verification passed | No funds moved |
| `DECLINED` | Provider/issuer said no | Read `response_code` before retrying |
| `REJECTED` | Yuno rejected the request itself | Fix the request; retrying unchanged fails |
| `ERROR` | Internal or provider error | **Read the sub-status** — 6 of 11 are HARD |
| `EXPIRED` | Payment method or window lapsed | New payment |
| `REFUNDED`, `CANCELED` | Terminal, money returned/never taken | Terminal |
| `IN_DISPUTE`, `CHARGEBACK` | Dispute lifecycle | Handle out of band |
| `FRAUD` | Fraud outcome | Terminal for this attempt |

`PENDING` sub-statuses tell you *what* it is waiting on: `AUTHORIZED`
(card authorized, not captured), `IN_PROCESS` (customer redirected to provider),
`WAITING_ADDITIONAL_STEP` (3DS / second factor), `PENDING_PROVIDER_CONFIRMATION`,
`PENDING_FRAUD_REVIEW`, `PENDING_OTP_COMPLETION`.

A `PENDING / AUTHORIZED` payment is **not** money in the bank. It needs a capture.

## Status is not the same as an error

Two different failure channels exist, and conflating them is the most common bug:

- **A declined payment is a successful API call.** `POST /v1/payments` returns 2xx
  with `status: DECLINED`. Your HTTP client will not throw. You must branch on
  `status`.
- **A malformed request is an API error.** Bad auth, bad body, unknown IP.

Each transaction also carries a `response_code` explaining the outcome, and
declines carry a **hard/soft** classification that decides retryability.
Source: [transaction codes](https://docs.y.uno/reference/payments/status-and-response-codes/transaction.md).

## Retryable vs terminal

**SOFT decline = the same card may work later.** Retry is allowed, with backoff.
Examples: `INSUFFICIENT_FUNDS` (ISO 51), `DO_NOT_HONOR` (05), `DECLINED_BY_BANK`,
`DECLINED_BY_PROVIDER`, `ACQUIRE_CONTINGENCY` (22/80/90/91/92/96),
`INVALID_ISSUER` (15), `RESTRICTED_BY_BANK` (62), `ISSUER_VIOLATION` (93),
`REQUESTS_EXCEEDED`, `UNKNOWN_ERROR`, `DUPLICATED_TRANSACTION` (26/94).

**HARD decline = never retry the same card/request.** Ask for new details or stop.
Examples: `EXPIRED_CARD` (33/54), `INVALID_CARD_NUMBER` (14), `INVALID_CARD_DATA` (56),
`INVALID_SECURITY_CODE` (56/82), `REPORTED_LOST` (41), `REPORTED_STOLEN` (43),
`USER_RESTRICTION` (57), `COUNTRY_NOT_SUPPORTED`, `CURRENCY_NOT_ALLOWED`,
`INVALID_PARAMETERS`, `MISSING_PARAMETERS`, `NO_RETRY_LIFE_CYCLE` (79),
`NO_RETRY_POLICY` (82), `NO_RETRY_SECURITY` (83), `BAD_FILLED_INFO` (30/89).

Within the `ERROR` family, **HARD outnumbers SOFT — do not assume an `ERROR` is
retryable.** The documented split is 5 SOFT against 6 HARD:

| SOFT — retry | HARD — do not retry |
| --- | --- |
| `ERROR` | `PROVIDER_INVALID_CREDENTIALS` |
| `PROVIDER_ERROR` | `PROVIDER_INVALID_REQUEST` |
| `PROVIDER_INTERNAL_ERROR` | `OPERATION_NOT_SUPPORTED` |
| `PROVIDER_TIMEOUT` | `PROVIDER_INVALID_RESPONSE` |
| `PROVIDER_UNKNOWN_ERROR` | `PROVIDER_INVALID_API_VERSION` |
| | `TO_REVERSE` |

The HARD ones are your configuration or your request, not bad luck. `TO_REVERSE`
especially: the documentation states the transaction will be reversed, so retrying
it races the reversal. Read the sub-status before any retry — never the status alone.

All `REJECTED`-status codes are HARD (`INVALID_REQUEST`, `INTERNAL_ERROR`,
`COUNTRY_NOT_SUPPORTED`, `CURRENCY_NOT_ALLOWED`, `INVALID_PARAMETERS`,
`MISSING_PARAMETERS`). Retrying an unchanged request cannot succeed.

### Merchant Advice Codes override your own heuristics

When a decline carries `transactions.merchant_advice_code`, it is the issuer
telling you whether and when to retry. Obey it over any generic backoff:

| `merchant_advice_code` | Do |
| --- | --- |
| `DO_NOT_TRY_AGAIN` | Stop permanently |
| `UPDATE_INFORMATION` | Ask the customer for new card details |
| `REQUIREMENTS_NOT_FULFILLED` | Token requirements unmet; fix the token |
| `TRY_AGAIN_LATER` | Retry after 10 days |
| `RETRY_AFTER_1_H` / `_24_H` / `_2_D` / `_4_D` / `_6_D` / `_8_D` / `_10_D` | Wait exactly that long |
| `NO_RETRY_LIFE_CYCLE` | Recurring plan cancelled — stop |
| `NO_RETRY_POLICY` | Non-rechargeable prepaid card — stop |
| `NO_RETRY_SECURITY` | Sanction score exceeded — stop |
| `MULTIPLE_USE_CARD` | Multiple-use virtual card |

`transactions.provider_data.merchant_advice_code` holds the raw provider code;
the un-prefixed field is Yuno-normalized. Prefer the normalized one.

## What Yuno retries for you

Yuno automatically retries **capture and refund** transactions — not purchases —
when you set `simplified_mode: true` on the
[capture](https://docs.y.uno/reference/capture-authorization) or
[refund](https://docs.y.uno/reference/refund-payment) request. Up to seven
attempts.

```bash
curl -X POST https://api-sandbox.y.uno/v1/payments/{id}/transactions/{transaction_id}/refund \
  -H 'X-Idempotency-Key: <uuid>' \
  -H 'content-type: application/json' \
  -H 'public-api-key: <key>' -H 'private-secret-key: <secret>' \
  -d '{"simplified_mode": true, "reason": "REQUESTED_BY_CUSTOMER", "merchant_reference": "AAB01-432245"}'
```

Intervals after the first try: 5 min, 50 min, 6 h, 24 h, 48 h, 96 h. Each is
measured from the **previous** attempt, so the schedule spans roughly 7 days
total — the docs describe it both as a "96-hour window" and as "7 days and 7
hours in total"; do not design a timeout around a single reading of that page.
Source: [transaction retries](https://docs.y.uno/docs/payment-features/transaction-retries.md).

While a retry runs, the payment shows `SUCCEEDED / CAPTURE_RETRY_IN_PROCESS` or
`SUCCEEDED / REFUND_RETRY_IN_PROCESS`. Exhausted capture retries land on
`SUCCEEDED / CAPTURE_RETRY_PROCESS_FAILED`. **Do not treat the top-level
`SUCCEEDED` here as "captured"** — the sub-status is carrying the real news.

Everything else — a declined purchase, a soft decline you want to re-attempt — is
yours to retry.

## Idempotency

`X-Idempotency-Key` is a UUID, unique per request. It makes a retry safe when the
outcome is unclear.
Source: [authentication](https://docs.y.uno/reference/getting-started/authentication.md).

Reusing a key gives one of:

- **The original response.** A payment was created under this key (approved,
  authorized, *or* declined); the retry returns it and the new body is ignored.
- **`400 REQUEST_IN_PROCESS`.** Still processing. Retry the same key in a few seconds.
- **`400 IDEMPOTENCY_DUPLICATED`.** The first request failed before creating a
  payment. No payment exists; the key is burned. Fix the request, use a **new** key.
- **Normal processing**, if the first request was rejected before processing.

The rules that matter:

1. Unclear outcome (timeout, connection error, `500`, unparseable body) → retry
   with the **same key**.
2. New key only for a genuinely new attempt — a new order, or a retry after a
   decline or after `IDEMPOTENCY_DUPLICATED`.
3. **Never retry an unclear failure with a new key.** If the original succeeded,
   you have just double-charged the customer.

Yuno's timeout is 60 seconds on all endpoints, so set your client timeout above
that or you will manufacture unclear outcomes.

## AVS and CVV results are advisory, not decisions

Card payments may carry `verification_services` with four fields:
`address_line_1_check`, `zip_code_check`, `card_holder_name_check`,
`card_security_code_check`. Each takes one of `PASS`, `FAIL`, `UNAVAILABLE`,
`UNCHECKED`. If no check ran, the whole object is omitted.

Find it at:

```
payment.payment_method.payment_method_detail.card.verification_services
payment.transactions.payment_method.detail.card.verification_services
payment.transactions_history[].payment_method.detail.card.verification_services
```

It is also inside payment webhook events on the same `payment_method.detail.card` path.

**A transaction can be `SUCCEEDED` with a failing AVS or CVV check.** These are
issuer signals for your own risk logic, not authorization outcomes. Default to
the authorization decision, combine with `fraud_screening`, the `three_d_secure`
result and `provider_data.iso8583_response_code`, and tolerate `UNAVAILABLE` /
`UNCHECKED` — many cards in Latin America and EMEA never run AVS at all.
Source: [card verification results](https://docs.y.uno/docs/payment-features/card-verification-results.md).

## Testing: the Yuno Testing Gateway

Sandbox-only connection, no credentials needed, all countries and currencies.
It cannot be used in production.
Source: [Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway.md).

Setup is dashboard work, and **all four steps are required** — a missing one is
the usual cause of "sandbox does nothing":

1. **Connections** → Yuno Test Payment Gateway → **Connect**, name it.
2. **Routing** → Card → create a route pointing at the gateway; set
   *All other payments* to **Cancel**.
3. **Checkout Builder** → enable **Card** → **Publish**.
4. Use sandbox keys against `https://api-sandbox.y.uno`.

### Forcing an outcome

Two mechanisms, and **card data wins over description** when they disagree:

**By description** — set the payment `description` to the desired result, e.g.
`"SUCCEEDED"`.

**By card number** — all use expiry `11/28`, CVV `123`, cardholder `John Doe`:

| Visa | Mastercard | Result |
| --- | --- | --- |
| 4507990000000002 | 5252440000000002 | `SUCCEEDED` |
| 4507990000000010 | 5252440000000010 | `INSUFFICIENT_FUNDS` |
| 4507990000000028 | 5252440000000028 | `DECLINED_BY_BANK` |
| 4507990000000036 | — | `DO_NOT_HONOR` |
| 4507990000000044 | — | `INVALID_SECURITY_CODE` |
| 4507990000000051 | — | `INVALID_CARD_DATA` |
| 4507990000000069 | — | `REPORTED_STOLEN` |
| 4507990000000077 | — | `ERROR` |

The gateway page also carries American Express, Diners, and UATP tables. The
[SDK quickstart](https://docs.y.uno/docs/sdks/overview/quickstart.md) lists a
separate, shorter set (`4111 1111 1111 1111` success, `4000 0000 0000 0002`
declined, `4000 0000 0000 3220` 3DS challenge) — the two lists are not
interchangeable; use the gateway's when the Testing Gateway is the provider.

## Testing 3DS

In sandbox a simulator mocks the Directory Server and Access Control Server, so
both frictionless and challenge outcomes are reachable.
Source: [3DS configuration and testing](https://docs.y.uno/docs/direct-integration-use-cases/3ds-configuration-and-testing.md).

Representative Visa cards:

| Card | 3DS 2.x outcome |
| --- | --- |
| 4556557955726624 | `AUTHENTICATED_APPLICATION_FRICTIONLESS` |
| 4929251897047956 | `AUTHENTICATED_BROWSER_FRICTIONLESS` |
| 4916994064252017 | `BROWSER_CHALLENGE` |
| 4024007189449340 | `APPLICATION_CHALLENGE` |
| 4716429323842524 | `NOT_AUTHENTICATED_BROWSER_FRICTIONLESS` |
| 4234123412340006 | `UNAVAILABLE_BROWSER_FRICTIONLESS` |
| 4234123412340007 | `ATTEMPTED_BROWSER_FRICTIONLESS` |
| 4234123412340001 | `NOT_ENROLLED` |
| 4556362626719763 | `PROTOCOL_ERROR` |
| 4024007176265022 | `BROWSER_CHALLENGE_MISSING_ACS_URL` |

Mastercard `5333259155643223` and Amex `341502098634895` are frictionless;
Mastercard `5306889942833340` and Amex `348638267931507` challenge. The Visa
`4234123412340xxx` range covers protocol errors, `IREQ_*`, `TIMEOUT`, and
`SERVER_ERROR` — use it to test how your code survives a broken ACS.

**OTP codes for a challenge (3DS2):** `1234` → Y (ECI 01, authenticated),
`1111` → N, `2222` → R, `3333` → U, `4444` → A. Valid for Visa, Mastercard and
Amex. For 3DS1, `1234` → Y and `1111` → N.

A 3DS challenge surfaces as `PENDING / WAITING_ADDITIONAL_STEP` with transaction
`response_code: CHALLENGE_REQUIRED`. Testing 3DS also needs a 3DS provider
connection and a route whose *Succeeded* branch points at the payment gateway.

## Troubleshooting

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Payment stuck at `PENDING / WAITING_ADDITIONAL_STEP` | 3DS/second factor never completed; `continuePayment()` not called | Response had `sdk_action_required: true` or `response_code: ACTION_REQUIRED`; call the SDK's `continuePayment()` |
| Payment stuck at `PENDING / IN_PROCESS` | Customer redirected and never returned | Wait for the webhook; do not create a second payment |
| `SUCCEEDED` but funds never settle | `sub_status` is `AUTHORIZED` (two-step) or `CAPTURE_RETRY_*` | Read `sub_status`; call capture |
| Every payment `REJECTED` | Request-level problem, not the card | `response_code`: `MISSING_PARAMETERS`, `INVALID_PARAMETERS`, `CURRENCY_NOT_ALLOWED`, `COUNTRY_NOT_SUPPORTED` |
| Checkout shows no payment methods | Checkout Builder not published, or no route matches | Publish Card in Checkout Builder; confirm the route's conditions match country/brand |
| Test card returns an unexpected status | `description` and card data disagree | Card data takes precedence — clear the description |
| Sandbox card works, production fails | Different keys, and Testing Gateway is sandbox-only | Confirm production base URL, production keys, and a real provider connection |
| `400 IDEMPOTENCY_DUPLICATED` | Prior request died before creating a payment | Fix the body, send a **new** key |
| `400 REQUEST_IN_PROCESS` | First request still running | Retry the **same** key after a few seconds |
| Duplicate charges | Retried an unclear failure with a fresh key | Always reuse the key on timeouts/5xx |
| `DECLINED_BY_PROVIDER` with no detail | Provider-specific rejection | Read `provider_data`; Yuno passes it through verbatim |
| Retry loop on a dead card | Ignoring hard declines / MAC | Branch on hard-vs-soft and honour `merchant_advice_code` |
| `INVALID_API` | Calling from an unregistered IP | Allowed-IP list in dashboard credentials |
| Requests time out around 60 s | Yuno's fixed 60-second endpoint timeout | Set client timeout > 60 s; retry with the same idempotency key |
| Chargeback webhook with no refund webhook | `PREVENTED` — predispute deflected by the network | Terminal; no evidence required |
| `UNAVAILABLE` / `UNCHECKED` on every AVS check | Issuer/region does not support AVS | Expected in much of LATAM and EMEA; do not decline on it |

Webhooks are the recommended way to track asynchronous payments; polling
`GET /v1/payments/{id}` is the fallback.
See [webhooks](https://docs.y.uno/docs/webhooks/index.md).

## Sources

- https://docs.y.uno/docs/developers.md
- https://docs.y.uno/reference/payment.md
- https://docs.y.uno/reference/payments/status-and-response-codes/transaction.md
- https://docs.y.uno/docs/basic-concepts/payments-1.md
- https://docs.y.uno/docs/basic-concepts/transactions.md
- https://docs.y.uno/docs/payment-features/transaction-retries.md
- https://docs.y.uno/docs/payment-features/card-verification-results.md
- https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway.md
- https://docs.y.uno/docs/direct-integration-use-cases/3ds-configuration-and-testing.md
- https://docs.y.uno/reference/getting-started/authentication.md
- https://docs.y.uno/reference/getting-started/api-environments.md
- https://docs.y.uno/docs/sdks/overview/quickstart.md
- https://docs.y.uno/llms.txt
