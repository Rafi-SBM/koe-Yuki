Production-Grade Next.js Engineering Rulebook
Purpose
These rules define the engineering standard for a production-grade Next.js application.
They apply to humans and AI coding agents modifying this repository.
The objective is not maximum abstraction or maximum complexity.
The objective is:
1. Correctness
2. Security
3. Data integrity
4. Maintainability
5. Reliability
6. Simplicity
7. Testability
8. Observability
9. Performance
10. Developer experience
11. Accessibility
12. Visual quality
When rules conflict, prefer the option that better protects correctness, security, and data integrity.
Do not introduce infrastructure, abstractions, libraries, patterns, or services unless the application actually benefits from them.
Rules relating to payments, queues, multi-tenancy, search, file uploads, etc. apply only when those capabilities exist.
Follow the versions pinned by the repository. For framework-specific behavior, verify against documentation for the installed version rather than relying on outdated conventions.
Exceptions to important rules must be intentional and documented.

01 — ARCHITECTURE
ARC-01
Organize substantial business functionality around domains/features rather than putting everything into global technical folders.
ARC-02
Maintain clear dependency direction between UI, application logic, domain logic, infrastructure, and persistence.
ARC-03
UI components must not become the primary location for business rules.
ARC-04
Database implementation details must not leak unnecessarily throughout the application.
ARC-05
External service implementations should be accessed through application-owned interfaces or wrappers.
ARC-06
Avoid circular dependencies between modules and features.
ARC-07
Keep route files focused on routing, orchestration, data loading, and composition.
ARC-08
Create abstractions only after a meaningful common concept or repeated pattern exists.
ARC-09
Prefer composition and small explicit modules over deep inheritance or highly generic frameworks.
ARC-10
Each important domain concept should have one obvious authoritative location in the repository.
ARC-11
Shared modules may not depend on higher-level application features that consume them.
ARC-12
Architecture should make the secure and correct implementation easier than the insecure implementation.

02 — NEXT.JS CONVENTIONS
NXT-01
Use the App Router for new application functionality unless the existing project has a justified Pages Router architecture.
NXT-02
Use Server Components by default.
NXT-03
Introduce "use client" only when browser-side interactivity or browser APIs require it.
NXT-04
Keep Client Component boundaries as small as reasonably possible.
NXT-05
Never expose secrets, privileged objects, or unnecessary database fields through props passed to Client Components.
NXT-06
Treat Server Actions as externally callable mutation endpoints and validate and authorize them accordingly.
NXT-07
Use Route Handlers when a real HTTP interface is required, such as webhooks, external API consumers, or protocol-specific endpoints.
NXT-08
Use framework loading, error, and not-found boundaries where they improve user experience and isolation.
NXT-09
Use Next.js metadata APIs for titles, descriptions, canonical information, robots directives, and social metadata.
NXT-10
Use current caching and revalidation APIs for the repository's installed Next.js version rather than assuming historical caching behavior.
NXT-11
Keep server-only modules explicitly isolated and use server-only boundaries where accidental client imports would be dangerous.
NXT-12
Use request interception such as proxy.ts only when request-level interception is actually required; do not turn it into the application's business layer.

03 — REACT QUALITY
RCT-01
Every component should have one understandable responsibility.
RCT-02
Prefer composition over components containing dozens of behavioral configuration flags.
RCT-03
Do not copy server data into client state without a reason.
RCT-04
Do not store state that can be derived reliably from existing state or props.
RCT-05
Use effects primarily for synchronization with systems outside React.
RCT-06
Do not use useEffect as a default data-fetching or state-orchestration mechanism.
RCT-07
Hooks must follow React's hook rules without exceptions.
RCT-08
Custom hooks should represent meaningful reusable React behavior.
RCT-09
Keep component APIs small, typed, and conceptually coherent.
RCT-10
Never mutate React props or state objects directly.
RCT-11
Use stable keys representing entity identity rather than array positions when list identity matters.
RCT-12
Profile rendering problems before adding widespread memoization.

04 — TYPESCRIPT
TS-01
Enable strict TypeScript checking for new production applications.
TS-02
Avoid any; use specific types or unknown followed by validation/narrowing.
TS-03
Do not suppress compiler errors simply to make a build pass.
TS-04
Use discriminated unions when modeling mutually exclusive states.
TS-05
Represent domain concepts with meaningful types rather than unrelated primitive values where doing so improves safety.
TS-06
Use exhaustive handling for important closed unions.
TS-07
Minimize unsafe type assertions.
TS-08
Runtime input must be validated even when a matching TypeScript type exists.
TS-09
Reuse inferred types when they accurately represent the desired contract rather than manually duplicating them.
TS-10
Do not expose huge ORM-generated models when a smaller DTO represents the actual contract.
TS-11
Generic types must simplify repeated behavior rather than create abstract complexity.
TS-12
Public module contracts should have understandable input, output, and error types.

05 — DATABASE DESIGN
DB-01
Every table must have a deliberate primary key strategy.
DB-02
Relationships should be represented using actual foreign-key constraints when appropriate.
DB-03
Define nullability intentionally.
DB-04
Use database uniqueness constraints for invariants requiring uniqueness.
DB-05
Index frequently filtered, joined, ordered, or uniquely queried fields when query patterns justify it.
DB-06
Do not create indexes indiscriminately because every index increases write/storage cost.
DB-07
Use database constraints as defense against invalid states whenever practical.
DB-08
Store timestamps consistently and define timezone behavior explicitly.
DB-09
Define deletion behavior for relationships intentionally.
DB-10
Use transactions when several writes form one logical operation.
DB-11
Design for concurrency rather than assuming requests execute sequentially.
DB-12
Database schema changes must be migration-controlled and reviewable.

06 — DATA ACCESS
DAL-01
Centralize security-sensitive data access behind a defined data-access boundary.
DAL-02
Perform ownership or authorization checks near protected data access.
DAL-03
Return the minimum fields required by the caller.
DAL-04
Avoid raw database queries scattered throughout arbitrary UI components.
DAL-05
Give queries descriptive names expressing intent.
DAL-06
Prevent N+1 query patterns through joins, batching, preloading, or redesigned access patterns.
DAL-07
Paginate potentially unbounded datasets.
DAL-08
Make tenant/user scoping explicit in protected queries.
DAL-09
Do not expose ORM objects directly as public API contracts without considering data exposure.
DAL-10
Keep query logic independently testable when it contains important business behavior.
DAL-11
Measure and inspect expensive queries before attempting optimization.
DAL-12
Prefer one established data-access approach within a codebase unless there is a justified reason to mix approaches.

