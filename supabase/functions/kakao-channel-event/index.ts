// deno-lint-ignore-file no-explicit-any no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.4";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabaseClient = ReturnType<typeof createClient<any>>;

const MAX_BODY_BYTES = 16 * 1024;
const WEBHOOK_TIMEOUT_MS = 2_400;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export type KakaoChannelRelationshipEvent = "added" | "blocked";
export type KakaoChannelUserIdType = "app_user_id" | "open_id";

export interface KakaoChannelEventPayload {
  event: KakaoChannelRelationshipEvent;
  id: string;
  id_type: KakaoChannelUserIdType;
  channel_public_id: string;
  channel_uuid: string;
  updated_at: string;
}

interface KakaoChannelRow {
  owner_id: string;
  enabled: boolean;
}

export interface ProcessEventResult {
  processed: boolean;
  duplicate: boolean;
  matched_links: number;
}

export interface KakaoChannelEventStore {
  resolveOwner(
    adminKeyHash: string,
    channelPublicId: string,
    channelUuid: string,
    signal: AbortSignal,
  ): Promise<string | null>;
  processEvent(
    ownerId: string,
    resourceId: string,
    payload: KakaoChannelEventPayload,
    signal: AbortSignal,
  ): Promise<ProcessEventResult>;
}

export interface KakaoChannelEventHandlerOptions {
  createStore: () => KakaoChannelEventStore;
  timeoutMs?: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

class SupabaseKakaoChannelEventStore implements KakaoChannelEventStore {
  constructor(private readonly supabase: UntypedSupabaseClient) {}

  async resolveOwner(
    adminKeyHash: string,
    channelPublicId: string,
    channelUuid: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("growing_kakao_channels")
      .select("owner_id, enabled")
      .eq("event_admin_key_hash", adminKeyHash)
      .eq("kakao_channel_public_id", channelPublicId)
      .eq("kakao_channel_uuid", channelUuid)
      .eq("enabled", true)
      .abortSignal(signal)
      .maybeSingle();

    if (error) throw new Error("CHANNEL_LOOKUP_FAILED");
    return (data as KakaoChannelRow | null)?.owner_id ?? null;
  }

  async processEvent(
    ownerId: string,
    resourceId: string,
    payload: KakaoChannelEventPayload,
    signal: AbortSignal,
  ): Promise<ProcessEventResult> {
    const { data, error } = await this.supabase
      .rpc("growing_process_kakao_channel_event", {
        p_owner_id: ownerId,
        p_resource_id: resourceId,
        p_event: payload.event,
        p_subject_id: payload.id,
        p_id_type: payload.id_type,
        p_channel_public_id: payload.channel_public_id,
        p_channel_uuid: payload.channel_uuid,
        p_updated_at: payload.updated_at,
      })
      .abortSignal(signal);

    if (error) throw new Error("CHANNEL_EVENT_PROCESSING_FAILED");
    if (
      !isRecord(data) || typeof data.processed !== "boolean" ||
      typeof data.duplicate !== "boolean"
    ) {
      throw new Error("INVALID_CHANNEL_EVENT_RESULT");
    }

    return {
      processed: data.processed,
      duplicate: data.duplicate,
      matched_links: typeof data.matched_links === "number"
        ? data.matched_links
        : 0,
    };
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(
  obj: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...responseHeaders, ...extraHeaders },
  });
}

function noContentResponse(): Response {
  const headers = { ...responseHeaders };
  delete (headers as Partial<typeof responseHeaders>)["Content-Type"];
  return new Response(null, { status: 204, headers });
}

function requireOpaqueString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (
    typeof value !== "string" || value.length === 0 ||
    value.length > maxLength || value.trim() !== value
  ) {
    throw new HttpError(400, `Invalid ${field}`);
  }
  return value;
}

export function parseKakaoAuthorization(header: string | null): string {
  const match = header?.match(/^KakaoAK ([^\s]{16,128})$/);
  if (!match) throw new HttpError(401, "Unauthorized");
  return match[1];
}

export function parseKakaoChannelPayload(
  value: unknown,
): KakaoChannelEventPayload {
  if (!isRecord(value)) throw new HttpError(400, "Invalid payload");

  if (value.event !== "added" && value.event !== "blocked") {
    throw new HttpError(400, "Invalid event");
  }
  if (value.id_type !== "app_user_id" && value.id_type !== "open_id") {
    throw new HttpError(400, "Invalid id_type");
  }

  const updatedAt = requireOpaqueString(value.updated_at, "updated_at", 64);
  if (!RFC3339_PATTERN.test(updatedAt) || Number.isNaN(Date.parse(updatedAt))) {
    throw new HttpError(400, "Invalid updated_at");
  }

  return {
    event: value.event,
    id: requireOpaqueString(value.id, "id", 128),
    id_type: value.id_type,
    channel_public_id: requireOpaqueString(
      value.channel_public_id,
      "channel_public_id",
      100,
    ),
    channel_uuid: requireOpaqueString(value.channel_uuid, "channel_uuid", 100),
    updated_at: updatedAt,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readJsonBody(
  req: Request,
  signal: AbortSignal,
): Promise<unknown> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, "Payload too large");
  }

  if (!req.body) throw new HttpError(400, "Empty body");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const cancelOnAbort = () => {
    void reader.cancel(signal.reason);
  };
  signal.addEventListener("abort", cancelOnAbort, { once: true });

  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "Payload too large");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function createKakaoChannelEventHandler(
  options: KakaoChannelEventHandlerOptions,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, {
        Allow: "POST",
      });
    }

    const url = new URL(req.url);
    if (
      url.searchParams.has("secret") || url.searchParams.has("event_secret")
    ) {
      return jsonResponse({
        error: "Query-string authentication is not supported",
      }, 400);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? WEBHOOK_TIMEOUT_MS,
    );

    try {
      const adminKey = parseKakaoAuthorization(
        req.headers.get("authorization"),
      );
      const resourceId = requireOpaqueString(
        req.headers.get("x-kakao-resource-id"),
        "X-Kakao-Resource-ID",
        200,
      );
      const payload = parseKakaoChannelPayload(
        await readJsonBody(req, controller.signal),
      );
      const adminKeyHash = await sha256Hex(adminKey);
      const store = options.createStore();
      const ownerId = await store.resolveOwner(
        adminKeyHash,
        payload.channel_public_id,
        payload.channel_uuid,
        controller.signal,
      );

      if (!ownerId) return jsonResponse({ error: "Unauthorized" }, 401);

      await store.processEvent(ownerId, resourceId, payload, controller.signal);
      return noContentResponse();
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status);
      }

      const errorName = controller.signal.aborted
        ? "WebhookDeadlineExceeded"
        : error instanceof Error
        ? error.message
        : "UnknownError";
      console.error("Kakao channel webhook failed:", errorName);
      return jsonResponse({ error: "Webhook processing failed" }, 503, {
        "Retry-After": "1",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

function createProductionStore(): KakaoChannelEventStore {
  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  return new SupabaseKakaoChannelEventStore(supabase);
}

if (import.meta.main) {
  Deno.serve(
    createKakaoChannelEventHandler({ createStore: createProductionStore }),
  );
}
