import { createHash } from "crypto";

const events = new Map();
const eventIdsByDedupeKey = new Map();

function nowIso() {
  return new Date().toISOString();
}

function createEventId(dedupeKey) {
  return createHash("sha1").update(String(dedupeKey)).digest("hex").slice(0, 12);
}

function normalizeEvent(input = {}) {
  const dedupeKey = String(input.dedupeKey || "");
  if (!dedupeKey) {
    throw new Error("dedupeKey is required");
  }

  const existingEventId = eventIdsByDedupeKey.get(dedupeKey);
  const eventId = existingEventId || createEventId(dedupeKey);
  const existing = events.get(eventId);
  const createdAt = existing?.createdAt || nowIso();

  const next = {
    ...existing,
    ...input,
    id: eventId,
    dedupeKey,
    createdAt,
    updatedAt: nowIso(),
    yt_cache: input.yt_cache || existing?.yt_cache || null,
    approved: input.approved || existing?.approved || null,
    status: input.status || existing?.status || "PENDING",
  };

  return next;
}

export function upsertEvent(input) {
  const next = normalizeEvent(input);
  events.set(next.id, next);
  eventIdsByDedupeKey.set(next.dedupeKey, next.id);
  return next;
}

export function getEvent(eventId) {
  return events.get(eventId) || null;
}

export function listEvents() {
  return Array.from(events.values());
}

