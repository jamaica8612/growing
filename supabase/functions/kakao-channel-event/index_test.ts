import {
  createKakaoChannelEventHandler,
  type KakaoChannelEventPayload,
  type KakaoChannelEventStore,
  type ProcessEventResult,
  sha256Hex,
} from "./index.ts";

const ADMIN_KEY = "0123456789abcdef0123456789abcdef";
const RESOURCE_ID = "resource-123";
const VALID_PAYLOAD: KakaoChannelEventPayload = {
  event: "blocked",
  id: "1111",
  id_type: "app_user_id",
  channel_public_id: "_FLX",
  channel_uuid: "@ad",
  updated_at: "2026-07-17T01:02:03Z",
};

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message ?? `Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

class FakeStore implements KakaoChannelEventStore {
  ownerId: string | null = "owner-1";
  result: ProcessEventResult = {
    processed: true,
    duplicate: false,
    matched_links: 1,
  };
  processingError: Error | null = null;
  resolvedAdminKeyHash = "";
  resolvedChannelPublicId = "";
  resolvedChannelUuid = "";
  configuredChannelPublicId: string | null = VALID_PAYLOAD.channel_public_id;
  configuredChannelUuid: string | null = VALID_PAYLOAD.channel_uuid;
  processedResourceId = "";
  processedPayload: KakaoChannelEventPayload | null = null;

  resolveOwner(
    adminKeyHash: string,
    channelPublicId: string,
    channelUuid: string,
  ): Promise<string | null> {
    this.resolvedAdminKeyHash = adminKeyHash;
    this.resolvedChannelPublicId = channelPublicId;
    this.resolvedChannelUuid = channelUuid;
    const channelMatches = this.configuredChannelPublicId === channelPublicId &&
      this.configuredChannelUuid === channelUuid;
    return Promise.resolve(channelMatches ? this.ownerId : null);
  }

  processEvent(
    _ownerId: string,
    resourceId: string,
    payload: KakaoChannelEventPayload,
  ): Promise<ProcessEventResult> {
    this.processedResourceId = resourceId;
    this.processedPayload = payload;
    if (this.processingError) return Promise.reject(this.processingError);
    return Promise.resolve(this.result);
  }
}

function makeRequest(
  payload: unknown = VALID_PAYLOAD,
  overrides: {
    headers?: Record<string, string>;
    url?: string;
    method?: string;
    rawBody?: string;
  } = {},
): Request {
  return new Request(
    overrides.url ?? "https://example.test/kakao-channel-event",
    {
      method: overrides.method ?? "POST",
      headers: {
        Authorization: `KakaoAK ${ADMIN_KEY}`,
        "Content-Type": "application/json",
        "X-Kakao-Resource-ID": RESOURCE_ID,
        ...overrides.headers,
      },
      body: overrides.method === "GET"
        ? undefined
        : (overrides.rawBody ?? JSON.stringify(payload)),
    },
  );
}

function makeHandler(store: FakeStore) {
  return createKakaoChannelEventHandler({
    createStore: () => store,
    timeoutMs: 5_000,
  });
}

Deno.test("accepts the official flat Kakao channel relationship payload", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(makeRequest());

  assertEquals(response.status, 204);
  assertEquals(store.processedResourceId, RESOURCE_ID);
  assertEquals(store.processedPayload?.event, "blocked");
  assertEquals(store.processedPayload?.id_type, "app_user_id");
  assertEquals(store.resolvedAdminKeyHash, await sha256Hex(ADMIN_KEY));
  assertEquals(store.resolvedChannelPublicId, VALID_PAYLOAD.channel_public_id);
  assertEquals(store.resolvedChannelUuid, VALID_PAYLOAD.channel_uuid);
});

Deno.test("rejects an event for a different public channel ID under the same Admin key", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(
    makeRequest({ ...VALID_PAYLOAD, channel_public_id: "_OTHER" }),
  );

  assertEquals(response.status, 401);
  assertEquals(store.processedPayload, null);
});

Deno.test("rejects an event for a different channel UUID under the same Admin key", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(
    makeRequest({ ...VALID_PAYLOAD, channel_uuid: "@other" }),
  );

  assertEquals(response.status, 401);
  assertEquals(store.processedPayload, null);
});

Deno.test("rejects a channel whose stored channel identifiers are not configured", async () => {
  const store = new FakeStore();
  store.configuredChannelPublicId = null;
  store.configuredChannelUuid = null;

  const response = await makeHandler(store)(makeRequest());

  assertEquals(response.status, 401);
  assertEquals(store.processedPayload, null);
});

Deno.test("accepts exact added and open_id allowlist values", async () => {
  const store = new FakeStore();
  const payload: KakaoChannelEventPayload = {
    ...VALID_PAYLOAD,
    event: "added",
    id_type: "open_id",
  };
  const response = await makeHandler(store)(makeRequest(payload));

  assertEquals(response.status, 204);
  assertEquals(store.processedPayload?.event, "added");
  assertEquals(store.processedPayload?.id_type, "open_id");
});

Deno.test("returns 204 for a resource-id retry reported as a duplicate", async () => {
  const store = new FakeStore();
  store.result = { processed: false, duplicate: true, matched_links: 0 };

  const response = await makeHandler(store)(makeRequest());

  assertEquals(response.status, 204);
});

Deno.test("rejects query-string secret authentication", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(
    makeRequest(VALID_PAYLOAD, {
      url: "https://example.test/kakao-channel-event?secret=legacy",
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(store.resolvedAdminKeyHash, "");
});

Deno.test("rejects the legacy custom header without KakaoAK authorization", async () => {
  const store = new FakeStore();
  const request = makeRequest(VALID_PAYLOAD, {
    headers: {
      Authorization: "",
      "x-kakao-event-secret": ADMIN_KEY,
    },
  });

  const response = await makeHandler(store)(request);

  assertEquals(response.status, 401);
  assertEquals(store.resolvedAdminKeyHash, "");
});

Deno.test("requires X-Kakao-Resource-ID", async () => {
  const store = new FakeStore();
  const request = makeRequest();
  request.headers.delete("X-Kakao-Resource-ID");

  const response = await makeHandler(store)(request);

  assertEquals(response.status, 400);
});

Deno.test("rejects event names outside the exact allowlist", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(
    makeRequest({ ...VALID_PAYLOAD, event: "unblocked" }),
  );

  assertEquals(response.status, 400);
  assertEquals(store.processedPayload, null);
});

Deno.test("rejects nested legacy payloads", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(
    makeRequest({
      event: "blocked",
      user: { id: "1111", properties: { plusfriendUserKey: "pf-1" } },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(store.processedPayload, null);
});

Deno.test("rejects unsupported user ID namespaces", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(
    makeRequest({ ...VALID_PAYLOAD, id_type: "bot_user_id" }),
  );

  assertEquals(response.status, 400);
});

Deno.test("returns a retryable response when the atomic mutation fails", async () => {
  const store = new FakeStore();
  store.processingError = new Error("simulated database error");

  const response = await makeHandler(store)(makeRequest());

  assertEquals(response.status, 503);
  assertEquals(response.headers.get("retry-after"), "1");
  const body = await response.json();
  assert(typeof body.error === "string");
  assert(!JSON.stringify(body).includes("simulated database error"));
});

Deno.test("rejects bodies larger than 16 KiB before store access", async () => {
  const store = new FakeStore();
  const response = await makeHandler(store)(
    makeRequest(VALID_PAYLOAD, {
      rawBody: JSON.stringify({
        ...VALID_PAYLOAD,
        padding: "x".repeat(17 * 1024),
      }),
    }),
  );

  assertEquals(response.status, 413);
  assertEquals(store.resolvedAdminKeyHash, "");
});

Deno.test("aborts dependency work before Kakao's three-second deadline", async () => {
  const store = new FakeStore();
  store.resolveOwner = (
    _adminKeyHash: string,
    _channelPublicId: string,
    _channelUuid: string,
    signal?: AbortSignal,
  ) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  const handler = createKakaoChannelEventHandler({
    createStore: () => store,
    timeoutMs: 10,
  });
  const startedAt = performance.now();

  const response = await handler(makeRequest());

  assertEquals(response.status, 503);
  assert(
    performance.now() - startedAt < 500,
    "Webhook timeout did not abort promptly",
  );
});