07 — AUTHENTICATION
AUTHN-01
Use a mature authentication implementation rather than designing custom cryptographic authentication.
AUTHN-02
Sessions must be cryptographically protected.
AUTHN-03
Authentication cookies must use appropriate Secure, HttpOnly, and SameSite configuration.
AUTHN-04
Session expiration must be explicit.
AUTHN-05
Sensitive authentication operations should support session revocation.
AUTHN-06
Password storage must use an appropriate password hashing algorithm rather than reversible encryption.
AUTHN-07
Authentication responses should not unnecessarily reveal whether sensitive account identifiers exist.
AUTHN-08
Account recovery flows must not become weaker authentication bypasses.
AUTHN-09
Password reset/recovery tokens must expire and be single-use where appropriate.
AUTHN-10
Support session invalidation after security-sensitive account changes where required.
AUTHN-11
Multi-factor authentication should be available when risk or product requirements justify it.
AUTHN-12
Never interpret authentication as sufficient authorization.

08 — AUTHORIZATION
AUTHZ-01
Every sensitive server-side operation must enforce authorization.
AUTHZ-02
Never rely on hidden buttons or client-side route guards as access control.
AUTHZ-03
Treat identifiers received from clients as untrusted.
AUTHZ-04
Verify ownership before accessing user-owned resources.
AUTHZ-05
Centralize important permission policies instead of scattering role comparisons everywhere.
AUTHZ-06
Use least privilege for users, services, database roles, and infrastructure.
AUTHZ-07
Deny access by default when authorization state is unknown.
AUTHZ-08
Administrative functionality requires explicit server-side authorization.
AUTHZ-09
Object-level authorization must be enforced to prevent IDOR vulnerabilities.
AUTHZ-10
Bulk operations require authorization for every affected resource or an equivalent safe scoped query.
AUTHZ-11
Role/permission changes should invalidate stale authorization state where necessary.
AUTHZ-12
High-risk permission decisions should be auditable.

09 — SECURITY
SEC-01
Treat all externally controlled input as untrusted.
SEC-02
Use parameterized database queries or ORM query builders rather than concatenated SQL.
SEC-03
Do not render unsanitized user-controlled HTML.
SEC-04
Use an appropriate Content Security Policy for the application's threat model.
SEC-05
Protect cookie-authenticated state-changing operations against cross-site request forgery where applicable.
SEC-06
Validate and restrict server-side outbound URLs to mitigate SSRF.
SEC-07
Configure appropriate security headers.
SEC-08
Rate-limit abuse-sensitive endpoints.
SEC-09
Never hard-code production secrets in source code.
SEC-10
Verify webhook authenticity cryptographically.
SEC-11
Keep dependencies patched against known high-severity vulnerabilities using a controlled upgrade process.
SEC-12
Perform recurring security review/testing proportionate to application risk.

10 — API DESIGN
API-01
Define explicit request and response contracts.
API-02
Validate API input at the boundary.
API-03
Use HTTP methods according to their intended semantics.
API-04
Use meaningful HTTP status codes.
API-05
Maintain a consistent error response format.
API-06
Do not expose stack traces or database errors to clients.
API-07
Implement pagination for large collections.
API-08
Support idempotency where repeated mutations could produce duplicate harmful effects.
API-09
Document externally consumed APIs.
API-10
Version externally consumed contracts when breaking compatibility cannot otherwise be managed.
API-11
Use explicit authorization scopes for protected API resources.
API-12
Never trust client-provided pricing, permissions, ownership, or computed security-sensitive values.

11 — VALIDATION
VAL-01
Validate all form submissions server-side.
VAL-02
Validate route parameters before using them.
VAL-03
Validate query/search parameters.
VAL-04
Validate request bodies.
VAL-05
Validate webhook payloads.
VAL-06
Validate environment configuration.
VAL-07
Validate externally supplied URLs.
VAL-08
Validate uploaded files.
VAL-09
Validate important responses from external systems before trusting them.
VAL-10
Use allowlists instead of denylists where feasible.
VAL-11
Perform semantic/domain validation in addition to structural schema validation.
VAL-12
Client validation may improve UX but must never replace server validation.

12 — ERROR HANDLING
ERR-01
Distinguish expected application failures from programming/system failures.
ERR-02
Create recognizable domain errors for expected business failures.
ERR-03
Do not catch errors merely to ignore them.
ERR-04
Preserve useful root-cause information in internal diagnostics.
ERR-05
Return safe, understandable errors to users.
ERR-06
Avoid leaking implementation details through error messages.
ERR-07
Use error boundaries where a portion of the interface can fail independently.
ERR-08
Critical background failures must be observable rather than silently discarded.
ERR-09
Retry only errors likely to be transient.
ERR-10
Do not retry permanent validation or authorization failures.
ERR-11
Define graceful fallback behavior for non-critical dependencies.
ERR-12
Unhandled production errors should reach centralized error tracking.

13 — OBSERVABILITY
OBS-01
Use structured logging in production systems.
OBS-02
Logs should include meaningful contextual identifiers.
OBS-03
Never log passwords, raw authentication tokens, private keys, or unnecessary sensitive data.
OBS-04
Generate/request correlation identifiers where distributed debugging benefits from them.
OBS-05
Record latency for important operations.
OBS-06
Track important error rates.
OBS-07
Capture traces for important distributed workflows when appropriate.
OBS-08
Record product-critical operational metrics.
OBS-09
Dashboards should answer operational questions rather than merely display arbitrary metrics.
OBS-10
Alerts should correspond to situations requiring human or automated action.
OBS-11
Observability data should distinguish environment, service, release, and relevant operation.
OBS-12
Instrument critical workflows before they become production mysteries.

14 — PERFORMANCE
PERF-01
Measure performance before performing non-obvious optimization.
PERF-02
Reduce unnecessary client-side JavaScript.
PERF-03
Prefer server rendering/data access when client execution provides no benefit.
PERF-04
Avoid sequential request waterfalls when independent operations can execute concurrently.
PERF-05
Optimize expensive database access before micro-optimizing JavaScript.
PERF-06
Use image optimization appropriate to image size and display dimensions.
PERF-07
Lazy-load genuinely heavy client-only functionality where appropriate.
PERF-08
Paginate or virtualize very large data collections.
PERF-09
Monitor application bundle growth.
PERF-10
Cache expensive reusable results when correctness permits it.
PERF-11
Set performance budgets for important user journeys where performance is business-critical.
PERF-12
Treat p95/p99 latency as important alongside averages.

15 — RELIABILITY
REL-01
Set explicit timeouts for external network operations.
REL-02
Retry transient failures with bounded retries.
REL-03
Use exponential backoff and jitter when appropriate.
REL-04
Make retryable operations idempotent.
REL-05
Do not retry indefinitely.
REL-06
Prevent one failing dependency from exhausting application resources.
REL-07
Use circuit-breaking or equivalent failure containment where repeated downstream failures create cascading risk.
REL-08
Define degraded behavior for optional dependencies.
REL-09
Critical writes must not silently disappear.
REL-10
Protect long-running tasks against partial execution.
REL-11
Design operations to tolerate process termination where infrastructure can terminate instances.
REL-12
Test important failure paths, not only successful execution.

