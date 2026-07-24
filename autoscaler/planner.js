export function desiredReplicas(activeBuilds, minReplicas, maxReplicas) {
  if (!Number.isInteger(activeBuilds) || activeBuilds < 0) throw new Error('activeBuilds must be a non-negative integer');
  return Math.min(maxReplicas, Math.max(minReplicas, activeBuilds));
}

export function selectReusableToken({ agents, tokens, leases, now }) {
  const leased = new Set(Object.values(leases).filter((lease) => lease.expiresAt > now).map((lease) => lease.tokenId));
  const attached = new Set(agents.map((agent) => agent.tokenId));
  const offlineAgent = agents.find((agent) => !agent.online && !leased.has(agent.tokenId));
  if (offlineAgent) return tokens.find((token) => token.id === offlineAgent.tokenId) || null;
  return tokens.find((token) => !attached.has(token.id) && !leased.has(token.id)) || null;
}
