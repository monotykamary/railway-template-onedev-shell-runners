# Deploy and Host OneDev with Railway Shell Runners

This template combines OneDev's integrated Git, pull request, issue, package, and CI orchestration features with trusted shell-based agents running on Railway. It includes PostgreSQL, persistent OneDev storage, a prebuilt runner toolchain, reusable agent-token leasing, and optional demand-driven replica scaling.

## About Hosting OneDev with Shell Runners

OneDev stores relational metadata in PostgreSQL and repositories, attachments, artifacts, and server state under `/opt/onedev`. The bundled agent connects over Railway's private network and executes jobs through OneDev's Remote Shell Executor. A separate autoscaler configures the executor, manages unique agent-token leases, and monitors waiting, pending, and running builds.

The default deployment keeps one runner available without requiring Railway API credentials. Users can add an environment-scoped Railway project token to enable queue-based scaling and scale-to-zero.

## Common Use Cases

- Run CI for trusted internal repositories
- Test Node.js, Python, Ruby, Java, and native projects
- Host Git repositories, issues, packages, and CI in one platform
- Replace fixed self-hosted runners with demand-based Railway capacity
- Use local PostgreSQL and SQLite tooling without service containers

## Dependencies for OneDev with Shell Runners Hosting

- OneDev server and agent 16.3.0
- PostgreSQL 18
- Persistent volumes for OneDev, PostgreSQL, and autoscaler leases
- Node.js autoscaler service
- Optional Railway project token for replica scaling

### Deployment Dependencies

- [OneDev documentation](https://docs.onedev.io/)
- [Remote Shell Executor documentation](https://docs.onedev.io/tutorials/cicd/plain-old-build)
- [OneDev agent management](https://docs.onedev.io/administration-guide/agent-management)
- [Railway project tokens](https://docs.railway.com/integrations/api)
- [Template source repository](https://github.com/monotykamary/railway-template-onedev-shell-runners)

### Security and Execution Model

Jobs run directly in the agent container and do not receive container isolation. Docker builds, job images, service containers, privileged operations, and untrusted pull-request execution are unsupported. Executor concurrency is limited to one job per agent, HTML report publishing and project-site publishing are disabled, and broad administrator or Railway credentials remain isolated to the autoscaler service.

### Why Deploy OneDev with Shell Runners on Railway?

Railway provides managed PostgreSQL, private networking, persistent volumes, HTTPS, health checks, and replica management. For trusted codebases that do not require Docker-based jobs, the template supplies an integrated source platform and practical CI toolchain without operating dedicated runner hosts.