16 — BACKGROUND JOBS
JOB-01
Move genuinely long-running asynchronous work outside request lifecycles when appropriate.
JOB-02
Job payloads must be versionable and validated.
JOB-03
Jobs must be idempotent when they can be delivered more than once.
JOB-04
Configure bounded retry policies.
JOB-05
Use dead-letter handling for repeatedly failing jobs where appropriate.
JOB-06
Record job attempt count and failure context.
JOB-07
Avoid putting huge payloads directly into queue messages.
JOB-08
Reference durable resources from job payloads instead.
JOB-09
Protect job handlers against stale or deleted referenced entities.
JOB-10
Implement job concurrency limits when downstream systems require them.
JOB-11
Monitor queue depth, latency, failure rate, and oldest pending work.
JOB-12
Provide safe replay/recovery mechanisms for critical workflows.

17 — EXTERNAL INTEGRATIONS
EXT-01
Wrap important vendors behind application-owned interfaces.
EXT-02
Specify timeouts for external requests.
EXT-03
Handle vendor rate limits intentionally.
EXT-04
Validate external responses before relying on them.
EXT-05
Never assume third-party uptime.
EXT-06
Separate transient vendor errors from permanent business errors.
EXT-07
Keep provider-specific objects from leaking across the entire codebase.
EXT-08
Use idempotency identifiers when supported for important mutations.
EXT-09
Securely store vendor credentials.
EXT-10
Monitor dependency availability and latency when business-critical.
EXT-11
Define fallback/degradation behavior where possible.
EXT-12
Document provider assumptions that affect correctness.

18 — TESTING
TEST-01
Test critical business rules.
TEST-02
Test authorization boundaries.
TEST-03
Test validation behavior.
TEST-04
Test important persistence behavior against a realistic database where appropriate.
TEST-05
Use integration tests for boundaries whose behavior matters more than isolated implementation.
TEST-06
Use E2E tests for critical user journeys.
TEST-07
Test important failure paths.
TEST-08
Regression bugs should generally receive regression tests.
TEST-09
Avoid tests tightly coupled to irrelevant implementation details.
TEST-10
Tests must be deterministic.
TEST-11
External providers should be simulated or safely sandboxed in automated test environments.
TEST-12
Failed critical tests must block production promotion.

19 — CI/CD
CICD-01
Every merge should run automated type checking.
CICD-02
Every merge should run linting.
CICD-03
Every merge should run required tests.
CICD-04
Production artifacts must successfully build before deployment.
CICD-05
CI should use a deterministic dependency lockfile.
CICD-06
Required branch protections should prevent bypassing critical checks.
CICD-07
Secrets must come from secure CI configuration rather than repository files.
CICD-08
Preview environments should avoid production credentials.
CICD-09
Migration compatibility should be checked before production deployment.
CICD-10
Build/deployment artifacts should be traceable to source revisions.
CICD-11
Security/dependency scanning should run on an appropriate cadence.
CICD-12
CI configuration must itself be reviewed as production code.

20 — DEPLOYMENT
DEPLOY-01
Maintain clearly separated development, staging/pre-production where needed, and production environments.
DEPLOY-02
Deploy immutable artifacts where practical.
DEPLOY-03
Production deployment must have a rollback or forward-fix strategy.
DEPLOY-04
Do not require destructive database changes to complete simultaneously with new application deployment.
DEPLOY-05
Expose health/readiness signals appropriate to the hosting platform.
DEPLOY-06
Avoid startup behavior that produces duplicate side effects across multiple instances.
DEPLOY-07
Production configuration should be externally managed.
DEPLOY-08
Do not expose development debugging behavior in production.
DEPLOY-09
Use gradual rollout/canary strategies for high-risk changes where infrastructure supports them.
DEPLOY-10
Record deployment events in observability systems.
DEPLOY-11
Verify critical functionality after deployment.
DEPLOY-12
Practice deployment recovery before a major production incident forces it.

21 — MIGRATIONS
MIG-01
All production schema changes must use version-controlled migrations.
MIG-02
Prefer backward-compatible migrations.
MIG-03
Use expand-and-contract migrations for incompatible schema transformations.
MIG-04
Deploy schema additions before code requires them when necessary.
MIG-05
Remove obsolete columns only after all running code no longer depends on them.
MIG-06
Avoid large blocking table rewrites during peak production traffic.
MIG-07
Backfill large datasets incrementally.
MIG-08
Make long-running backfills resumable.
MIG-09
Do not assume migration rollback is always safe.
MIG-10
Test important migrations on production-like data volumes where possible.
MIG-11
Monitor migration locks and execution time.
MIG-12
Keep application deployments compatible with the database state expected during rollout.

22 — FRONTEND UX
UX-01
Every asynchronous workflow should define loading behavior.
UX-02
Every collection should define meaningful empty behavior.
UX-03
Expected failures should provide understandable recovery guidance.
UX-04
Successful mutations should provide appropriate feedback.
UX-05
Disable or otherwise protect actions while duplicate submission would be harmful.
UX-06
Preserve user input after recoverable failures where practical.
UX-07
Provide confirmation for destructive actions proportional to consequence.
UX-08
Use optimistic UI only when failure can be safely reconciled.
UX-09
Design mobile experiences intentionally rather than merely shrinking desktop layouts.
UX-10
Avoid unexpected layout shifts.
UX-11
Keep primary actions visually discoverable.
UX-12
User-facing copy should explain actions and consequences clearly.

23 — ACCESSIBILITY
A11Y-01
Use semantic HTML elements.
A11Y-02
Use buttons for actions and links for navigation.
A11Y-03
All interactive controls must be keyboard accessible.
A11Y-04
Maintain visible focus states.
A11Y-05
Every form control requires an accessible name.
A11Y-06
Meaningful images require appropriate alternative text.
A11Y-07
Decorative images should not create unnecessary screen-reader noise.
A11Y-08
Maintain sufficient text and control contrast.
A11Y-09
Do not communicate important state using color alone.
A11Y-10
Respect reduced-motion preferences where motion is non-essential.
A11Y-11
Dynamic announcements should use appropriate accessible techniques when necessary.
A11Y-12
Test critical flows using keyboard navigation and accessibility tooling.

24 — DESIGN SYSTEM
DS-01
Define a consistent spacing scale.
DS-02
Define typography tokens.
DS-03
Define semantic color tokens.
DS-04
Define consistent radius and elevation conventions.
DS-05
Reusable primitives should expose controlled variants rather than arbitrary styling APIs.
DS-06
Keep design primitives separate from domain-specific components.
DS-07
Avoid one-off arbitrary values when a system token exists.
DS-08
Components must define interactive states consistently.
DS-09
Design tokens should support light/dark themes if the product requires them.
DS-10
Avoid creating multiple components solving the same primitive UI problem.
DS-11
Changes to core primitives should be reviewed for downstream impact.
DS-12
The design system should improve consistency without preventing feature-specific composition.

