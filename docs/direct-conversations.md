# Exact discovery and Direct conversations

From **Inbox**, choose **New direct conversation**. Enter the full username on
the currently selected server and choose **Find user**. Typing does not perform
requests. Confirm the canonical username and displayed server before choosing
**Start conversation**. Looking up yourself uses the same confirmation and ordinary
Direct request. There is no global directory, autocomplete or cross-server search.

Server 0.1.1 lowercases ASCII usernames and accepts 3–32 ASCII letters, digits
and underscores, without trimming. The client sends the submitted value unchanged
and validates the returned canonical match. Missing and disabled users have the
same no-match result; a successful lookup does not guarantee later availability.

Both a new Direct (201) and an existing unordered-pair Direct (200) open the
server-returned ID. The summary then fetches its own authoritative representation.
The client does not manufacture an inbox row, title, membership or message history.

## Explicit retry and uncertainty

Each confirmed operation has one random idempotency key, immutable target and
payload in transient form-owned memory. POSTs are never automatically replayed,
including on 401, 429 or server failures. A near-expiring access token is refreshed
before the first dispatch, under existing session ownership.

Timeouts, lost responses, malformed success bodies and cancellation after dispatch
can mean a Direct was created remotely. The UI states this uncertainty. An
explicit retry uses the same key and payload while the same form/context survives,
for less than 24 hours from its initial attempt. Queueing time is conservatively
included. Rate limits disable retry until the received deadline. Key conflicts and
unavailable recorded results stop that operation rather than silently replacing it.

Editing the input, changing the account/context, leaving the route or restarting
discards the form's operation. A new lookup and confirmation create a new key.
After expiration, a retry requires a new lookup and confirmation too. The previous
Direct may already exist; server-enforced unordered-pair uniqueness still applies.
There is no persisted outbox or restart-spanning same-key guarantee.

## Verification map

| Matrix  | Automated evidence                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U01–U07 | `direct-api.test.ts`, `NewDirectPage.test.tsx`, `directs.spec.ts`: canonical exact match, strict page, no match, input invalidation                             |
| D01–D05 | `direct-api.test.ts`, `directs.spec.ts`: exact body/header, 200/201, reverse-order/self, serialized forms                                                       |
| D06–D09 | `direct-operation.test.ts`, `NewDirectPage.test.tsx`, `directs.spec.ts`: ambiguous outcomes, committed-but-dropped response, explicit same-key retry, conflicts |
| D10–D13 | `service.test.ts`, `directs.spec.ts`: no POST replay, unavailable participant, cooldown, invalid success                                                        |
| S01–S07 | `service.test.ts`, `directs.spec.ts`: server/context binding, sent refresh completion, account cleanup and cross-tab Web Locks                                  |
| P01–P02 | `direct-api.test.ts`, `network.spec.ts`: proxy prefix, real allowed/denied idempotency preflight                                                                |
| P03–P04 | Shared route/back policy and adapter tests; native builds and runtime checks must be reported separately                                                        |
| A01–A02 | Four-locale axe/320px confirmation tests, strict username decoder and escaped React text                                                                        |

Browser fixtures model server semantics but do not prove actual server uniqueness
or idempotency implementation. The header adapter test mocks native IPC and is not
native runtime evidence. Android keyboard/Back, Linux WebKitGTK and Windows
WebView2 interactive validation require an actual suitable session/device.
