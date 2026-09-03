---
name: test-cards
description: Show Yuno sandbox test cards and the 3DS test scenarios, and confirm the workspace is pointed at test mode before using them.
---

Help the developer test a card payment against the Yuno sandbox.

1. Confirm the environment first. Test cards only work in test mode, and the API
   host is the same in both environments — check which credentials are in play
   before running anything. Apply the `yuno-auth-and-environments` skill.
2. Retrieve the current test cards and 3DS scenarios from the documentation
   rather than from memory. Prefer the Yuno docs MCP tools; fall back to
   <https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway.md>
   and
   <https://docs.y.uno/docs/direct-integration-use-cases/3ds-configuration-and-testing.md>.
3. Present the cards that match what the developer is testing — approval,
   decline, or a 3DS frictionless/challenge flow — and say which outcome each
   one produces.
4. Never invent a card number. If a scenario is not documented, say so.
