# OneDev with Railway Shell Runners

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/onedev-shell-runners?referralCode=ZqgrJ0)

OneDev with a trusted-build Remote Shell Executor, a reusable OneDev agent-token pool, and optional queue-driven Railway autoscaling.

> [!WARNING]
> This template is for trusted repositories and contributors. Shell jobs execute directly inside persistent-privilege runner containers without Docker isolation.

## Services

- **OneDev 16.3.4** with a persistent `/opt/onedev` volume
- **PostgreSQL 18** with persistent database storage
- **Shell Runner** based on the official OneDev agent with Node.js, Python, Ruby, PostgreSQL client tools, SQLite, Yarn, and native build tooling
- **Runner Autoscaler** that configures the Remote Shell Executor, leases unique agent tokens, tracks active builds, and optionally adjusts Railway replicas

## CI capabilities

Supported:

- Repository checkout
- Shell command steps without an image
- Node.js, Python, Ruby, Java, and native compilation
- Job cache, artifacts, test reports, and server-side steps supported by OneDev shell execution
- One concurrent job per agent

Not supported:

- Docker builds
- Job container images
- Service containers
- Privileged workloads
- Untrusted pull-request execution

If an image is specified on a command step, OneDev rejects it when using a shell executor.

## First login

- Username: `admin`
- Password: the generated OneDev `initial_password` variable
- Email: `admin@example.com`

The autoscaler initially authenticates with the same administrator credential to configure the executor and manage agent tokens. If you rotate the OneDev administrator password, update `ONEDEV_ADMIN_PASSWORD` on the autoscaler. You may instead create an administrator-owned OneDev access token and use it as that value.

## Autoscaling

The template starts with one runner, so CI works without giving the autoscaler Railway credentials.

To enable queue-driven scaling:

1. Open the deployed Railway project.
2. Go to **Project Settings → Tokens**.
3. Create a token for the production environment.
4. Set it as `RAILWAY_TOKEN` on the **Runner Autoscaler** service.
5. Set `MIN_REPLICAS`, `MAX_REPLICAS`, and `SCALE_DOWN_DELAY_MS` as desired.

A project token is preferred over an account token because it is restricted to one project and environment. Railway currently requires at least one replica, so `MIN_REPLICAS` must remain `1` or greater.

## How token leasing works

Every runner replica requests a lease from the autoscaler over Railway's private network. The autoscaler creates or reuses a unique OneDev agent token and persists short-lived lease state at `/data`. When runners scale down, their OneDev agents become offline; later replicas reuse those identities instead of accumulating stale agents.

OneDev administrator and Railway project credentials exist only on the autoscaler service. They are not passed to runner containers or job environments. The runner necessarily stores its limited OneDev agent token in the agent configuration.

## Example build specification

```yaml
version: 52
jobs:
- name: test
  steps:
  - type: CheckoutStep
    name: checkout
    cloneCredential:
      type: DefaultCredential
    withLfs: false
    withSubmodules: false
    condition: SUCCESSFUL
    optional: false
  - type: CommandStep
    name: test
    runInContainer: false
    interpreter:
      type: PosixInterpreter
      shell: sh
      commands: |
        node --version
        python3 --version
        ruby --version
    runAs: 0:0
    useTTY: false
    condition: SUCCESSFUL
    optional: false
  triggers:
  - type: BranchUpdateTrigger
    branches: main
    userMatch: anyone
  retryCondition: never
  maxRetries: 0
  retryDelay: 30
  timeout: 600
```

## Security model

A shell job can modify its runner container outside the job workspace. OneDev removes its normal job working directory, but that is not a security boundary. Only run code controlled by trusted users. Use external disposable VM agents with the Remote Docker Executor for isolation or untrusted contributions.

HTML and project-site publishing are disabled on the automatically configured executor.

## Backups

Back up PostgreSQL, `/opt/onedev`, and the autoscaler `/data` volume. The lease file contains agent tokens and must be treated as sensitive backup material.

## License

The template and autoscaler are MIT licensed. OneDev retains its upstream MIT license and trademarks.
