function toLeagueId(value) {
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLeagueIdAllowlist(rawValue) {
  if (!rawValue) return new Set();

  const ids = String(rawValue)
    .split(",")
    .map((item) => toLeagueId(item))
    .filter((id) => id !== null);

  return new Set(ids);
}

export function createLeagueIdMatcher(leagueIdAllowlist) {
  const allowlist =
    leagueIdAllowlist instanceof Set
      ? leagueIdAllowlist
      : new Set(Array.isArray(leagueIdAllowlist) ? leagueIdAllowlist : []);

  return (fixture) => {
    const leagueId = toLeagueId(fixture?.league?.id);
    if (leagueId === null) return false;
    return allowlist.has(leagueId);
  };
}