25 — STATE MANAGEMENT
STATE-01
Prefer local state for local concerns.
STATE-02
Use URL state for bookmarkable/shareable navigation state.
STATE-03
Treat server data as server state rather than automatically copying it to global client stores.
STATE-04
Use context only for genuinely shared tree-level concerns.
STATE-05
Introduce global state libraries only when simpler mechanisms are insufficient.
STATE-06
Do not store duplicate representations of the same authoritative state.
STATE-07
Derived state should normally be computed rather than persisted separately.
STATE-08
Keep transient presentation state separate from persistent domain state.
STATE-09
Define synchronization behavior when optimistic local state can diverge from server state.
STATE-10
Do not hide critical state transitions inside unrelated components.
STATE-11
Reset component state deliberately when entity identity changes.
STATE-12
Document complicated state machines explicitly rather than encoding them as scattered booleans.

26 — FORMS
FORM-01
Define schemas for important form payloads.
FORM-02
Validate again on the server.
FORM-03
Display useful field-level errors.
FORM-04
Preserve form input after recoverable failures.
FORM-05
Prevent accidental duplicate submission.
FORM-06
Represent submission state clearly.
FORM-07
Disable controls only when disabling them improves correctness or UX.
FORM-08
Ensure forms work with keyboard navigation.
FORM-09
Associate labels and errors with their controls.
FORM-10
Handle concurrent updates when the underlying data can change.
FORM-11
Warn about unsaved changes when losing significant work is realistic.
FORM-12
Never trust hidden or disabled form fields as authorization evidence.

27 — CACHING
CACHE-01
Every cache must have a clearly defined owner and purpose.
CACHE-02
Identify what constitutes the cache key.
CACHE-03
Include tenant/user identity in cache keys when data is scoped accordingly.
CACHE-04
Never accidentally share private personalized cache entries across users.
CACHE-05
Define expiration behavior.
CACHE-06
Define invalidation behavior.
CACHE-07
Mutations should invalidate affected cached data.
CACHE-08
Do not cache permission decisions longer than safely justified.
CACHE-09
Design systems to tolerate stale data when stale behavior is possible.
CACHE-10
Prevent cache stampedes for expensive shared computations where necessary.
CACHE-11
Measure cache effectiveness rather than assuming caching improves performance.
CACHE-12
Understand each caching layer separately: browser, framework, CDN, application, and database.

28 — MULTI-TENANCY
TENANT-01
Every tenant-owned entity must have explicit tenant ownership.
TENANT-02
Tenant scoping must occur server-side.
TENANT-03
Never trust a tenant identifier merely because the client submitted it.
TENANT-04
Tenant-aware queries must prevent cross-tenant reads.
TENANT-05
Tenant-aware mutations must prevent cross-tenant writes.
TENANT-06
Uniqueness constraints should include tenant scope when uniqueness is tenant-specific.
TENANT-07
Background jobs must preserve tenant context.
TENANT-08
Caches must include tenant scope.
TENANT-09
Search indexes must preserve tenant isolation.
TENANT-10
Storage paths/access policies must preserve tenant isolation.
TENANT-11
Administrative cross-tenant operations require explicit elevated authorization and auditing.
TENANT-12
Test specifically for cross-tenant data leakage.

29 — PAYMENTS
PAY-01
Represent money using integer minor units or exact decimal representations appropriate to the currency.
PAY-02
Never trust product prices submitted by clients.
PAY-03
Resolve pricing using server-controlled identifiers.
PAY-04
Use provider-supported idempotency mechanisms for payment creation.
PAY-05
Verify payment webhooks cryptographically.
PAY-06
Webhook processing must tolerate duplicate events.
PAY-07
Do not assume webhook events arrive in order.
PAY-08
Maintain reconciliation between internal state and payment-provider state.
PAY-09
Never store raw card details unless operating under infrastructure specifically designed and certified for that responsibility.
PAY-10
Model refunds, disputes, cancellations, and partial payments explicitly when relevant.
PAY-11
Financial ledgers should favor immutable records and compensating entries.
PAY-12
Critical financial workflows require strong automated tests and auditability.

30 — FILE STORAGE
FILE-01
Restrict accepted upload sizes.
FILE-02
Restrict accepted media/content types.
FILE-03
Do not trust file extensions alone.
FILE-04
Generate application-controlled storage names rather than trusting uploaded filenames.
FILE-05
Prevent path traversal.
FILE-06
Store private files privately.
FILE-07
Use expiring signed access URLs when private object access requires them.
FILE-08
Enforce ownership before granting file access.
FILE-09
Consider malware/content scanning where uploaded content creates meaningful risk.
FILE-10
Protect file processors from decompression bombs and malicious parser inputs.
FILE-11
Define retention and deletion lifecycle behavior.
FILE-12
Separate file metadata from raw binary storage when useful.

31 — EMAIL
EMAIL-01
Keep email sending behind an application-owned interface.
EMAIL-02
Use templates rather than assembling complex HTML throughout business logic.
EMAIL-03
Validate recipient addresses before sending.
EMAIL-04
Use background delivery for non-blocking transactional email where appropriate.
EMAIL-05
Make retries safe against unintended duplicate messages.
EMAIL-06
Track provider delivery failures.
EMAIL-07
Handle bounces when email deliverability matters.
EMAIL-08
Support unsubscribe behavior where required for non-transactional communication.
EMAIL-09
Keep transactional and marketing email classifications separate.
EMAIL-10
Do not include secrets or unnecessarily sensitive data in email.
EMAIL-11
Protect email-triggering endpoints from abuse.
EMAIL-12
Authenticate sending domains using appropriate mail authentication mechanisms.

32 — SEARCH
SEARCH-01
Normalize search input.
SEARCH-02
Validate search filters and sorting options.
SEARCH-03
Never concatenate raw input into search query languages unsafely.
SEARCH-04
Paginate search results.
SEARCH-05
Preserve authorization filtering in search results.
SEARCH-06
Preserve tenant boundaries in search indexes.
SEARCH-07
Define how search index updates become consistent with primary storage.
SEARCH-08
Do not treat search engines as authoritative transactional databases.
SEARCH-09
Monitor indexing failures.
SEARCH-10
Control expensive wildcard/fuzzy queries where they can cause abuse or cost explosions.
SEARCH-11
Measure search quality using relevant product metrics.
SEARCH-12
Provide sensible no-results behavior.

33 — INTERNATIONALIZATION
I18N-01
Represent locale independently from language when the distinction matters.
I18N-02
Use locale-aware number formatting.
I18N-03
Use locale-aware date formatting.
I18N-04
Use locale-aware currency formatting.
I18N-05
Store canonical timestamps separately from display timezone.
I18N-06
Never assume every user uses the server timezone.
I18N-07
Do not concatenate translated fragments when grammar may change between languages.
I18N-08
Support pluralization using appropriate localization tooling.
I18N-09
Account for translated text expansion in layouts.
I18N-10
Support right-to-left layout when required.
I18N-11
Keep user-facing strings centralized if localization is a product requirement.
I18N-12
Define locale fallback behavior.

