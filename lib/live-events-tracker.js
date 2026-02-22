import axios from "axios";
import { youtubeSearch } from "./youtube.js";
import { redditSearch } from "./reddit.js";
import { buildQueries, buildRedditQueries } from "./queries.js";
import { getEvent, upsertEvent } from "./store.js";

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

function eventText(event = {}) {
  return `${event.type || ""} ${event.detail || ""} ${event.comments || ""}`.toLowerCase();
}

function eventMinute(event = {}) {
  const elapsed = Number.isFinite(event?.time?.elapsed) ? event.time.elapsed : null;
  const extra = Number.isFinite(event?.time?.extra) ? event.time.extra : 0;
  if (elapsed === null) return null;
  return elapsed + Math.max(extra, 0);
}

function shouldSendEvent(event = {}) {
  const text = eventText(event);
  const minute = eventMinute(event);

  const isGoal = text.includes("goal");
  const isLastMinuteGoal = isGoal && minute !== null && minute >= 85;

  const isVar = text.includes("var");
  const isInjury = text.includes("injury");
  const isRedCard =
    text.includes("red card") ||
    text.includes("second yellow") ||
    text.includes("2nd yellow");

  return isInjury || isRedCard || isVar || isLastMinuteGoal;
}

function formatDate(value) {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function dedupeByVideoId(items = []) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (!item?.videoId || seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    unique.push(item);
  }
  return unique;
}

function dedupeByPostId(items = []) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (!item?.postId || seen.has(item.postId)) continue;
    seen.add(item.postId);
    unique.push(item);
  }
  return unique;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїєçğşüáéíóúñ\s-]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function buildSpamKeywords(raw) {
  if (raw) {
    return new Set(
      String(raw)
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    );
  }
  return new Set([
    "efootball",
    "fifa",
    "fc24",
    "pes",
    "tips",
    "betting",
    "prediction",
    "pronostic",
    "pronostico",
    "parlay",
    "odds",
    "win big",
  ]);
}

