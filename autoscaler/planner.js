export function desiredReplicas(activeBuilds, minReplicas, maxReplicas) {
  if (!Number.isInteger(activeBuilds) || activeBuilds < 0) throw new Error('activeBuilds must be a non-negative integer');
  return Math.min(maxReplicas, Math.max(minReplicas, activeBuilds));
}

export function selectReusableToken({ agents, tokens, leases, now }) {
  const leased = new Set(Object.values(leases).filter((lease) => lease.expiresAt > now).map((lease) => lease.tokenId));
  const attached = new Set(agents.map((agent) => agent.token.id));
  const offlineAgent = agents.find((agent) => !agent.online && !leased.has(agent.token.id));
  if (offlineAgent) return offlineAgent.token;
  return tokens.find((token) => !attached.has(token.id) && !leased.has(token.id)) || null;
}