34 — PRIVACY
PRIV-01
Collect only information the product actually needs.
PRIV-02
Document why sensitive data is collected.
PRIV-03
Limit sensitive data access according to job/system requirements.
PRIV-04
Encrypt sensitive data in transit.
PRIV-05
Use appropriate encryption at rest.
PRIV-06
Define retention periods for data categories.
PRIV-07
Delete or anonymize data when retention no longer has a valid purpose.
PRIV-08
Avoid putting sensitive information into logs.
PRIV-09
Avoid putting sensitive information into analytics events.
PRIV-10
Support legally/product-required deletion and export workflows where applicable.
PRIV-11
Audit access to especially sensitive information where risk justifies it.
PRIV-12
Review third-party services for unnecessary data exposure.

35 — DEPENDENCIES
DEP-01
Commit and enforce one authoritative lockfile.
DEP-02
Do not add packages for trivial functionality already available in the platform.
DEP-03
Evaluate package maintenance health before adopting important dependencies.
DEP-04
Evaluate package security history where relevant.
DEP-05
Understand licensing requirements.
DEP-06
Avoid duplicate libraries solving the same problem without justification.
DEP-07
Remove unused dependencies.
DEP-08
Review major-version upgrades deliberately.
DEP-09
Run automated vulnerability scanning.
DEP-10
Pin critical infrastructure where uncontrolled upgrades are dangerous.
DEP-11
Avoid unmaintained packages in security-sensitive paths.
DEP-12
Treat package installation scripts and supply-chain compromise as part of the threat model.

36 — GIT PRACTICES
GIT-01
Keep commits logically coherent.
GIT-02
Use descriptive commit messages.
GIT-03
Avoid committing generated junk, local configuration, or secrets.
GIT-04
Protect production/release branches.
GIT-05
Require review/checks appropriate to repository risk.
GIT-06
Do not rewrite shared history casually.
GIT-07
Keep feature branches reasonably short-lived.
GIT-08
Resolve merge conflicts by understanding both changes rather than blindly accepting one side.
GIT-09
Separate unrelated refactoring from behavioral changes where practical.
GIT-10
Never commit disabled security checks simply to get CI green.
GIT-11
Tag/version releases when release traceability matters.
GIT-12
Git history should help explain why the system changed.

37 — CODE REVIEW
REVIEW-01
Review correctness before style.
REVIEW-02
Review authorization for every new protected mutation.
REVIEW-03
Review input boundaries.
REVIEW-04
Review database migration safety.
REVIEW-05
Review concurrency assumptions.
REVIEW-06
Review caching behavior.
REVIEW-07
Review failure behavior.
REVIEW-08
Review sensitive information exposure.
REVIEW-09
Review unnecessary complexity.
REVIEW-10
Review performance implications of significant queries and client bundles.
REVIEW-11
Request tests for high-risk behavior.
REVIEW-12
Reject clever architecture whose maintenance cost exceeds its benefit.

38 — DOCUMENTATION
DOC-01
Maintain a useful root README.
DOC-02
Document local setup.
DOC-03
Document required environment variables.
DOC-04
Document database migration commands.
DOC-05
Document seed/development data procedures.
DOC-06
Document production deployment procedures where developers operate them.
DOC-07
Document important architecture boundaries.
DOC-08
Use architecture decision records for decisions whose reasoning would otherwise be lost.
DOC-09
Document important integrations.
DOC-10
Document recovery procedures for critical infrastructure.
DOC-11
Documentation must be updated when behavior materially changes.
DOC-12
Prefer documentation close to the code/configuration it explains when that improves discoverability.

39 — FEATURE FLAGS
FLAG-01
Give feature flags descriptive names.
FLAG-02
Centralize flag evaluation.
FLAG-03
Do not use client-only flags as security boundaries.
FLAG-04
Specify default behavior when flag providers fail.
FLAG-05
Support emergency kill switches for high-risk functionality where valuable.
FLAG-06
Document flag ownership.
FLAG-07
Track temporary flags for eventual removal.
FLAG-08
Remove stale rollout flags.
FLAG-09
Test both important enabled and disabled paths.
FLAG-10
Avoid deeply nested combinations of dependent feature flags.
FLAG-11
Do not put irreversible database assumptions behind easily reversible UI flags without planning.
FLAG-12
Evaluate server-side when the flag controls sensitive server behavior.

40 — CONFIGURATION MANAGEMENT
CONF-01
Keep configuration separate from application code where appropriate.
CONF-02
Validate required configuration during startup/build before serving production traffic.
CONF-03
Distinguish server secrets from client-public configuration.
CONF-04
Never expose secrets through public environment variables.
CONF-05
Maintain .env.example or equivalent documentation.
CONF-06
Do not commit production .env files.
CONF-07
Keep environment differences minimal.
CONF-08
Store production secrets in an appropriate secret manager.
CONF-09
Rotate sensitive credentials periodically and after suspected compromise.
CONF-10
Design secret rotation to avoid unnecessary downtime where important.
CONF-11
Record meaningful configuration changes.
CONF-12
Fail safely when critical configuration is missing.

41 — ANALYTICS
ANALYTICS-01
Define analytics events centrally or through typed contracts.
ANALYTICS-02
Use consistent event naming.
ANALYTICS-03
Define event properties explicitly.
ANALYTICS-04
Avoid transmitting unnecessary personal information.
ANALYTICS-05
Respect applicable consent requirements.
ANALYTICS-06
Wrap vendor SDKs behind an application-owned analytics layer when practical.
ANALYTICS-07
Do not allow analytics failure to break critical product functionality.
ANALYTICS-08
Avoid duplicate events from retries/rerenders.
ANALYTICS-09
Version events when meaning changes materially.
ANALYTICS-10
Document the semantic meaning of business-critical events.
ANALYTICS-11
Validate server-side revenue/conversion events against authoritative business state.
ANALYTICS-12
Remove obsolete events rather than maintaining meaningless telemetry forever.

42 — RATE LIMITING
RATE-01
Rate-limit authentication abuse vectors.
RATE-02
Rate-limit password reset/recovery attempts.
RATE-03
Rate-limit expensive public APIs.
RATE-04
Rate-limit outbound-message functionality.
RATE-05
Rate-limit upload endpoints.
RATE-06
Use multiple dimensions—user, IP, tenant, resource—when one dimension is insufficient.
RATE-07
Avoid relying solely on IP addresses for authenticated abuse prevention.
RATE-08
Return appropriate retry information when useful.
RATE-09
Use distributed/shared enforcement in horizontally scaled environments where consistency matters.
RATE-10
Protect the rate-limit infrastructure itself from becoming a bottleneck.
RATE-11
Monitor rejected-request rates.
RATE-12
Different operations should have different limits based on cost and abuse potential.

43 — CONCURRENCY
CONCUR-01
Assume multiple requests can modify the same entity simultaneously.
CONCUR-02
Use database uniqueness constraints rather than pre-checks alone.
CONCUR-03
Use transactions where race-free multi-step updates require atomicity.
CONCUR-04
Use optimistic concurrency/version fields when conflicting edits must be detected.
CONCUR-05
Use locking only where necessary and understand its contention implications.
CONCUR-06
Never rely on process-local mutexes for coordination across multiple application instances.
CONCUR-07
Make payment/job/webhook operations idempotent.
CONCUR-08
Protect inventory/counter updates from lost-update races.
CONCUR-09
Define duplicate-request semantics.
CONCUR-10
Test important concurrent operations.
CONCUR-11
Keep transactions short.
CONCUR-12
Avoid external network calls while holding database locks unless absolutely necessary.

