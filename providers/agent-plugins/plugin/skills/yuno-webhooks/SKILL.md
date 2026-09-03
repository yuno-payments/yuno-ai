---
name: yuno-webhooks
description: >-
  Guides building and hardening a Yuno webhook receiver: the delivery contract and retry
  schedule, the event catalog across payments, refunds, chargebacks, subscriptions, payouts,
  enrollments and onboarding, HMAC-SHA256 signature verification, and endpoint configuration
  in the Yuno dashboard. Use when setting up a webhook endpoint, verifying the
  `x-hmac-signature` header, handling payment status notifications, reacting to
  `payment.purchase` or `payment.chargeback`, tracking subscription renewals, debugging
  missed or duplicated events, making a handler idempotent, deciding which events to
  subscribe to, or figuring out why Yuno keeps retrying a delivery.
---

# Yuno webhooks

Yuno delivers events as HTTP `POST` requests with a JSON body to a URL you configure. The
receiver must be a public REST endpoint that does **not** require authentication to be
reachable — you authenticate the *sender* instead, using the headers Yuno sends
(`x-api-key` / `x-secret`, HMAC, or OAuth2).
([overview](https://docs.y.uno/docs/webhooks/index.md))

## Delivery contract

- Yuno needs an **HTTP 200 OK** to consider the webhook received. The response body is
  ignored; only the status matters.
- The docs state that if no response arrives within the wait window, Yuno resends the event
  **up to seven times**. A non-200 is not an acknowledgement either, so treat anything other
  than 200 as a delivery that will be retried.
- Because retries exist, your endpoint **will** receive the same event more than once. This is
  expected behavior, not a bug.

Documented schedule ([configure-webhooks](https://docs.y.uno/docs/webhooks/configure-webhooks.md#receipt-confirmation-process)):

| Attempt | Deadline after the first try |
| :------ | :--------------------------- |
| 1st     | —                            |
| 2nd     | 5 minutes                    |
| 3rd     | 50 minutes                   |
| 4th     | 6 hours                      |
| 5th     | 24 hours                     |
| 6th     | 48 hours                     |
| 7th     | 96 hours                     |

The identical table appears under
[Transaction Retries](https://docs.y.uno/docs/payment-features/transaction-retries.md#retry-scheme),
where the intervals are described as **cumulative from the previous attempt**, spanning 7 days
and 7 hours in total, while the webhooks page labels the column "deadline after the first try".
The two readings differ, so do not hardcode a wall-clock deadline: assume the last attempt can
arrive **days** after the event and size your de-duplication store accordingly.

**Ordering.** The docs state no ordering guarantee, and the retry schedule alone makes
out-of-order delivery possible: a retry of an older event can land after a newer event for the
same resource. Never derive state from arrival order — compare the payload timestamps
(`data.payment.updated_at` and friends) or re-fetch the resource.

## Payload envelope

Every event carries the same top-level shape
([object and examples](https://docs.y.uno/docs/webhooks/object-and-examples.md)):

```json
{
  "type": "payment",
  "type_event": "payment.purchase",
  "account_id": "2c05976d-1234-1234-1234-6421883de48d",
  "retry": 0,
  "version": 2,
  "data": { "payment": { "id": "a546c566-...", "status": "SUCCEEDED" } }
}
```

- `type` — notification family (`payment`, `subscription`, `enrollment`, `payout`, …).
- `type_event` — the specific event, in the **dotted** form on the wire
  (`payment.purchase`, `subscription.cancel`); the catalog table splits it into `type` +
  `type_event` columns.
- `retry` — delivery attempts made for this event, `0` on the first.
- `version` — currently `2`. V1 payment and chargeback payloads are also documented; check
  which your account receives before writing parsers.
- `data` — the [payment object](https://docs.y.uno/reference/the-payment-object) for payment
  events, or the payment method / subscription / payout object for the others.

## Idempotency and de-duplication

The de-duplication identifier is `idempotency_key`, stable across every retry of the same
event. It is documented as `data.idempotency_key`, but the payment, refund and chargeback
example payloads carry it at `data.payment.idempotency_key` — read both locations
defensively rather than assuming one. Coverage today: `payment`, `refund`, `chargeback` and
`subscription` events. Enrollment events do **not** carry it yet.
([de-duplication](https://docs.y.uno/docs/webhooks/index.md#de-duplication))

**Trap on subscriptions.** For `subscription.*` events the key identifies the *subscription*,
not the event: it is the `X-Idempotency-Key` from subscription creation, repeated identically
on every lifecycle event. De-duplicating on the key alone collapses the whole lifecycle into
one record and silently drops `subscription.active`, `subscription.cancel` and the rest. Key
your store on `type_event` **plus** the idempotency key.

For event types with no key, fall back to your own composite key: resource id + event type +
a payload timestamp.

## Signature verification (HMAC-SHA256)

Enable **Use HMAC Authentication** on the webhook and supply a client secret
(`hmac_client_secret`). Yuno then adds one header:

```
x-hmac-signature: Base64( HMAC-SHA256( key = hmac_client_secret, msg = <raw request body> ) )
```

That construction is stated verbatim in the
[Webhooks API reference](https://docs.y.uno/reference/webhooks.md#hmac-signature) and matches
the [HMAC guide](https://docs.y.uno/docs/webhooks/verify-webhook-signatures-hmac.md). Enabling
HMAC only adds the header; the JSON payload is unchanged.

**Sign the raw bytes.** Re-serializing the parsed JSON changes key order or whitespace and
produces a different signature. The docs define no timestamp and no versioned signature
prefix, so there is no built-in replay window — enforce replay protection yourself with the
de-duplication store plus a freshness check on the payload timestamps.

### Node.js (Express)

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
const SECRET = process.env.YUNO_HMAC_SECRET;

function isValidSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(rawBody).digest('base64');
  const received = Buffer.from(signatureHeader, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  if (received.length !== computed.length) return false;
  return crypto.timingSafeEqual(received, computed);
}

// express.raw keeps the untouched bytes; a JSON body parser here would break verification.
app.post('/webhooks/yuno', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!isValidSignature(req.body, req.get('x-hmac-signature'))) {
    return res.status(401).send();
  }

  const event = JSON.parse(req.body.toString('utf8'));
  const idempotencyKey =
    event.data?.idempotency_key ?? event.data?.payment?.idempotency_key ?? null;
  const fallbackId = event.data?.payment?.id ?? event.data?.subscription?.code;
  const dedupeKey = `${event.type_event}:${idempotencyKey ?? fallbackId}`;

  // ACK first, work after: a slow handler burns the delivery window and triggers a retry.
  res.status(200).send();

  if (await markProcessed(dedupeKey)) {
    await handleEvent(event);
  }
});

// Yuno retries across a window measured in DAYS, so this must be durable and atomic.
// One statement that both claims the key and tells you whether you won the claim — never
// read-then-write, which races concurrent retries of the same delivery.
//
//   CREATE TABLE webhook_deliveries (dedupe_key text PRIMARY KEY, seen_at timestamptz DEFAULT now());
//
// Returns a row on the first delivery and nothing on every retry:
async function markProcessed(key) {
  const { rowCount } = await db.query(
    'INSERT INTO webhook_deliveries (dedupe_key) VALUES ($1) ON CONFLICT DO NOTHING',
    [key],
  );
  return rowCount === 1;
}
// Redis equivalent: `SET <key> 1 NX EX 864000` — truthy reply means you claimed it.
// An in-process Set is NOT a substitute: it forgets everything on restart, and the
// retry window outlives your process.

async function handleEvent(event) {
  console.log('processing', event.type_event, event.data);
}

app.listen(3000);
```

### Python (Flask)

```python
import base64
import hashlib
import hmac
import json
import os

from flask import Flask, request

app = Flask(__name__)
SECRET = os.environ["YUNO_HMAC_SECRET"].encode()


def is_valid_signature(raw_body: bytes, signature_header: str | None) -> bool:
    if not signature_header:
        return False
    expected = base64.b64encode(hmac.new(SECRET, raw_body, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(signature_header, expected)


@app.post("/webhooks/yuno")
def yuno_webhook():
    raw_body = request.get_data()  # bytes exactly as received
    if not is_valid_signature(raw_body, request.headers.get("x-hmac-signature")):
        return "", 401

    event = json.loads(raw_body)
    data = event.get("data", {})
    idempotency_key = data.get("idempotency_key") or data.get("payment", {}).get(
        "idempotency_key"
    )
    fallback_id = data.get("payment", {}).get("id") or data.get("subscription", {}).get("code")
    dedupe_key = f"{event['type_event']}:{idempotency_key or fallback_id}"

    if mark_processed(dedupe_key):
        handle_event(event)

    return "", 200


_processed: set[str] = set()  # same caveat as the Node example: use durable storage


def mark_processed(key: str) -> bool:
    if key in _processed:
        return False
    _processed.add(key)
    return True


def handle_event(event: dict) -> None:
    print("processing", event["type_event"], event["data"])
```

## Event catalog

Full table of `type` / `type_event` pairs:
[webhooks event types](https://docs.y.uno/docs/webhooks/configure-webhooks.md#webhooks-event-types).
The families:

- **payment** — `purchase`, `authorize`, `capture`, `refund`, `cancel`, `verify`,
  `chargeback`, `fraud_screening`.
- **subscription** — `create`, `active`, `trialing`, `past_due`, `pause`, `resume`, `cancel`,
  `complete`, `close_to_renewal`, `cycle_executed`, `phase_started`, `phase_completed`,
  `plan_change_scheduled`, `plan_change_canceled`, `plan_changed`, `cancel_scheduled`,
  `cancel_schedule_canceled`.
- **enrollment** — `enroll`, `unenroll`, `expiration`, `update`.
- **payout** — `payout`.
- **onboarding** — `create`, `pending`, `pending_additional_documentation`,
  `pending_recipient_action`, `succeeded`, `canceled`, `declined`, `rejected`, `blocked`,
  `unblocked`, `error`, `expired`, `failed`.
- **split_transfer / split_transfer_reverse** — `succeeded`, `failed`.
- **banking.\*** — entity, onboarding, account and transfer events for Banking Connectivity.

### Subscription gotchas

- **There is no `subscription.error` event.** Renewal charges — successes and declines alike —
  arrive as `payment.purchase` webhooks tied to the subscription, with the outcome in
  `status` / `sub_status`. Subscribe to `payment.purchase` to track renewals.
- `subscription.active` fires once, when the subscription first becomes active
  (`billing_cycles.current` = 2), and again only on recovery from `PAST_DUE`. It is not a
  per-renewal event.
- `$0` / trial cycles emit no payment webhook. On plan-based subscriptions they surface as
  `subscription.cycle_executed`.
- `subscription.past_due` is only emitted for accounts where that status is enabled.
- The `payments` array inside the subscription object is currently always empty in webhook
  payloads.
  ([details](https://docs.y.uno/docs/webhooks/object-and-examples.md#renewal-charges-and-failures-no-subscription-error))

### Payment payload gotchas

- In webhooks, `data.payment.transactions` is a **single object** — the transaction that
  triggered the event. In `GET /payments/{payment_id}` the same field is an **array** of every
  transaction. Parse each surface separately.
- `transactions_history` is opt-in: it is populated only when the payment was created with
  `response_additional_data.transactions_history: true`. Otherwise it arrives as `[]`, so a
  payment your routing retried across providers shows only the last attempt in the webhook.
  Chargeback events always include the full history.
- The customer geolocation is `geo_location` in webhooks and `geolocation` in the retrieve
  endpoints.
- `payment.fraud_screening` fires when fraud screening declines and no transaction is created
  (`transactions` comes back empty). If routing lets the transaction proceed anyway, you get
  `payment.purchase` instead.

## Webhook is a notification, not the source of truth

The docs are explicit for subscriptions: treat plan-change and cancel-scheduling events as
notifications and reconcile against `GET /v1/subscriptions/{id}` (`pending_plan_change`,
`plan_id`, `cancel_scheduled`) rather than relying on delivery. Apply the same discipline to
payments — for anything that moves money or grants entitlement, use the webhook as the trigger
and act on the state returned by `GET /payments/{payment_id}`. That also closes the
`transactions_history` gap above.

## Configuring endpoints

Dashboard → **Developers** → **Webhooks** → **Add webhook**
([guide](https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md#webhooks)):

- **Name**, **Endpoint URL** (use HTTPS).
- **x-api-key** / **x-secret** — optional but recommended; sent as headers on every delivery
  so your receiver can check them.
- **Use OAuth2 Authentication** — Yuno fetches a token from your HTTPS token endpoint and
  sends it as `Authorization: Bearer <token>` (header name configurable via
  `oauth2_authorization_name`). Yuno reuses the token until it nears expiry, so very
  short-lived tokens mean a token request on nearly every delivery.
- **Use HMAC Authentication** — adds `x-hmac-signature` as described above.
- **Trigger on** — pick the events. Subscribe narrowly, but remember renewals only arrive via
  `payment.purchase`.
- **Apply this webhook to other accounts** — fan the webhook out across the organization's
  accounts, or keep it on the current one.

The Status toggle activates/deactivates a webhook, and **Test webhook** sends a test
notification.

**Per environment:** Yuno keeps Test and Live credentials separate
([credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md)).
Configure a distinct webhook (and a distinct HMAC secret) per environment, and never point a
Test webhook at your production receiver.

The same configuration is available programmatically through the
[Webhooks API](https://docs.y.uno/reference/webhooks.md), where events are subscribed through
five trigger fields — `enrollment_triggers`, `payment_triggers`, `report_triggers`,
`subscription_triggers`, `onboarding_triggers` — and at least one is required. Secrets there
are write-only: they read back as `***`. Omit a secret to keep it, send `***` back and you
overwrite the secret with the literal string, send `""` to delete it.

HMAC secrets are scoped to the **webhook object**, not to a PSP connection. One webhook signs
events from every provider connection the same way; create additional webhooks only to split
events across endpoints, not to segment by provider.

## Checklist for a receiver

1. Verify `x-hmac-signature` (and/or `x-api-key` / `x-secret`) over the raw bytes, in constant
   time, before parsing. Reject with 401.
2. Return 200 fast; do the real work asynchronously.
3. De-duplicate on `type_event` + idempotency key, with an atomic insert, and keep the keys
   longer than the retry window — days, not minutes.
4. Never trust arrival order; compare payload timestamps.
5. Re-fetch the payment or subscription before acting on money or entitlements.
6. Never return a non-2xx for a business-logic rejection you do not want retried — Yuno will
   resend it up to seven times.

## Sources

- https://docs.y.uno/docs/webhooks/index.md
- https://docs.y.uno/docs/webhooks/configure-webhooks.md
- https://docs.y.uno/docs/webhooks/object-and-examples.md
- https://docs.y.uno/docs/webhooks/verify-webhook-signatures-hmac.md
- https://docs.y.uno/docs/basic-concepts/webhooks-1.md
- https://docs.y.uno/docs/using-yuno/settings/developers-credentials.md
- https://docs.y.uno/docs/payment-features/transaction-retries.md
- https://docs.y.uno/reference/webhooks.md