function rankYoutubeItems(evt, items, spamKeywords) {
  const homeTokens = tokenize(evt?.home);
  const awayTokens = tokenize(evt?.away);
  const leagueTokens = tokenize(evt?.league);
  const eventTokens = tokenize(`${evt?.eventDetail || ""} ${evt?.eventType || ""}`);
  const genericSportsTokens = new Set(["highlights", "goal", "red", "card", "injury", "var"]);

  function teamMatchScore(tokens, title) {
    let score = 0;
    const all = title.toLowerCase();
    const hasHome = tokens.some((t) => homeTokens.includes(t));
    const hasAway = tokens.some((t) => awayTokens.includes(t));
    if (hasHome && hasAway) score += 40;
    else if (hasHome || hasAway) score += 18;
    return score;
  }

  function tokenHitsScore(tokens, haystack, weight) {
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += weight;
    }
    return score;
  }

  return items
    .map((item) => {
      const title = String(item?.title || "");
      const lower = title.toLowerCase();
      const titleTokens = tokenize(title);

      let score = 0;
      score += teamMatchScore(titleTokens, lower);
      score += tokenHitsScore(leagueTokens, lower, 4);
      score += tokenHitsScore(eventTokens, lower, 3);
      score += tokenHitsScore(Array.from(genericSportsTokens), lower, 2);

      if (title.length < 12) score -= 8;
      if (title.length > 140) score -= 5;

      for (const spam of spamKeywords) {
        if (lower.includes(spam)) score -= 25;
      }

      const publishedTs = item?.publishedAt ? new Date(item.publishedAt).getTime() : 0;
      if (Number.isFinite(publishedTs) && publishedTs > 0) {
        const ageHours = (Date.now() - publishedTs) / (1000 * 60 * 60);
        if (ageHours <= 24) score += 8;
        else if (ageHours <= 72) score += 4;
      }

      return { ...item, _score: score };
    })
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
    });
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
  youtubeApiKey,
  ytLookbackHours = 6,
  ytMaxResults = 10,
  ytCacheMinutes = 10,
  ytRegionCode,
  ytRelevanceLanguage,
  ytSpamKeywords,
  rdtLookbackHours = 12,
  rdtMaxResults = 10,
  rdtCacheMinutes = 10,
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
  const ytLookbackMs = toNumber(ytLookbackHours, 6) * 60 * 60 * 1000;
  const ytSearchMaxResults = toNumber(ytMaxResults, 10);
  const ytCacheTtlMs = toNumber(ytCacheMinutes, 10) * 60 * 1000;
  const spamKeywords = buildSpamKeywords(ytSpamKeywords);
  const rdtLookbackMs = toNumber(rdtLookbackHours, 12) * 60 * 60 * 1000;
  const rdtSearchMaxResults = toNumber(rdtMaxResults, 10);
  const rdtCacheTtlMs = toNumber(rdtCacheMinutes, 10) * 60 * 1000;

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
    const { data } = await telegram.post("/sendMessage", {
      chat_id: telegramChatId,
      text: messageText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return data;
  }

  async function sendToTelegramWithMarkup(messageText, replyMarkup) {
    const { data } = await telegram.post("/sendMessage", {
      chat_id: telegramChatId,
      text: messageText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
    return data;
  }

  async function editTelegramMessage(chatId, messageId, text, replyMarkup) {
    const { data } = await telegram.post("/editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
    return data;
  }

  async function answerCallbackQuery(callbackQueryId, text) {
    await telegram.post("/answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
  }

  function eventKeyboard(eventId) {
    return {
      inline_keyboard: [
        [{ text: "🔎 Найти видео (YouTube)", callback_data: `yt_search:${eventId}` }],
        [{ text: "🧵 Найти посты (Reddit)", callback_data: `rd_search:${eventId}` }],
        [{ text: "❌ Skip", callback_data: `evt_skip:${eventId}` }],
      ],
    };
  }

  function buildEventTitle(evt) {
    const header = `${evt.home || "Home"} vs ${evt.away || "Away"}`;
    const league = evt.league || "Unknown league";
    const minute = evt.minuteLabel || "N/A";
    const player = evt.player || "Unknown player";
    const detail = evt.eventDetail || evt.eventType || "Event";
    return `<b>${escapeHtml(header)}</b>\n${escapeHtml(league)}\n${escapeHtml(minute)} • ${escapeHtml(player)} • ${escapeHtml(detail)}`;
  }

  function videoResultsKeyboard(eventId, results, nextPageToken) {
    const rows = results.slice(0, 5).map((video, idx) => [
      { text: `✅ Use #${idx + 1}`, callback_data: `yt_pick:${eventId}:${video.videoId}` },
      { text: "▶️ Open", url: video.url },
    ]);

    const navRow = [];
    if (nextPageToken) {
      navRow.push({ text: "🔁 Ещё", callback_data: `yt_more:${eventId}` });
    }
    navRow.push({ text: "⬅️ Назад", callback_data: `yt_back:${eventId}` });
    rows.push(navRow);

    return { inline_keyboard: rows };
  }

  function renderVideoResults(evt, results) {
    const title = buildEventTitle(evt);
    const lines = [title, "", "<b>YouTube топ-5</b>"];

    results.slice(0, 5).forEach((item, idx) => {
      lines.push(
        `${idx + 1}. <b>${escapeHtml(item.title)}</b>\n` +
          `   ${escapeHtml(item.channelTitle)} • ${escapeHtml(formatDate(item.publishedAt))}`
      );
      if (item.thumbnail) {
        lines.push(`   🖼 ${escapeHtml(item.thumbnail)}`);
      }
    });

    return lines.join("\n");
  }

  function renderNoResults(evt) {
    return `${buildEventTitle(evt)}\n\nНичего не найдено, попробуй позже`;
  }

  function redditResultsKeyboard(eventId, results, after) {
    const rows = results.slice(0, 5).map((post, idx) => [
      { text: `✅ Use #${idx + 1}`, callback_data: `rd_pick:${eventId}:${post.postId}` },
      { text: "▶️ Open", url: post.url },
    ]);

    const navRow = [];
    if (after) {
      navRow.push({ text: "🔁 Ещё", callback_data: `rd_more:${eventId}` });
    }
    navRow.push({ text: "⬅️ Назад", callback_data: `yt_back:${eventId}` });
    rows.push(navRow);
    return { inline_keyboard: rows };
  }

  function renderRedditResults(evt, results) {
    const title = buildEventTitle(evt);
    const lines = [title, "", "<b>Reddit топ-5</b>"];

    results.slice(0, 5).forEach((item, idx) => {
      lines.push(
        `${idx + 1}. <b>${escapeHtml(item.title)}</b>\n` +
          `   ${escapeHtml(item.subreddit)} by ${escapeHtml(item.author)} • ${escapeHtml(
            formatDate(item.createdAt)
          )}`
      );
      if (item.thumbnail) {
        lines.push(`   🖼 ${escapeHtml(item.thumbnail)}`);
      }
    });

    return lines.join("\n");
  }

  function parseCallbackData(callbackData = "") {
    const [action, eventId, videoId] = String(callbackData).split(":");
    return { action, eventId, videoId };
  }

  function getPublishedAfterIso() {
    return new Date(Date.now() - ytLookbackMs).toISOString();
  }

  function getRedditAfterIso() {
    return new Date(Date.now() - rdtLookbackMs).toISOString();
  }

  function isCacheFresh(evt) {
    if (!evt?.yt_cache?.cachedAt) return false;
    const age = Date.now() - new Date(evt.yt_cache.cachedAt).getTime();
    return age >= 0 && age < ytCacheTtlMs;
  }

  function isRedditCacheFresh(evt) {
    if (!evt?.rdt_cache?.cachedAt) return false;
    const age = Date.now() - new Date(evt.rdt_cache.cachedAt).getTime();
    return age >= 0 && age < rdtCacheTtlMs;
  }

  async function runInitialYoutubeSearch(evt) {
    const queries = buildQueries(evt).slice(0, 2);
    const publishedAfterISO = getPublishedAfterIso();

    const combined = [];
    let nextPageToken = null;
    let calls = 0;

    for (let i = 0; i < queries.length && calls < 2; i++) {
      const query = queries[i];
      const response = await youtubeSearch({
        apiKey: youtubeApiKey,
        q: query,
        publishedAfterISO,
        maxResults: ytSearchMaxResults,
        regionCode: ytRegionCode,
        relevanceLanguage: ytRelevanceLanguage,
      });
      calls += 1;
      combined.push(...response.items);
      if (i === 0) {
        nextPageToken = response.nextPageToken || null;
      }
    }

    const results = rankYoutubeItems(evt, dedupeByVideoId(combined), spamKeywords);
    const nextCache = {
      results,
      nextPageToken,
      cachedAt: new Date().toISOString(),
      queries,
    };

    return nextCache;
  }

  async function runInitialRedditSearch(evt) {
    const queries = buildRedditQueries(evt).slice(0, 2);
    const lowerBoundIso = getRedditAfterIso();

    const combined = [];
    let after = null;
    for (let i = 0; i < queries.length; i++) {
      const response = await redditSearch({
        q: queries[i],
        limit: rdtSearchMaxResults,
      });
      combined.push(...response.items);
      if (i === 0) {
        after = response.after || null;
      }
    }

    const filtered = dedupeByPostId(combined).filter((item) => {
      if (!item.createdAt) return true;
      return new Date(item.createdAt).getTime() >= new Date(lowerBoundIso).getTime();
    });

    return {
      results: filtered,
      after,
      cachedAt: new Date().toISOString(),
      queries,
    };
  }

  async function handleYtSearch(callbackQuery, eventId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }
    if (!youtubeApiKey) {
      await answerCallbackQuery(callbackQuery.id, "YOUTUBE_API_KEY missing");
      return;
    }

    try {
      let cache = evt.yt_cache;
      if (!isCacheFresh(evt)) {
        cache = await runInitialYoutubeSearch(evt);
        upsertEvent({ id: evt.id, dedupeKey: evt.dedupeKey, yt_cache: cache });
      }

      const chatId = callbackQuery.message?.chat?.id;
      const messageId = callbackQuery.message?.message_id;
      if (!chatId || !messageId) return;

      if (!cache?.results?.length) {
        await editTelegramMessage(chatId, messageId, renderNoResults(evt), {
          inline_keyboard: [
            [{ text: "🔁 Повторить", callback_data: `yt_search:${evt.id}` }],
            [{ text: "🧵 Reddit", callback_data: `rd_search:${evt.id}` }],
            [{ text: "⬅️ Назад", callback_data: `yt_back:${evt.id}` }],
          ],
        });
        await answerCallbackQuery(callbackQuery.id, "Ничего не найдено");
        return;
      }

      await editTelegramMessage(
        chatId,
        messageId,
        renderVideoResults(evt, cache.results),
        videoResultsKeyboard(evt.id, cache.results, cache.nextPageToken)
      );
      await answerCallbackQuery(callbackQuery.id, "Готово");
    } catch (error) {
      logger.error("❌ YouTube search error:", error?.response?.data || error.message);
      await answerCallbackQuery(callbackQuery.id, "Ошибка YouTube API");
    }
  }

  async function handleRdSearch(callbackQuery, eventId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }

    try {
      let cache = evt.rdt_cache;
      if (!isRedditCacheFresh(evt)) {
        cache = await runInitialRedditSearch(evt);
        upsertEvent({ id: evt.id, dedupeKey: evt.dedupeKey, rdt_cache: cache });
      }

      const chatId = callbackQuery.message?.chat?.id;
      const messageId = callbackQuery.message?.message_id;
      if (!chatId || !messageId) return;

      if (!cache?.results?.length) {
        await editTelegramMessage(chatId, messageId, renderNoResults(evt), {
          inline_keyboard: [
            [{ text: "🔁 Повторить", callback_data: `rd_search:${evt.id}` }],
            [{ text: "🔎 YouTube", callback_data: `yt_search:${evt.id}` }],
            [{ text: "⬅️ Назад", callback_data: `yt_back:${evt.id}` }],
          ],
        });
        await answerCallbackQuery(callbackQuery.id, "Ничего не найдено");
        return;
      }

      await editTelegramMessage(
        chatId,
        messageId,
        renderRedditResults(evt, cache.results),
        redditResultsKeyboard(evt.id, cache.results, cache.after)
      );
      await answerCallbackQuery(callbackQuery.id, "Готово");
    } catch (error) {
      logger.error("❌ Reddit search error:", error?.response?.data || error.message);
      await answerCallbackQuery(callbackQuery.id, "Ошибка Reddit поиска");
    }
  }

  async function handleRdMore(callbackQuery, eventId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }
    const cache = evt.rdt_cache;
    if (!cache?.after || !cache?.queries?.[0]) {
      await answerCallbackQuery(callbackQuery.id, "Больше результатов нет");
      return;
    }

    try {
      const response = await redditSearch({
        q: cache.queries[0],
        limit: rdtSearchMaxResults,
        after: cache.after,
      });

      const merged = dedupeByPostId([...(cache.results || []), ...response.items]).filter(
        (item) => {
          if (!item.createdAt) return true;
          return (
            new Date(item.createdAt).getTime() >=
            Date.now() - rdtLookbackMs
          );
        }
      );

      const nextCache = {
        ...cache,
        results: merged,
        after: response.after || null,
        cachedAt: new Date().toISOString(),
      };

      upsertEvent({ id: evt.id, dedupeKey: evt.dedupeKey, rdt_cache: nextCache });

      const chatId = callbackQuery.message?.chat?.id;
      const messageId = callbackQuery.message?.message_id;
      if (!chatId || !messageId) return;

      await editTelegramMessage(
        chatId,
        messageId,
        renderRedditResults(evt, nextCache.results),
        redditResultsKeyboard(evt.id, nextCache.results, nextCache.after)
      );
      await answerCallbackQuery(callbackQuery.id, "Обновлено");
    } catch (error) {
      logger.error("❌ Reddit more error:", error?.response?.data || error.message);
      await answerCallbackQuery(callbackQuery.id, "Ошибка Reddit поиска");
    }
  }

  async function handleRdPick(callbackQuery, eventId, postId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }

    const post = (evt.rdt_cache?.results || []).find((item) => item.postId === postId);
    if (!post) {
      await answerCallbackQuery(callbackQuery.id, "Пост не найден в кеше");
      return;
    }

    const next = upsertEvent({
      id: evt.id,
      dedupeKey: evt.dedupeKey,
      approved: {
        source: "reddit",
        videoId: post.postId,
        url: post.url,
        title: post.title,
      },
      status: "APPROVED",
    });

    await sendToTelegram(
      `✅ Пост выбран\n` +
        `${escapeHtml(next.home)} vs ${escapeHtml(next.away)}\n` +
        `<b>${escapeHtml(post.title)}</b>\n${escapeHtml(post.url)}`
    );
    await answerCallbackQuery(callbackQuery.id, "Выбрано");
  }

  async function handleYtMore(callbackQuery, eventId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }
    if (!youtubeApiKey) {
      await answerCallbackQuery(callbackQuery.id, "YOUTUBE_API_KEY missing");
      return;
    }

    const cache = evt.yt_cache;
    if (!cache?.nextPageToken || !cache?.queries?.[0]) {
      await answerCallbackQuery(callbackQuery.id, "Больше результатов нет");
      return;
    }

    try {
      const response = await youtubeSearch({
        apiKey: youtubeApiKey,
        q: cache.queries[0],
        publishedAfterISO: getPublishedAfterIso(),
        maxResults: ytSearchMaxResults,
        pageToken: cache.nextPageToken,
        regionCode: ytRegionCode,
        relevanceLanguage: ytRelevanceLanguage,
      });

      const merged = rankYoutubeItems(
        evt,
        dedupeByVideoId([...(cache.results || []), ...response.items]),
        spamKeywords
      );
      const nextCache = {
        ...cache,
        results: merged,
        nextPageToken: response.nextPageToken || null,
        cachedAt: new Date().toISOString(),
      };

      upsertEvent({ id: evt.id, dedupeKey: evt.dedupeKey, yt_cache: nextCache });

      const chatId = callbackQuery.message?.chat?.id;
      const messageId = callbackQuery.message?.message_id;
      if (!chatId || !messageId) return;

      await editTelegramMessage(
        chatId,
        messageId,
        renderVideoResults(evt, nextCache.results),
        videoResultsKeyboard(evt.id, nextCache.results, nextCache.nextPageToken)
      );
      await answerCallbackQuery(callbackQuery.id, "Обновлено");
    } catch (error) {
      logger.error("❌ YouTube more error:", error?.response?.data || error.message);
      await answerCallbackQuery(callbackQuery.id, "Ошибка YouTube API");
    }
  }

  async function handleYtPick(callbackQuery, eventId, videoId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }

    const video = (evt.yt_cache?.results || []).find((item) => item.videoId === videoId);
    if (!video) {
      await answerCallbackQuery(callbackQuery.id, "Видео не найдено в кеше");
      return;
    }

    const next = upsertEvent({
      id: evt.id,
      dedupeKey: evt.dedupeKey,
      approved: { videoId: video.videoId, url: video.url, title: video.title },
      status: "APPROVED",
    });

    await sendToTelegram(
      `✅ Видео выбрано\n` +
        `${escapeHtml(next.home)} vs ${escapeHtml(next.away)}\n` +
        `<b>${escapeHtml(video.title)}</b>\n${escapeHtml(video.url)}`
    );
    await answerCallbackQuery(callbackQuery.id, "Выбрано");
  }

  async function handleYtBack(callbackQuery, eventId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    if (!chatId || !messageId) return;

    await editTelegramMessage(chatId, messageId, evt.originalText || buildEventTitle(evt), eventKeyboard(evt.id));
    await answerCallbackQuery(callbackQuery.id, "Назад");
  }

  async function handleSkip(callbackQuery, eventId) {
    const evt = getEvent(eventId);
    if (!evt) {
      await answerCallbackQuery(callbackQuery.id, "Событие не найдено");
      return;
    }
    upsertEvent({ id: evt.id, dedupeKey: evt.dedupeKey, status: "SKIPPED" });
    await answerCallbackQuery(callbackQuery.id, "Пропущено");
  }

  async function handleTelegramUpdate(update) {
    const callbackQuery = update?.callback_query;
    if (!callbackQuery?.data) {
      return { ok: true, ignored: true };
    }

    const { action, eventId, videoId } = parseCallbackData(callbackQuery.data);

    switch (action) {
      case "yt_search":
        await handleYtSearch(callbackQuery, eventId);
        return { ok: true, action };
      case "yt_more":
        await handleYtMore(callbackQuery, eventId);
        return { ok: true, action };
      case "yt_pick":
        await handleYtPick(callbackQuery, eventId, videoId);
        return { ok: true, action };
      case "rd_search":
        await handleRdSearch(callbackQuery, eventId);
        return { ok: true, action };
      case "rd_more":
        await handleRdMore(callbackQuery, eventId);
        return { ok: true, action };
      case "rd_pick":
        await handleRdPick(callbackQuery, eventId, videoId);
        return { ok: true, action };
      case "yt_back":
        await handleYtBack(callbackQuery, eventId);
        return { ok: true, action };
      case "evt_skip":
        await handleSkip(callbackQuery, eventId);
        return { ok: true, action };
      default:
        await answerCallbackQuery(callbackQuery.id, "Неизвестное действие");
        return { ok: true, action: "unknown" };
    }
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
      if (!shouldSendEvent(event)) {
        continue;
      }

      const key = eventKey(fixtureId, event);
      const minute = minuteLabel(event?.time);
      const detail = event?.detail || event?.type || "Match event";
      const player = event?.player?.name || "";
      const eventDoc = upsertEvent({
        dedupeKey: key,
        fixtureId,
        home: fixture?.teams?.home?.name || "Home",
        away: fixture?.teams?.away?.name || "Away",
        league: fixture?.league?.name || "Unknown league",
        minuteLabel: minute,
        player,
        eventType: event?.type || "",
        eventDetail: detail,
        status: "PENDING",
      });
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
      const telegramMessage = await sendToTelegramWithMarkup(
        message,
        eventKeyboard(eventDoc.id)
      );
      upsertEvent({
        id: eventDoc.id,
        dedupeKey: eventDoc.dedupeKey,
        originalText: message,
        chatId: telegramMessage?.result?.chat?.id || telegramChatId,
        messageId: telegramMessage?.result?.message_id || null,
      });
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

  return { start, stop, pollOnce, handleTelegramUpdate };
}
