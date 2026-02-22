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
    `${home} ${away} ${detail} ${player} ${minute} highlights`
  );
  const q2 = compactSpaces(`${home} ${away} ${league} ${detail} highlights`);

  return [q1, q2].filter(Boolean).slice(0, 2);
}