44 — RESILIENCE
RESIL-01
Assume every remote dependency eventually fails.
RESIL-02
Set request timeouts.
RESIL-03
Apply bounded retries only to retryable failures.
RESIL-04
Apply backoff to repeated retries.
RESIL-05
Use circuit breaking/failure isolation when cascading failure is possible.
RESIL-06
Define fallback behavior for non-essential systems.
RESIL-07
Do not make optional analytics/notifications block core transactions.
RESIL-08
Prevent resource exhaustion from stuck downstream calls.
RESIL-09
Propagate cancellation/timeouts where supported.
RESIL-10
Separate essential dependencies from optional dependencies.
RESIL-11
Test degraded scenarios intentionally.
RESIL-12
Recovery from dependency failure should not require restarting the entire platform where avoidable.

45 — DISASTER RECOVERY
DR-01
Back up critical persistent data.
DR-02
Encrypt backups appropriately.
DR-03
Protect backup credentials separately from primary application credentials.
DR-04
Define a recovery point objective for critical systems.
DR-05
Define a recovery time objective.
DR-06
Test restoring backups.
DR-07
A backup that has never been restored should not be assumed reliable.
DR-08
Keep appropriate backups geographically/infrastructurally isolated when risk justifies it.
DR-09
Document recovery procedures.
DR-10
Back up critical infrastructure/configuration definitions when needed.
DR-11
Practice disaster scenarios periodically for high-value systems.
DR-12
Review disaster-recovery assumptions after major architectural changes.

46 — MONITORING
MON-01
Monitor service availability.
MON-02
Monitor request latency.
MON-03
Monitor error rates.
MON-04
Monitor infrastructure saturation.
MON-05
Monitor database connection usage.
MON-06
Monitor important database query latency.
MON-07
Monitor background queue health.
MON-08
Monitor critical third-party integrations.
MON-09
Monitor scheduled jobs.
MON-10
Monitor production deployment health.
MON-11
Alert on user-impacting symptoms rather than only internal metrics.
MON-12
Regularly remove or improve noisy alerts that operators routinely ignore.

47 — INCIDENT RESPONSE
INCIDENT-01
Define incident severity levels.
INCIDENT-02
Define clear escalation paths.
INCIDENT-03
Maintain operational contact ownership.
INCIDENT-04
Prioritize containment and user impact during incidents.
INCIDENT-05
Preserve relevant evidence for security incidents.
INCIDENT-06
Use documented rollback procedures where rollback is appropriate.
INCIDENT-07
Keep an incident timeline.
INCIDENT-08
Communicate status consistently to affected stakeholders.
INCIDENT-09
Rotate potentially compromised credentials during security incidents.
INCIDENT-10
Perform post-incident review for significant incidents.
INCIDENT-11
Postmortems should focus on systemic improvements rather than individual blame.
INCIDENT-12
Track corrective actions until they are completed.

48 — SCALABILITY
SCALE-01
Keep web application instances stateless where practical.
SCALE-02
Store shared durable state in appropriate external systems.
SCALE-03
Design for horizontal scaling when traffic requirements justify it.
SCALE-04
Manage database connection pools based on actual infrastructure limits.
SCALE-05
Prevent serverless concurrency from exhausting downstream connection limits.
SCALE-06
Use caching to remove repeated expensive computation when correctness allows it.
SCALE-07
Partition workloads only when simpler scaling mechanisms become insufficient.
SCALE-08
Use queues to smooth bursty asynchronous workloads.
SCALE-09
Avoid architectural singletons that become hidden throughput bottlenecks.
SCALE-10
Load-test critical paths before expected high-traffic events when relevant.
SCALE-11
Understand which resources scale automatically and which do not.
SCALE-12
Scale based on measured bottlenecks rather than hypothetical future traffic.

49 — COST CONTROL
COST-01
Track infrastructure spending by service/environment where possible.
COST-02
Create budgets and alerts for material cloud expenditure.
COST-03
Monitor expensive database queries.
COST-04
Avoid unnecessary serverless invocations.
COST-05
Avoid unnecessary external API calls.
COST-06
Cache expensive repeatable third-party responses where allowed.
COST-07
Use appropriate storage tiers and lifecycle policies.
COST-08
Remove unused infrastructure.
COST-09
Monitor bandwidth/egress costs.
COST-10
Set usage caps or protections around user-triggerable expensive operations.
COST-11
Evaluate third-party vendor pricing as part of architecture decisions.
COST-12
Do not trade major reliability or maintainability losses for insignificant infrastructure savings.

50 — DEVELOPER EXPERIENCE
DX-01
A new developer should be able to run the application using documented commands.
DX-02
Dependency installation must be deterministic.
DX-03
Provide a documented development environment configuration.
DX-04
Provide realistic development seed data where useful.
DX-05
Make database migration commands predictable.
DX-06
Provide scripts for recurring repository tasks.
DX-07
Automatically format code.
DX-08
Automate enforceable quality rules instead of relying solely on documentation.
DX-09
Surface missing environment configuration early.
DX-10
Keep local development reasonably representative of production behavior.
DX-11
Avoid requiring undocumented tribal knowledge for routine development.
DX-12
Optimize the repository so the safe, correct workflow is also the easiest workflow.

GLOBAL AGENT ENFORCEMENT POLICY
The coding agent MUST use these rules as constraints, not as instructions to add every possible technology.
Do not add:
* Redis because caching rules exist.
* Kafka because background-job rules exist.
* Kubernetes because scalability rules exist.
* Redux because state-management rules exist.
* A repository layer merely because repositories are mentioned.
* Microservices because architectural boundaries exist.
* Feature flags when no rollout requirement exists.
* Multi-tenancy infrastructure for a single-tenant application.
* Payment infrastructure for an application without payments.
* A queue for work that safely completes within the request.
* A complex design system for a tiny internal tool.
Production engineering means applying the smallest architecture that satisfies current requirements while leaving sensible paths for future change.

ENGINEERING PRIORITY ORDER
When two rules compete, use this order:
Correctness
    ↓
Security
    ↓
Data integrity
    ↓
Authorization / privacy
    ↓
Reliability
    ↓
Maintainability
    ↓
Simplicity
    ↓
Testability
    ↓
Observability
    ↓
Performance
    ↓
Developer experience
    ↓
Visual elegance
    ↓
Cleverness
Cleverness is never justification for making correct code difficult to understand.

REQUIRED FEATURE IMPLEMENTATION FLOW
For every significant feature, follow this sequence:
1. Understand requirement
        ↓
2. Inspect existing architecture
        ↓
3. Identify domain ownership
        ↓
