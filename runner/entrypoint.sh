#!/usr/bin/env bash
set -euo pipefail

: "${AUTOSCALER_URL:?AUTOSCALER_URL is required}"
: "${RUNNER_LEASE_SECRET:?RUNNER_LEASE_SECRET is required}"

lease_id="${RAILWAY_REPLICA_ID:-${HOSTNAME:-runner-$$}}"
response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT

for attempt in $(seq 1 120); do
  code=$(curl -sS -o "$response_file" -w '%{http_code}' \
    -X POST \
    -H "authorization: Bearer ${RUNNER_LEASE_SECRET}" \
    -H 'content-type: application/json' \
    --data "{\"leaseId\":\"${lease_id}\"}" \
    "${AUTOSCALER_URL%/}/lease" || true)
  [[ "$code" == "200" ]] && break
  echo "Waiting for runner lease (attempt ${attempt}, status ${code})"
  sleep 5
done

if [[ "${code:-}" != "200" ]]; then
  echo "Unable to obtain a runner lease" >&2
  cat "$response_file" >&2 || true
  exit 1
fi

readarray -t lease < <(python3 - "$response_file" <<'PY'
import json
import sys
with open(sys.argv[1]) as f:
    data = json.load(f)
print(data['agentToken'])
print(data['serverUrl'])
PY
)

properties=/agent/conf/agent.properties
python3 - "$properties" "${lease[0]}" "${lease[1]}" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
values = {'agentToken': sys.argv[2], 'serverUrl': sys.argv[3]}
lines = path.read_text().splitlines() if path.exists() else []
result = []
seen = set()
for line in lines:
    key = line.split('=', 1)[0].strip() if '=' in line else None
    if key in values:
        result.append(f'{key}={values[key]}')
        seen.add(key)
    else:
        result.append(line)
for key, value in values.items():
    if key not in seen:
        result.append(f'{key}={value}')
path.write_text('\n'.join(result) + '\n')
path.chmod(0o600)
PY

unset RUNNER_LEASE_SECRET AUTOSCALER_URL lease
rm -f "$response_file"
trap - EXIT
exec /root/bin/entrypoint.sh
