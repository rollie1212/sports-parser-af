import axios from "axios";

const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

export async function youtubeSearch({
  apiKey,
  q,
  publishedAfterISO,
  maxResults = 10,
  pageToken,
  regionCode,
  relevanceLanguage,
}) {
  const client = axios.create({
    baseURL: YOUTUBE_API_BASE_URL,
    timeout: 15000,
  });

  const params = {
    key: apiKey,
    part: "snippet",
    type: "video",
    order: "relevance",
    q,
    maxResults,
    publishedAfter: publishedAfterISO,
    videoEmbeddable: "true",
    videoSyndicated: "true",
  };

  if (pageToken) {
    params.pageToken = pageToken;
  }
  if (regionCode) {
    params.regionCode = regionCode;
  }
  if (relevanceLanguage) {
    params.relevanceLanguage = relevanceLanguage;
  }

  const { data } = await client.get("/search", { params });
  const rawItems = Array.isArray(data?.items) ? data.items : [];

  const items = rawItems
    .map((item) => {
      const videoId = item?.id?.videoId;
      if (!videoId) return null;

      return {
        videoId,
        title: item?.snippet?.title || "Untitled",
        channelTitle: item?.snippet?.channelTitle || "Unknown channel",
        publishedAt: item?.snippet?.publishedAt || null,
        thumbnail:
          item?.snippet?.thumbnails?.medium?.url ||
          item?.snippet?.thumbnails?.default?.url ||
          null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter(Boolean);

  return {
    items,
    nextPageToken: data?.nextPageToken || null,
  };
}
