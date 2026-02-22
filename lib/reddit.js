import axios from "axios";

const REDDIT_BASE_URL = "https://www.reddit.com";

export async function redditSearch({
  q,
  limit = 10,
  after,
}) {
  const client = axios.create({
    baseURL: REDDIT_BASE_URL,
    timeout: 15000,
    headers: {
      "User-Agent": "sports-parser-af/1.0",
    },
  });

  const params = {
    q,
    sort: "new",
    type: "link",
    limit,
    restrict_sr: false,
  };

  if (after) {
    params.after = after;
  }

  const { data } = await client.get("/search.json", { params });
  const children = Array.isArray(data?.data?.children) ? data.data.children : [];

  const items = children
    .map((child) => child?.data)
    .filter(Boolean)
    .map((post) => {
      const permalink = post?.permalink ? `https://www.reddit.com${post.permalink}` : null;
      return {
        postId: post?.id || null,
        title: post?.title || "Untitled",
        subreddit: post?.subreddit_name_prefixed || "r/unknown",
        author: post?.author || "unknown",
        createdAt: post?.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : null,
        thumbnail:
          typeof post?.thumbnail === "string" && post.thumbnail.startsWith("http")
            ? post.thumbnail
            : null,
        url: post?.url_overridden_by_dest || post?.url || permalink,
        permalink,
      };
    })
    .filter((item) => item.postId && item.url);

  return {
    items,
    after: data?.data?.after || null,
  };
}