4. Identify security boundaries
        ↓
5. Define data model
        ↓
6. Define contracts/types
        ↓
7. Define validation
        ↓
8. Define authorization
        ↓
9. Implement persistence/query layer
        ↓
10. Implement domain/application logic
        ↓
11. Implement server interface
        ↓
12. Implement UI
        ↓
13. Implement loading/empty/error/success states
        ↓
14. Test critical behavior
        ↓
15. Run lint/typecheck/tests/build
        ↓
16. Review diff
        ↓
17. Verify security
        ↓
18. Verify responsive/accessibility behavior
        ↓
19. Remove dead code
        ↓
20. Document important decisions
Do not start from the visual component and invent security/data architecture afterward.

REQUIRED MUTATION FLOW
Sensitive mutations should conceptually follow:
Client request
    ↓
Parse input
    ↓
Authenticate
    ↓
Validate
    ↓
Authorize
    ↓
Load authoritative state
    ↓
Apply business rules
    ↓
Execute transaction/mutation
    ↓
Trigger necessary side effects
    ↓
Invalidate affected caches
    ↓
Record telemetry/audit information
    ↓
Return minimum required response
Side effects should occur in an order that preserves consistency.

REQUIRED READ FLOW
Protected reads should conceptually follow:
Request
    ↓
Authenticate where required
    ↓
Validate parameters
    ↓
Determine tenant/ownership context
    ↓
Authorize
    ↓
Query authoritative data
    ↓
Transform into minimum DTO
    ↓
Cache only when safe
    ↓
Render/return

CLIENT/SERVER BOUNDARY
Preferred Next.js architecture:
Browser
│
├── Small Client Components
│      │
│      └── Interaction only where needed
│
└── Server Components
       │
       ├── Application / Domain Layer
       │
       ├── Authorization
       │
       └── Data Access Layer
                │
                ├── Database
                ├── Cache
                ├── Object storage
                └── External providers
Secrets and privileged infrastructure belong below the client boundary.

FEATURE DIRECTORY GUIDELINE
A substantial feature may look like:
src/
├── app/
│   ├── (public)/
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── api/
│   ├── layout.tsx
│   └── page.tsx
│
├── features/
│   ├── projects/
│   │   ├── components/
│   │   ├── actions/
│   │   ├── queries/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── permissions/
│   │   ├── types/
│   │   └── utils/
│   │
│   ├── billing/
│   └── users/
│
├── components/
│   ├── ui/
│   └── shared/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── cache/
│   ├── config/
│   ├── logging/
│   └── integrations/
│
├── hooks/
├── emails/
├── jobs/
├── instrumentation/
├── styles/
└── types/
This is a guideline, not a mandatory folder hierarchy.
Do not create empty folders simply to satisfy the diagram.

PROHIBITED ANTI-PATTERNS
Do not introduce:
- giant page.tsx files
- giant "utils.ts" junk drawers
- giant Server Actions
- giant React components
- business logic buried in JSX
- database access from arbitrary components
- authorization implemented only in UI
- unsafe client-provided ownership assumptions
- `any` everywhere
- `@ts-ignore` to silence legitimate issues
- empty catch blocks
- production console debugging
- secrets in NEXT_PUBLIC variables
- raw SQL string concatenation
- unsanitized user HTML
- uncontrolled external URLs
- vendor SDK calls scattered throughout the repository
- global state for every piece of state
- useEffect for everything
- premature memoization
- unnecessary generic abstractions
- 20-level component prop drilling
- unbounded database reads
- N+1 queries
- unsafe schema migrations
- payment operations without idempotency
- webhook handlers without verification
- silent background-job failures
- caching without invalidation strategy
- cross-tenant queries without tenant scope
- uploads without validation
- retries without limits
- external calls without timeouts
- tests that only verify implementation details
- deployments without build verification
- undocumented required environment variables
- abandoned feature flags
- duplicate libraries solving identical problems
- dead code kept "just in case"
- TODO placeholders for required functionality
- architecture invented solely for hypothetical future scale

DEFINITION OF DONE
A feature is NOT complete merely because it renders.
A production feature is complete when relevant items below are satisfied:
Functional
* Main behavior works end-to-end.
* Persistence works correctly.
* Business rules are enforced.
* Edge cases are handled.
Security
* Input is validated.
* Authentication is enforced.
* Authorization is enforced.
* Ownership is verified.
* Sensitive data is not leaked.
* Abuse vectors have been considered.
Data
* Database invariants exist where appropriate.
* Transactions protect atomic operations.
* Concurrency behavior is safe.
* Queries are bounded.
UX
* Loading state exists where needed.
* Empty state exists where needed.
* Error state exists.
* Success feedback exists where needed.
* Mobile behavior works.
* Keyboard behavior works.
Reliability
* External requests have appropriate failure handling.
* Retryable workflows are idempotent.
* Background failures are observable.
Engineering
* TypeScript passes.
* Lint passes.
* Relevant tests pass.
* Production build passes.
* No unnecessary dead code remains.
* No debugging artifacts remain.
Operations
* Required environment variables are documented.
* Important telemetry exists.
* Migrations are deployment-safe.
* Rollback/recovery implications have been considered.
Only after these conditions are met may the agent describe the feature as production-ready.

FINAL AGENT RULE
Never interpret "production-grade" as:
Add as much engineering complexity as possible.
Interpret it as:
Build the simplest system that is demonstrably correct, secure, maintainable, observable, reliable, and capable of meeting its actual production requirements.
Every abstraction must earn its existence.
Every dependency must earn its existence.
Every Client Component must earn its existence.
Every cache must earn its existence.
Every service must earn its existence.
Every piece of global state must earn its existence.
Every optimization must have a reason.
Every exception to a security boundary must have a reason.
When uncertain between a clever implementation and an obvious implementation with equivalent behavior, choose the obvious implementation.
When uncertain between duplicated code and the wrong abstraction, tolerate small duplication until the correct abstraction becomes clear.
When uncertain whether client input is trustworthy, treat it as untrusted.
When uncertain whether an action requires authorization, perform the authorization check.
When uncertain whether an operation can run twice, design it so running twice is safe.
When uncertain whether a query can grow without bound, bound it.
When uncertain whether sensitive information should be returned, return less.
When uncertain whether failure will occur in production, assume eventually it will and design the important path accordingly.



