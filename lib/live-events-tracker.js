import axios from "axios";

const API_BASE_URL = "https://v3.football.api-sports.io";
const DUPLICATE_KEY_CODE = 11000;

function toNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function minuteLabel(time = {}) {
  const elapsed = Number.isFinite(time.elapsed) ? time.elapsed : null;
  const extra = Number.isFinite(time.extra) ? time.extra : null;
  if (elapsed === null) return "N/A";
  if (extra === null || extra <= 0) return `${elapsed}'`;
  return `${elapsed}+${extra}'`;
}

function eventEmoji(event = {}) {
  const text = `${event.type || ""} ${event.detail || ""}`.toLowerCase();
  if (text.includes("red card")) return "🟥";
  if (text.includes("yellow card")) return "🟨";
  if (text.includes("card")) return "🟨";
  if (text.includes("goal")) return "⚽";
  if (text.includes("penalty")) return "🎯";
  if (text.includes("substitution")) return "🔁";
  if (text.includes("var")) return "🖥️";
  return "📣";
}

export function createLiveEventsTracker({
  db,
  apiKey,
  telegramBotToken,
  telegramChatId,
  enabled = false,
  getTrackedFixtureIds = null,
  shouldTrackFixture = null,
  intervalSeconds = 60,
  timezone = "Europe/Prague",
  logger = console,
}) {
  const trackerEnabled =
    enabled && Boolean(apiKey && telegramBotToken && telegramChatId);
  const intervalMs = toNumber(intervalSeconds, 60) * 1000;
  const notifications = db.collection("live_event_notifications");
  const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    headers: { "x-apisports-key": apiKey },
  });
  const telegram = axios.create({
    baseURL: `https://api.telegram.org/bot${telegramBotToken}`,
    timeout: 10000,
  });

  let timer = null;
  let polling = false;

  function formatMessage(fixture, event) {
    const home = fixture?.teams?.home?.name || "Home";
    const away = fixture?.teams?.away?.name || "Away";
    const league = fixture?.league?.name || "Unknown league";
    const country = fixture?.league?.country || "Unknown country";
    const status = fixture?.fixture?.status?.short || "LIVE";
    const scoreHome = Number.isInteger(fixture?.goals?.home) ? fixture.goals.home : 0;
    const scoreAway = Number.isInteger(fixture?.goals?.away) ? fixture.goals.away : 0;
    const team = event?.team?.name || "Unknown team";
    const player = event?.player?.name || null;
    const assist = event?.assist?.name || null;
    const detail = event?.detail || event?.type || "Match event";
    const comments = event?.comments || null;
    const icon = eventEmoji(event);

    const lines = [
      `<b>${icon} Live Match Event</b>`,
      `<b>${escapeHtml(league)}</b> (${escapeHtml(country)})`,
      `${escapeHtml(home)} ${scoreHome}:${scoreAway} ${escapeHtml(away)}`,
      `Minute: <b>${escapeHtml(minuteLabel(event?.time))}</b>`,
      `Event: <b>${escapeHtml(detail)}</b>`,
      `Team: ${escapeHtml(team)}`,
      `Status: ${escapeHtml(status)}`,
    ];

    if (player) lines.push(`Player: ${escapeHtml(player)}`);
    if (assist) lines.push(`Assist: ${escapeHtml(assist)}`);
    if (comments) lines.push(`Note: ${escapeHtml(comments)}`);

    return lines.join("\n");
  }

  function eventKey(fixtureId, event) {
    const pieces = [
      fixtureId,
      event?.time?.elapsed ?? "",
      event?.time?.extra ?? "",
      event?.type ?? "",
      event?.detail ?? "",
      event?.team?.id ?? "",
      event?.player?.id ?? "",
      event?.assist?.id ?? "",
      event?.comments ?? "",
    ];
    return pieces.join("|");
  }

  async function sendToTelegram(messageText) {
    await telegram.post("/sendMessage", {
      chat_id: telegramChatId,
      text: messageText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }

  async function fetchLiveFixtures() {
    const { data } = await api.get("/fixtures", {
      params: { live: "all", timezone },
    });
    return Array.isArray(data?.response) ? data.response : [];
  }

  async function fetchFixtureEvents(fixtureId) {
    const { data } = await api.get("/fixtures/events", {
      params: { fixture: fixtureId },
    });
    return Array.isArray(data?.response) ? data.response : [];
  }

  async function processFixture(fixture) {
    const fixtureId = fixture?.fixture?.id;
    if (!fixtureId) return 0;

    const events = await fetchFixtureEvents(fixtureId);
    if (!events.length) return 0;

    let sent = 0;

    for (const event of events) {
      const key = eventKey(fixtureId, event);
      try {
        await notifications.insertOne({
          eventKey: key,
          fixtureId,
          createdAt: new Date(),
        });
      } catch (error) {
        if (error?.code === DUPLICATE_KEY_CODE) {
          continue;
        }
        throw error;
      }

      const message = formatMessage(fixture, event);
      await sendToTelegram(message);
      sent++;
    }

    return sent;
  }

  async function pollOnce() {
    if (!trackerEnabled || polling) return { enabled: trackerEnabled, sent: 0 };
    polling = true;
    try {
      const liveFixtures = await fetchLiveFixtures();
      if (!liveFixtures.length) return { enabled: trackerEnabled, sent: 0, liveFixtures: 0 };

      let trackedIds = null;
      if (typeof getTrackedFixtureIds === "function") {
        const rawIds = await getTrackedFixtureIds();
        trackedIds = new Set(
          Array.isArray(rawIds)
            ? rawIds
                .map((id) => Number.parseInt(id, 10))
                .filter((id) => Number.isFinite(id))
            : []
        );
      }

      const fixturesToProcess =
        trackedIds === null
          ? liveFixtures
          : liveFixtures.filter((f) => trackedIds.has(f?.fixture?.id));
      const scopeFilteredFixtures =
        typeof shouldTrackFixture === "function"
          ? fixturesToProcess.filter((f) => shouldTrackFixture(f))
          : fixturesToProcess;

      if (!scopeFilteredFixtures.length) {
        return {
          enabled: trackerEnabled,
          sent: 0,
          liveFixtures: liveFixtures.length,
          trackedLiveFixtures: fixturesToProcess.length,
          scopedLiveFixtures: 0,
        };
      }

      let sent = 0;
      for (const fixture of scopeFilteredFixtures) {
        sent += await processFixture(fixture);
      }

      if (sent > 0) {
        logger.log(`📨 Sent ${sent} new live events to Telegram`);
      }
      return {
        enabled: trackerEnabled,
        sent,
        liveFixtures: liveFixtures.length,
        trackedLiveFixtures: fixturesToProcess.length,
        scopedLiveFixtures: scopeFilteredFixtures.length,
      };
    } catch (error) {
      logger.error("❌ Live events tracker poll failed:", error.message);
      return { enabled: trackerEnabled, sent: 0, error: error.message };
    } finally {
      polling = false;
    }
  }

  async function start() {
    if (!trackerEnabled) {
      logger.log("ℹ️ Live events tracker disabled (missing API or Telegram env vars)");
      return;
    }

    await notifications.createIndex({ eventKey: 1 }, { unique: true });
    await notifications.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 3 * 24 * 60 * 60 }
    );

    await pollOnce();
    timer = setInterval(pollOnce, intervalMs);
    logger.log(
      `✅ Live events tracker started (interval: ${Math.round(intervalMs / 1000)}s)`
    );
  }

  async function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, pollOnce };
}
