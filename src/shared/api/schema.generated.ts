// Generated from contracts/windwatcher-v1.openapi.json. DO NOT EDIT.
export interface paths {
  "/v1/conversations": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listConversations"];
    put?: never;
    post: operations["createConversation"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/conversations/{conversation_id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getConversation"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations["updateConversation"];
    trace?: never;
  };
  "/v1/conversations/{conversation_id}/members": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listConversationMembers"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/conversations/{conversation_id}/members/{user_id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["addConversationMember"];
    post?: never;
    delete: operations["removeConversationMember"];
    options?: never;
    head?: never;
    patch: operations["updateConversationMember"];
    trace?: never;
  };
  "/v1/conversations/{conversation_id}/members/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations["leaveConversation"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/conversations/{conversation_id}/messages": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["listMessages"];
    put?: never;
    post: operations["sendMessage"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/conversations/{conversation_id}/owner": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["transferConversationOwnership"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/conversations/{conversation_id}/read-state": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations["updateConversationReadState"];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/instance": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getInstance"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/messages/{message_id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getMessage"];
    put?: never;
    post?: never;
    delete: operations["deleteMessage"];
    options?: never;
    head?: never;
    patch: operations["editMessage"];
    trace?: never;
  };
  "/v1/realtime": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["connectRealtime"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/realtime/tickets": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["createRealtimeTicket"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/sessions": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["createSession"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/sessions/current": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Revokes future refresh only. Already-issued access tokens remain valid until
     *     expiration; logout does not blacklist them. Repeated deletion is idempotent.
     */
    delete: operations["revokeCurrentSession"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/sessions/refresh": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["refreshSession"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/users": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["findUsers"];
    put?: never;
    post: operations["registerUser"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/users/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["getCurrentUser"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /** @enum {string} */
    ApiVersion: "v1";
    /** @enum {string} */
    AssignableRole: "admin" | "member";
    /** @enum {string} */
    AuthMethod: "password";
    /** @enum {string} */
    ConversationKindResponse: "direct" | "group";
    ConversationResponse: {
      /** Format: date-time */
      created_at: string;
      /** Format: uuid */
      id: string;
      kind: components["schemas"]["ConversationKindResponse"];
      last_message?: components["schemas"]["MessageResponse"] | null;
      membership: components["schemas"]["OwnMembershipResponse"];
      title: string;
      /** Format: int64 */
      unread_count: number;
      /** Format: date-time */
      updated_at: string;
    };
    CreateConversationRequest:
      | components["schemas"]["CreateDirectRequest"]
      | components["schemas"]["CreateGroupRequest"];
    CreateDirectRequest: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      kind: "direct";
      /** Format: uuid */
      participant_id: string;
    };
    CreateGroupRequest: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      kind: "group";
      /** @description At most 256 entries, counted before removing duplicates or the creator. */
      participant_ids: string[];
      /** @description Nonblank exact title, at most 256 UTF-8 bytes (not characters). */
      title: string;
    };
    CreateSessionRequest: {
      /** @example fake example password */
      password: string;
      /** @example alice */
      username: string;
    };
    /** @enum {string} */
    DirectKind: "direct";
    EditMessageRequest: {
      content: string;
    };
    EventData:
      | {
          payload: {
            message: components["schemas"]["MessagePayload"];
          };
          /** @enum {string} */
          type: "message.created";
        }
      | {
          payload: {
            message: components["schemas"]["MessagePayload"];
          };
          /** @enum {string} */
          type: "message.updated";
        }
      | {
          payload: {
            message: components["schemas"]["MessagePayload"];
          };
          /** @enum {string} */
          type: "message.deleted";
        }
      | {
          payload: {
            /** Format: uuid */
            conversation_id: string;
            kind: components["schemas"]["Kind"];
          };
          /** @enum {string} */
          type: "conversation.created";
        }
      | {
          payload: {
            /** Format: uuid */
            conversation_id: string;
            title: string;
            /** Format: date-time */
            updated_at: string;
          };
          /** @enum {string} */
          type: "conversation.updated";
        }
      | {
          payload: {
            /** Format: uuid */
            conversation_id: string;
          };
          /** @enum {string} */
          type: "conversation.deleted";
        }
      | {
          payload: components["schemas"]["MemberChange"];
          /** @enum {string} */
          type: "conversation.member.added";
        }
      | {
          payload: components["schemas"]["MemberChange"];
          /** @enum {string} */
          type: "conversation.member.updated";
        }
      | {
          payload: {
            /** Format: uuid */
            conversation_id: string;
            /** Format: date-time */
            conversation_updated_at: string;
            /** Format: uuid */
            user_id: string;
          };
          /** @enum {string} */
          type: "conversation.member.removed";
        }
      | {
          payload: {
            /** Format: uuid */
            conversation_id: string;
            /** Format: date-time */
            conversation_updated_at: string;
            new_owner: components["schemas"]["MemberPayload"];
            previous_owner: components["schemas"]["MemberPayload"];
          };
          /** @enum {string} */
          type: "conversation.owner.transferred";
        }
      | {
          payload: {
            /** Format: uuid */
            conversation_id: string;
            /** Format: uuid */
            last_read_message_id?: string | null;
            /** Format: int64 */
            unread_count: number;
          };
          /** @enum {string} */
          type: "conversation.read_state.updated";
        };
    /** @enum {string} */
    GroupKind: "group";
    InstanceResponse: {
      /** @description Supported public HTTP API versions. */
      api_versions: components["schemas"]["ApiVersion"][];
      /** @description Supported client authentication methods. */
      auth_methods: components["schemas"]["AuthMethod"][];
      /** @description Public self-registration policy; existing users can still authenticate when closed. */
      registration: components["schemas"]["Registration"];
      /** @description Protocol identifier, not a cryptographically verified identity. */
      service: components["schemas"]["Service"];
    };
    /** @enum {string} */
    Kind: "direct" | "group";
    MemberChange: {
      /** Format: uuid */
      conversation_id: string;
      /** Format: date-time */
      conversation_updated_at: string;
      member: components["schemas"]["MemberPayload"];
    };
    MemberPayload: {
      /** Format: date-time */
      joined_at: string;
      role: components["schemas"]["Role"];
      user: components["schemas"]["UserPayload"];
    };
    MemberResponse: {
      /** Format: date-time */
      joined_at: string;
      role: components["schemas"]["RoleResponse"];
      user: components["schemas"]["UserSummaryResponse"];
    };
    MessagePayload: {
      content?: string | null;
      /** Format: uuid */
      conversation_id: string;
      /** Format: date-time */
      created_at: string;
      /** Format: date-time */
      deleted_at?: string | null;
      /** Format: date-time */
      edited_at?: string | null;
      /** Format: uuid */
      id: string;
      reply_to?: components["schemas"]["ReplyPayload"] | null;
      /** Format: uuid */
      sender_id: string;
      sender_username: string;
    };
    MessageResponse: {
      content?: string | null;
      /** Format: uuid */
      conversation_id: string;
      /** Format: date-time */
      created_at: string;
      /** Format: date-time */
      deleted_at?: string | null;
      /** Format: date-time */
      edited_at?: string | null;
      /** Format: uuid */
      id: string;
      reply_to?: components["schemas"]["ReplyPreviewResponse"] | null;
      /** Format: uuid */
      sender_id: string;
      sender_username: string;
    };
    OwnMembershipResponse: {
      /** Format: uuid */
      last_read_message_id?: string | null;
      role: components["schemas"]["RoleResponse"];
    };
    PageResponse_ConversationResponse: {
      has_more: boolean;
      items: {
        /** Format: date-time */
        created_at: string;
        /** Format: uuid */
        id: string;
        kind: components["schemas"]["ConversationKindResponse"];
        last_message?: components["schemas"]["MessageResponse"] | null;
        membership: components["schemas"]["OwnMembershipResponse"];
        title: string;
        /** Format: int64 */
        unread_count: number;
        /** Format: date-time */
        updated_at: string;
      }[];
      next_cursor?: string | null;
    };
    PageResponse_MemberResponse: {
      has_more: boolean;
      items: {
        /** Format: date-time */
        joined_at: string;
        role: components["schemas"]["RoleResponse"];
        user: components["schemas"]["UserSummaryResponse"];
      }[];
      next_cursor?: string | null;
    };
    PageResponse_MessageResponse: {
      has_more: boolean;
      items: {
        content?: string | null;
        /** Format: uuid */
        conversation_id: string;
        /** Format: date-time */
        created_at: string;
        /** Format: date-time */
        deleted_at?: string | null;
        /** Format: date-time */
        edited_at?: string | null;
        /** Format: uuid */
        id: string;
        reply_to?: components["schemas"]["ReplyPreviewResponse"] | null;
        /** Format: uuid */
        sender_id: string;
        sender_username: string;
      }[];
      next_cursor?: string | null;
    };
    PageResponse_UserSummaryResponse: {
      has_more: boolean;
      items: {
        /** Format: uuid */
        id: string;
        username: string;
      }[];
      next_cursor?: string | null;
    };
    /** @description RFC 9457 plus stable Windwatcher code and authoritative correlation ID. */
    ProblemDetails: {
      /** @example auth.invalid_credentials */
      code: string;
      /** @example The supplied credentials are invalid. */
      detail: string;
      /**
       * Format: uuid
       * @example 019a0000-0000-7000-8000-000000000001
       */
      request_id: string;
      /**
       * Format: int32
       * @example 401
       */
      status: number;
      /** @example Invalid credentials */
      title: string;
      /** @example urn:windwatcher:problem:auth:invalid-credentials */
      type: string;
    };
    ReadStateRequest: {
      /** Format: uuid */
      last_read_message_id: string;
    };
    ReadStateResponse: {
      /** Format: uuid */
      last_read_message_id?: string | null;
      /** Format: int64 */
      unread_count: number;
    };
    /** @description The wire contract is server-owned; identifiers are not engine event types. */
    RealtimeEvent: components["schemas"]["EventData"] & {
      /** Format: uuid */
      event_id: string;
      /** Format: date-time */
      occurred_at: string;
      /** Format: int32 */
      schema_version: number;
    };
    RefreshSessionRequest: {
      /** @example AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA */
      refresh_token: string;
    };
    RegisterUserRequest: {
      /** @example fake example password */
      password: string;
      /** @example alice */
      username: string;
    };
    /** @enum {string} */
    Registration: "open" | "closed";
    ReplyPayload: {
      content?: string | null;
      /** Format: date-time */
      deleted_at?: string | null;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      sender_id: string;
      sender_username: string;
    };
    ReplyPreviewResponse: {
      content?: string | null;
      /** Format: date-time */
      deleted_at?: string | null;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      sender_id: string;
      sender_username: string;
    };
    /** @enum {string} */
    Role: "direct" | "owner" | "admin" | "member";
    /** @enum {string} */
    RoleResponse: "direct" | "owner" | "admin" | "member";
    SendMessageRequest: {
      content: string;
      /** Format: uuid */
      reply_to_message_id?: string | null;
    };
    /** @enum {string} */
    Service: "windwatcher";
    SessionGrantResponse: {
      /** @example fake.header.signature */
      access_token: string;
      /** Format: date-time */
      access_token_expires_at: string;
      /** @example AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA */
      refresh_token: string;
      /** Format: date-time */
      session_expires_at: string;
      /**
       * Format: uuid
       * @example 019a0000-0000-7000-8000-000000000001
       */
      session_id: string;
      /** @example Bearer */
      token_type: string;
    };
    TicketResponse: {
      /** Format: date-time */
      expires_at: string;
      /** @description Canonical unpadded base64url encoding of exactly 32 random bytes. */
      ticket: string;
    };
    TransferOwnerRequest: {
      /** Format: uuid */
      user_id: string;
    };
    UpdateConversationRequest: {
      /** @description Nonblank exact title, at most 256 UTF-8 bytes (not characters). */
      title: string;
    };
    UpdateMemberRequest: {
      role: components["schemas"]["AssignableRole"];
    };
    UserPayload: {
      /** Format: uuid */
      id: string;
      username: string;
    };
    UserResponse: {
      /** Format: date-time */
      created_at: string;
      /** Format: date-time */
      disabled_at?: string | null;
      /**
       * Format: uuid
       * @example 019a0000-0000-7000-8000-000000000001
       */
      id: string;
      /** Format: date-time */
      updated_at: string;
      /** @example alice */
      username: string;
    };
    UserSummaryResponse: {
      /** Format: uuid */
      id: string;
      username: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  listConversations: {
    parameters: {
      query?: {
        /** @description Opaque next-only continuation cursor; at most 1024 encoded bytes. */
        cursor?: string;
        /** @description Page size; defaults to 50, inclusive maximum 100. */
        limit?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["PageResponse_ConversationResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  createConversation: {
    parameters: {
      query?: never;
      header?: {
        /** @description Optional exact visible ASCII key; 24-hour semantic retry guarantee. Different input with the same active key conflicts. */
        "Idempotency-Key"?: string | null;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateConversationRequest"];
      };
    };
    responses: {
      200: {
        headers: {
          /** @description Present as true only on a matching replay */
          "Idempotency-Replayed"?: string;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ConversationResponse"];
        };
      };
      201: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ConversationResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds the transport limit */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  getConversation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ConversationResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  updateConversation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["UpdateConversationRequest"];
      };
    };
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ConversationResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds the transport limit */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  listConversationMembers: {
    parameters: {
      query?: {
        /** @description Opaque next-only continuation cursor; at most 1024 encoded bytes. */
        cursor?: string;
        /** @description Page size; defaults to 50, inclusive maximum 100. */
        limit?: number;
      };
      header?: never;
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["PageResponse_MemberResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  addConversationMember: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
        user_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MemberResponse"];
        };
      };
      201: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MemberResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  removeConversationMember: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
        user_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Member removed */
      204: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  updateConversationMember: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
        user_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["UpdateMemberRequest"];
      };
    };
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MemberResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds the transport limit */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  leaveConversation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Left or deleted owner-only Group */
      204: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  listMessages: {
    parameters: {
      query?: {
        /** @description Opaque next-only continuation cursor; at most 1024 encoded bytes. */
        cursor?: string;
        /** @description Page size; defaults to 50, inclusive maximum 100. */
        limit?: number;
      };
      header?: never;
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["PageResponse_MessageResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  sendMessage: {
    parameters: {
      query?: never;
      header?: {
        /** @description Optional exact visible ASCII key; 24-hour semantic retry guarantee. Different input with the same active key conflicts. */
        "Idempotency-Key"?: string | null;
      };
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SendMessageRequest"];
      };
    };
    responses: {
      200: {
        headers: {
          /** @description Present as true only on a matching replay */
          "Idempotency-Replayed"?: string;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MessageResponse"];
        };
      };
      201: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MessageResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds the transport limit */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  transferConversationOwnership: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["TransferOwnerRequest"];
      };
    };
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ConversationResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds the transport limit */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  updateConversationReadState: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        conversation_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ReadStateRequest"];
      };
    };
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ReadStateResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds the transport limit */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  getInstance: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Public instance discovery metadata */
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["InstanceResponse"];
        };
      };
      /** @description Client request quota exceeded */
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  getMessage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        message_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MessageResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  deleteMessage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        message_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MessageResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  editMessage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        message_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["EditMessageRequest"];
      };
    };
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MessageResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      404: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds the transport limit */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  connectRealtime: {
    parameters: {
      query: {
        /** @description Short-lived one-use secret: canonical unpadded base64url of exactly 32 bytes, never an access JWT */
        ticket: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description WebSocket established; JSON Text frames described in docs/realtime.md */
      101: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      426: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      503: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  createRealtimeTicket: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          /** @description Always no-store */
          "Cache-Control"?: string;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["TicketResponse"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      503: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  createSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateSessionRequest"];
      };
    };
    responses: {
      /** @description Session persisted; JSON bearer secrets must not be cached */
      201: {
        headers: {
          /** @description Always no-store; bearer token grants must not be cached. */
          "Cache-Control"?: string;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionGrantResponse"];
        };
      };
      /** @description Invalid JSON structure */
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Invalid credentials */
      401: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description User disabled */
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds 2 MiB */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Client request quota exceeded */
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Internal failure */
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  revokeCurrentSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Refresh revoked; existing access tokens remain valid until expiration */
      204: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid access token */
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Client request quota exceeded */
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Internal failure */
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  refreshSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["RefreshSessionRequest"];
      };
    };
    responses: {
      /** @description Refresh rotated; the old refresh token is immediately invalid */
      200: {
        headers: {
          /** @description Always no-store; bearer token grants must not be cached. */
          "Cache-Control"?: string;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SessionGrantResponse"];
        };
      };
      /** @description Invalid JSON structure */
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Invalid refresh token */
      401: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds 2 MiB */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Client request quota exceeded */
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Internal failure */
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  findUsers: {
    parameters: {
      query: {
        /** @description Exact discovery never issues a continuation; supplied cursors are rejected. */
        cursor?: string;
        limit?: number;
        username: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["PageResponse_UserSummaryResponse"];
        };
      };
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  registerUser: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["RegisterUserRequest"];
      };
    };
    responses: {
      /** @description User registered; no session is created */
      201: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["UserResponse"];
        };
      };
      /** @description Invalid JSON structure */
      400: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Registration closed */
      403: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Username taken */
      409: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Body exceeds 2 MiB */
      413: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description JSON Content-Type required */
      415: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Invalid username or new password */
      422: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Client request quota exceeded */
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Internal failure */
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
  getCurrentUser: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Current identity; an already-issued access token remains valid after disabling */
      200: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["UserResponse"];
        };
      };
      /** @description Invalid access token or missing identity */
      401: {
        headers: {
          /**
           * @description Bearer authentication challenge, without token values or credential failure details.
           * @example Bearer
           */
          "WWW-Authenticate"?: "Bearer";
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Client request quota exceeded */
      429: {
        headers: {
          /**
           * @description Seconds to wait before retrying; rounded upward to a positive integer.
           * @example 1
           */
          "Retry-After"?: number;
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
      /** @description Internal failure */
      500: {
        headers: {
          /** @description Always present: server-generated UUIDv7 correlation ID, replacing any client-provided value. Matches ProblemDetails.request_id on errors. */
          "X-Request-Id"?: string;
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetails"];
        };
      };
    };
  };
}