No. 100 is not a hard limit at all. That list was a practical baseline, not a complete specification for a production-grade codebase.
A genuinely production-grade Next.js system can easily involve hundreds of engineering rules, because production quality spans much more than code structure: architecture, security, reliability, databases, observability, deployment, testing, accessibility, performance, incident handling, migrations, CI/CD, dependency management, backups, compliance, and team workflows.
The better way to think about it is not “How many rules do I need?” but “Have I covered every production concern?”
For example, a serious production standard would usually cover these areas:
1. Architecture — boundaries, modules, dependency direction, domain organization, coupling, abstractions.
2. Next.js conventions — Server Components, Client Components, caching, revalidation, route handlers, Server Actions, metadata, streaming.
3. React quality — state placement, effects, composition, hooks, rendering behavior, component APIs.
4. TypeScript — strictness, narrowing, domain types, discriminated unions, unsafe assertions, generics.
5. Database design — schema design, foreign keys, indexes, transactions, constraints, migrations, locking, concurrency.
6. Data access — repositories/queries, pagination, batching, N+1 prevention, query ownership.
7. Authentication — sessions, cookies, token rotation, expiry, account recovery, multi-device sessions.
8. Authorization — RBAC/ABAC, ownership, tenant isolation, server-side enforcement.
9. Security — XSS, CSRF, SSRF, SQL injection, IDOR, rate limiting, secrets, CSP, headers, uploads, redirects.
10. API design — schemas, contracts, versioning, error formats, idempotency, status codes.
11. Validation — forms, APIs, environment variables, webhooks, URLs, file uploads, external responses.
12. Error handling — expected vs unexpected failures, boundaries, user errors, internal diagnostics.
13. Observability — structured logging, metrics, tracing, correlation IDs, dashboards, alerting.
14. Performance — bundle size, caching, database performance, request waterfalls, images, streaming, edge/runtime decisions.
15. Reliability — retries, timeouts, circuit breakers, graceful degradation, idempotency.
16. Background jobs — queues, retries, dead-letter handling, job uniqueness, observability.
17. External integrations — wrappers, timeouts, webhook verification, provider failures, fallback behavior.
18. Testing — unit, integration, component, E2E, contract, regression, security testing.
19. CI/CD — automated checks, preview deployments, migration validation, deployment gates.
20. Deployment — environments, configuration, rollback strategy, health checks, zero-downtime releases.
21. Migrations — backward compatibility, expand/contract migrations, large-table safety, rollback planning.
22. Frontend UX — loading, empty, success, error, optimistic updates, responsive behavior.
23. Accessibility — keyboard support, semantics, screen readers, contrast, reduced motion.
24. Design system — tokens, reusable primitives, consistency, variants.
25. State management — local/server/URL/global state boundaries.
26. Forms — validation, concurrency, duplicate submissions, dirty state, accessibility.
27. Caching — ownership, invalidation, personalization, stale data, CDN/application/database caching.
28. Multi-tenancy — tenant isolation, tenant-aware queries, cross-tenant security.
29. Payments — monetary precision, idempotency, webhook reconciliation, ledger correctness.
30. File storage — signed URLs, access control, MIME validation, lifecycle policies.
31. Email — retries, templates, provider abstraction, bounce handling, unsubscribe requirements.
32. Search — indexing, sanitization, ranking, pagination, eventual consistency.
33. Internationalization — locales, dates, numbers, currencies, time zones, RTL.
34. Privacy — PII handling, retention, deletion, minimization, auditability.
35. Dependencies — lockfiles, vulnerability scanning, update policy, package evaluation.
36. Git practices — branches, commit hygiene, reviewability, protected branches.
37. Code review — correctness, security, architecture, performance, maintainability.
38. Documentation — setup, architecture, APIs, operational procedures, ADRs.
39. Feature flags — rollout, cleanup, targeting, kill switches.
40. Configuration management — environment separation, validation, secret rotation.
41. Analytics — typed events, privacy, provider abstraction, event naming.
42. Rate limiting — user/IP/resource limits, distributed enforcement.
43. Concurrency — race conditions, uniqueness, locking, compare-and-set behavior.
44. Resilience — dependency outages, partial failure, degraded operation.
45. Disaster recovery — backups, restore testing, RPO/RTO.
46. Monitoring — availability, latency, error rate, saturation.
47. Incident response — runbooks, escalation, rollback, postmortems.
48. Scalability — stateless services, horizontal scaling, connection pools, queues.
49. Cost control — database usage, serverless execution, bandwidth, storage, third-party APIs.
50. Developer experience — deterministic setup, seed data, scripts, local environments.
And each one of those categories can contain 10–50+ concrete rules.
So a comprehensive engineering standard could easily become:
Architecture             30–50 rules
TypeScript               20–40
React / Next.js          40–70
Database                 30–50
Security                 50–100+
Testing                  30–50
Performance              25–40
Reliability              25–50
Observability            20–40
DevOps / CI/CD           30–50
UX / Accessibility       30–50
Operational readiness    30–60
────────────────────────────────
Potential total          400–700+ rules
But there is an important catch: a 700-rule prompt is not necessarily better than a 100-rule prompt.
If you dump 700 equally weighted instructions into a coding agent, it may start obeying them mechanically, overengineering simple features, creating unnecessary abstractions, or losing sight of the actual architecture.
For an AI coding agent, a better system is hierarchical:
LEVEL 1 — NON-NEGOTIABLE PRINCIPLES
~20 rules

LEVEL 2 — ARCHITECTURAL STANDARDS
~40–60 rules

LEVEL 3 — IMPLEMENTATION STANDARDS
~100–150 rules

LEVEL 4 — SECURITY & RELIABILITY
~75–100 rules

LEVEL 5 — TESTING & QUALITY
~50–75 rules

LEVEL 6 — OPERATIONS & DEPLOYMENT
~50–75 rules

LEVEL 7 — DOMAIN-SPECIFIC RULES
Added depending on project
Then tell the agent which rules take precedence:
Priority order:

1. Correctness
2. Security
3. Data integrity
4. Maintainability
5. Reliability
6. Simplicity
7. Performance
8. Developer experience
9. Visual polish
10. Cleverness
That priority order matters enormously.
For example, without it an agent may choose:
DRY
over readability and create a monstrous abstraction.
Or choose:
performance
over correctness and introduce unsafe caching.
Or choose:
beautiful architecture
over shipping a simple, understandable implementation.
A strong production philosophy is therefore:
Correct
> Secure
> Understandable
> Maintainable
> Reliable
> Testable
> Observable
> Performant
> Elegant
And there is another important distinction:
Production-grade code is not produced by coding rules alone.
You can have immaculate source code and still have a terrible production system if:
No backups
No monitoring
No alerts
No rollback strategy
No rate limiting
No database constraints
No migration strategy
No incident procedure
No error tracking
No security headers
No dependency scanning
No restore testing
So I would separate your agent's rules into three documents, rather than one enormous prompt:
AGENTS.md
    ↓
How the AI must behave and modify the repository

ENGINEERING.md
    ↓
Architecture + coding standards

PRODUCTION.md
    ↓
Security + reliability + deployment + observability
And optionally:
docs/
├── architecture.md
├── database.md
├── security.md
├── testing.md
├── conventions.md
└── adr/
That gives the agent persistent rules without making every individual task prompt enormous.
So the earlier 100 rules are closer to "the first 100 rules worth enforcing", not “all the rules required for production.”
If you're building a serious Next.js codebase with an autonomous coding agent, I'd target roughly 250–400 carefully organized rules, with about 20–30 marked as absolute non-negotiables. Beyond that, project-specific standards are usually more valuable than adding generic rules.
