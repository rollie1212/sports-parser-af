function clean(value) {
  return String(value || "").trim();
}

function compactSpaces(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function buildQueries(evt) {
  const home = clean(evt?.home);
  const away = clean(evt?.away);
  const league = clean(evt?.league);
  const player = clean(evt?.player);
  const minute = clean(evt?.minuteLabel || evt?.minute);
  const detail = clean(evt?.eventDetail || evt?.eventType);

  const q1 = compactSpaces(
    `"${home}" "${away}" ${league} ${detail} ${player} ${minute} highlights -fifa -efootball -fc24 -pes -betting -tips`
  );
  const q2 = compactSpaces(
    `"${home}" "${away}" ${detail} official highlights -fifa -efootball -fc24 -pes -betting -tips`
  );

  return [q1, q2].filter(Boolean).slice(0, 2);
}

export function buildRedditQueries(evt) {
  const home = clean(evt?.home);
  const away = clean(evt?.away);
  const league = clean(evt?.league);
  const detail = clean(evt?.eventDetail || evt?.eventType);
  const player = clean(evt?.player);

  const q1 = compactSpaces(
    `"${home}" "${away}" ${detail} ${player} (subreddit:soccer OR subreddit:footballhighlights)`
  );
  const q2 = compactSpaces(
    `"${home}" "${away}" ${league} highlights (subreddit:soccer OR subreddit:footballhighlights)`
  );

  return [q1, q2].filter(Boolean).slice(0, 2);
}
