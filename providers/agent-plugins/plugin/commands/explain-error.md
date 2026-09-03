---
name: explain-error
description: Diagnose a Yuno API error, declined payment, or unexpected transaction status, and say whether it is retryable and what to do next.
---

Diagnose the Yuno error, response body, or status the developer pasted.

1. Identify what you are looking at: an HTTP/API error, a payment status, a
   transaction status, or a provider decline reason. These are different layers
   and are diagnosed differently — apply the `yuno-errors-and-testing` skill.
2. Establish the environment and the integration path before theorising, so the
   advice matches what actually ran.
3. Explain the cause in one paragraph, then say plainly whether the condition is
   retryable, terminal, or a configuration problem.
4. Give the concrete next step. If it requires inspecting the actual payment,
   use the Yuno MCP tools to retrieve it instead of speculating.
5. Ground every status value and error code in the documentation. If you cannot
   confirm what a code means, say so and link the reference rather than guessing.
