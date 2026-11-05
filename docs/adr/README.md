# Architectural Decision Records

ADRs record significant architectural decisions implemented in this client repository.

- [0001: Shared React application and Tauri host](0001-shared-react-and-tauri-application.md).
- [0002: Scoped native HTTP and server-bound clients](0002-scoped-native-http-and-server-bound-clients.md).
- [0003: Shared in-memory presentation and bundled localization](0003-shared-presentation-and-localization.md).

Introduce an ADR in the same PR that implements a material architectural
boundary or long-lived technical direction. Do not record roadmap intentions
as accepted decisions or create placeholders for future deliveries.

Use zero-padded sequential numbers and descriptive filenames, starting at
`0001`. Follow the [template](0000-template.md), including status, date, context,
decision and consequences. Routine implementation details do not need an ADR.

Preserve superseded records and link to the decisions that replace them.
