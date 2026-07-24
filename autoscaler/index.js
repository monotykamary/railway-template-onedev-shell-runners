import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { desiredReplicas, selectReusableToken } from './planner.js';

const PORT = Number(process.env.PORT || 3000);
const ONEDEV_URL = required('ONEDEV_URL').replace(/\/$/, '');
const ONEDEV_AGENT_URL = (process.env.ONEDEV_AGENT_URL || ONEDEV_URL).replace(/\/$/, '');
const ONEDEV_ADMIN_USER = process.env.ONEDEV_ADMIN_USER || 'admin';
const ONEDEV_ADMIN_PASSWORD = required('ONEDEV_ADMIN_PASSWORD');
const RUNNER_LEASE_SECRET = required('RUNNER_LEASE_SECRET');
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || null;
const RUNNER_SERVICE_ID = required('RAILWAY_RUNNER_SERVICE_ID');
const ENVIRONMENT_ID = required('RAILWAY_ENVIRONMENT_ID');
const MIN_REPLICAS = integer('MIN_REPLICAS', 1);
const MAX_REPLICAS = integer('MAX_REPLICAS', 5);
const POLL_INTERVAL_MS = integer('POLL_INTERVAL_MS', 5000);
const SCALE_DOWN_DELAY_MS = integer('SCALE_DOWN_DELAY_MS', 60000);
const LEASE_TTL_MS = integer('LEASE_TTL_MS', 300000);
const STATE_FILE = process.env.STATE_FILE || '/data/state.json';
const EXECUTOR_NAME = process.env.EXECUTOR_NAME || 'railway-shell';
const GQL_URL = 'https://backboard.railway.app/graphql/v2';

let state = loadState();
let ready = false;
let lastError = null;
let lastApplied = null;
let idleSince = null;
let scalingWarningShown = false;
let reconcileQueue = Promise.resolve();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function integer(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { leases: {} }; }
}
function saveState() {
  fs.mkdirSync(new URL('.', `file://${STATE_FILE}`).pathname, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, STATE_FILE);
}
function secureEqual(actual, expected) {
  const a = Buffer.from(actual || '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function oneDev(path, options = {}) {
  const headers = { authorization: `Basic ${Buffer.from(`${ONEDEV_ADMIN_USER}:${ONEDEV_ADMIN_PASSWORD}`).toString('base64')}`, ...(options.headers || {}) };
  const response = await fetch(`${ONEDEV_URL}${path}`, { ...options, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`OneDev ${options.method || 'GET'} ${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function ensureExecutor() {
  const executors = await oneDev('/~api/settings/job-executors');
  if (executors.some((executor) => executor.name === EXECUTOR_NAME)) return;
  executors.push({
    '@type': 'RemoteShellExecutor', enabled: true, name: EXECUTOR_NAME,
    htmlReportPublishEnabled: false, sitePublishEnabled: false,
    jobMatch: '"Job" is not "__never__"', concurrency: 1, agentQuery: null,
  });
  await oneDev('/~api/settings/job-executors', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(executors),
  });
  console.log(`Configured Remote Shell Executor: ${EXECUTOR_NAME}`);
}
async function activeBuilds() {
  const query = 'waiting or pending or running';
  return oneDev(`/~api/builds?query=${encodeURIComponent(query)}&offset=0&count=100`);
}
async function setReplicas(count) {
  if (!RAILWAY_TOKEN) {
    if (!scalingWarningShown) {
      console.warn('RAILWAY_TOKEN is not set; automatic replica scaling is disabled');
      scalingWarningShown = true;
    }
    return;
  }
  if (count === lastApplied) return;
  const response = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'project-access-token': RAILWAY_TOKEN },
    body: JSON.stringify({
      query: 'mutation UpdateReplicas($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }',
      variables: { serviceId: RUNNER_SERVICE_ID, environmentId: ENVIRONMENT_ID, input: { numReplicas: count } },
    }),
  });
  const data = await response.json();
  if (!response.ok || data.errors) throw new Error(`Railway scale failed: ${response.status} ${JSON.stringify(data)}`);
  console.log(`Scaled runner service to ${count}`);
  lastApplied = count;
}
async function reconcile() {
  await ensureExecutor();
  const builds = await activeBuilds();
  const demand = builds.length;
  if (demand > 0) {
    idleSince = null;
    await setReplicas(desiredReplicas(demand, MIN_REPLICAS, MAX_REPLICAS));
  } else {
    idleSince ||= Date.now();
    if (Date.now() - idleSince >= SCALE_DOWN_DELAY_MS) await setReplicas(MIN_REPLICAS);
  }
  ready = true;
  lastError = null;
}
function enqueueReconcile() {
  reconcileQueue = reconcileQueue.then(reconcile).catch((error) => {
    lastError = error.message;
    console.error(error.message);
  });
}
async function lease(leaseId) {
  const now = Date.now();
  for (const [id, value] of Object.entries(state.leases)) if (value.expiresAt <= now) delete state.leases[id];
  const existing = state.leases[leaseId];
  if (existing && existing.expiresAt > now) return existing;
  const [agents, tokens] = await Promise.all([
    oneDev('/~api/agents?offset=0&count=100'), oneDev('/~api/agent-tokens?offset=0&count=100'),
  ]);
  for (const [id, value] of Object.entries(state.leases)) {
    if (agents.some((agent) => agent.online && agent.token.id === value.tokenId)) delete state.leases[id];
  }
  let token = selectReusableToken({ agents, tokens, leases: state.leases, now });
  if (!token) {
    if (tokens.length >= MAX_REPLICAS) throw new Error('No runner token is currently available');
    const tokenId = await oneDev('/~api/agent-tokens', { method: 'POST' });
    token = await oneDev(`/~api/agent-tokens/${tokenId}`);
  }
  const value = { tokenId: token.id, agentToken: token.value, serverUrl: ONEDEV_AGENT_URL, expiresAt: now + LEASE_TTL_MS };
  state.leases[leaseId] = value;
  saveState();
  return value;
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && (request.url === '/' || request.url === '/health')) {
    response.statusCode = ready ? 200 : 503;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ready, lastError, lastApplied }));
    return;
  }
  if (request.method !== 'POST' || request.url !== '/lease') {
    response.statusCode = 404; response.end('not found'); return;
  }
  if (!secureEqual(request.headers.authorization, `Bearer ${RUNNER_LEASE_SECRET}`)) {
    response.statusCode = 401; response.end('unauthorized'); return;
  }
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body.leaseId || typeof body.leaseId !== 'string') throw new Error('leaseId is required');
    const value = await lease(body.leaseId);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(value));
  } catch (error) {
    response.statusCode = 503;
    response.end(error.message);
  }
});

server.listen(PORT, () => console.log(`OneDev runner autoscaler listening on ${PORT}`));
enqueueReconcile();
setInterval(enqueueReconcile, POLL_INTERVAL_MS).unref();
