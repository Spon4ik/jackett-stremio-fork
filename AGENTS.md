# AGENTS.md

## Purpose

This repository is a narrow Stremio addon that translates Jackett indexer results into Stremio stream responses.

Primary goal:
- return relevant, stable, auditable Stremio stream results for a user query by querying Jackett and transforming the response safely.

Non-goals unless explicitly requested:
- qBittorrent integration
- Arr integrations
- Debrid integrations
- account systems
- large admin UIs
- multi-service orchestration

---

## Working style

- Make the minimum required change to solve the requested problem.
- Prefer localized edits over broad refactors.
- Preserve existing behavior unless the task explicitly requires changing it.
- Do not rewrite working modules just to make them cleaner.
- Do not rename public env vars, API routes, or manifest fields without need.
- Keep the project Docker-first and easy to run locally.
- Keep configuration env-driven and lightweight.

When fixing bugs or adding features:
1. first understand the current behavior and data flow
2. identify the smallest safe change
3. implement
4. verify against existing behavior and known edge cases
5. report what changed and what was intentionally left unchanged

---

## Safety rules for changes

Avoid regressions.
Before changing ranking, matching, filtering, parsing, or search flow:

- inspect the current request path from Stremio query -> internal normalization -> Jackett request -> response filtering -> response ranking -> Stremio stream output
- preserve behavior outside the requested scope
- do not silently weaken exact-match logic
- do not broaden matching rules unless explicitly required
- do not replace deterministic rules with looser heuristics without a clear reason
- do not remove guards that suppress irrelevant results just because they hide some edge-case true positives

For bug fixes, prefer:
- tightening matching
- adding guardrails
- preserving existing interfaces
- adding targeted tests around the failing scenario

For new features, prefer:
- additive changes
- feature flags or env flags when behavior may be risky
- isolated helper functions over invasive rewrites

---

## Definition of done

A task is not done until all relevant items below are true:

- the code change is minimal and understandable
- existing intended behavior is preserved
- new behavior is covered by targeted tests when feasible
- lint/build/test commands pass if present
- Docker workflow still works
- the final summary explains risk, scope, and validation performed

Never claim success based only on static reading if the code can be exercised.

## Versioning and Git publication

- Every completed code or user-facing behavior change must update the project version before it is considered done.
- Follow Semantic Versioning and use engineering judgment:
  - patch (`x.y.Z`) for backward-compatible bug fixes and internal corrections
  - minor (`x.Y.0`) for backward-compatible features or meaningful new functionality
  - major (`X.0.0`) for breaking API, configuration, manifest, deployment, or behavior changes
- Keep version declarations consistent wherever the repository exposes them.
- After relevant tests, lint, build, and Docker checks pass, commit the completed versioned change to Git and push the working branch to the configured fork remote.
- Never leave a completed version bump only in the local working tree unless the user explicitly asks not to commit or push.

## Docker runtime freshness

- Treat the running Docker Compose service as part of the deliverable, not as an optional follow-up.
- After every completed change that affects application code, configuration, dependencies, version metadata, Docker files, or user-visible behavior, rebuild and recreate the active service with the repository's Compose workflow.
- Do not assume that committing, pushing, or building an image updates an already-running container.
- Before declaring completion, verify the active container was created from the current image and that its live `/manifest.json` version exactly matches `package.json`.
- When the configure page exists, verify it displays the same version as `package.json` and the live manifest.
- Preserve the required Watchtower label when recreating the service.
- If the runtime cannot be updated or verified, report the task as incomplete rather than claiming the repository and deployed addon are synchronized.

---

## Project constraints

- Keep the project single-purpose: Jackett -> Stremio only.
- Prefer small env-driven filters over large configuration systems.
- Keep changes easy to audit.
- Preserve compatibility with Watchtower-based auto-updates.
- Avoid Docker changes that require manual recreation unless necessary.

The runtime container should keep:
- `com.centurylinklabs.watchtower.enable=true`

---

## Jackett API expertise requirements

Treat Jackett as the search backend of record.

When working with Jackett integration:

- understand the exact Jackett endpoint(s), parameters, and response fields already used by this repo before changing anything
- preserve compatibility with configured indexers where possible
- prefer using structured Jackett fields when available instead of guessing from title text
- use title parsing only as fallback, not as the primary truth source if better fields already exist
- assume indexers vary in quality and completeness
- code defensively against missing, malformed, duplicated, or inconsistent Jackett fields
- do not assume every result has reliable season/episode metadata
- do not assume every result title follows the same release naming convention
- normalize data before filtering and ranking

When changing Jackett query behavior:
- avoid over-broad search expansions that increase irrelevant hits
- prefer exact title preservation for series/movie names
- for episodic content, prioritize exact season/episode matches over pack matches, unrelated episodes, or franchise-neighbor titles
- if fallback broadening is introduced, it must be explicit and lower-priority than exact matches
- never let a weak fallback outrank a strong exact match

---

## Search relevance rules

Search relevance is core behavior.
A change that increases result count but hurts relevance is a regression.

Ranking priority should generally favor:
1. exact title match
2. exact season/episode match
3. exact year match when relevant
4. trusted metadata match from Jackett fields
5. clean release title match after normalization
6. healthy torrent characteristics only after relevance is established

Do not let quality-like signals outrank content relevance.
Examples of signals that must not dominate title/episode correctness:
- seeders
- resolution
- size
- language hints
- source quality
- codec

A 100% relevant lower-quality result is better than a high-quality irrelevant result.

For episodic content:
- exact `SxxEyy` match should strongly outrank whole-season packs unless the user asked for a pack
- a different episode from the same show is irrelevant
- a different show from the same franchise is irrelevant
- unrelated content with overlapping tokens is irrelevant

For movie/content title matching:
- normalize punctuation, case, separators, repeated spaces
- treat common release noise separately from core title
- avoid token-based matching that allows a few generic words to dominate
- prefer phrase integrity for the main title

---

## Filtering rules

Current custom filters:
- `ALLOWED_LANGUAGES`
- `MIN_RESOLUTION`

These are heuristic and rely partly on release-title parsing.

Rules for filters:
- do not silently repurpose existing env vars
- do not make filters stricter by default unless explicitly requested
- do not apply heuristic language or resolution parsing before relevance checks
- if parsed metadata is uncertain, prefer "unknown" over a false confident value
- avoid dropping potentially correct results solely because optional metadata could not be parsed

If adding a new filter:
- keep it env-driven
- document default behavior
- make failure mode conservative and predictable

---

## Matching and normalization rules

Before comparing titles or episodes:
- normalize case
- normalize separators (`.`, `_`, `-`, spaces)
- strip obvious release noise carefully
- preserve the semantic title
- parse season/episode using deterministic patterns first
- keep parsing logic centralized when possible

Do not:
- over-strip titles until distinct shows become indistinguishable
- collapse franchise qualifiers that are needed for disambiguation
- use fuzzy matching as the first-line decision rule
- broaden acceptance just because a query returned few results

---

## API and response handling

- Preserve Stremio response schema.
- Do not change manifest shape or stream object structure unless requested.
- Keep error handling explicit and safe.
- Handle empty Jackett responses gracefully.
- Handle partial/malformed items without crashing the whole response.
- Prefer skipping a bad item over failing the entire request unless the failure is systemic.

When deduplicating:
- use stable keys
- do not accidentally merge distinct episodes, editions, or releases
- document the dedupe rule in code if it is not obvious

---

## Performance rules

- Avoid needless extra Jackett calls.
- Avoid broad fan-out across indexers unless explicitly required.
- Avoid expensive parsing passes when one normalized pass can do the job.
- Prefer simple deterministic ranking to opaque multi-stage heuristics.
- Preserve responsiveness for interactive Stremio usage.

---

## Testing and validation expectations

For any change touching search, filtering, parsing, ranking, or dedupe, add or update targeted tests where feasible.

At minimum, verify scenarios like:
- exact show + exact episode returns the requested episode near the top
- unrelated series with overlapping tokens do not outrank the requested title
- same show wrong episode does not outrank exact episode
- season packs do not outrank exact episode unless intended
- movie title disambiguation works for close names
- missing metadata does not crash processing
- heuristic language/resolution parsing does not hide clearly relevant results

If there is an existing bug report or concrete failing example, encode it as a regression test first when practical.

Example critical regression scenario:
- query for `The Rookie S08E15`
- exact episode matches must outrank unrelated series, unrelated episodes, and weak token matches

---

## Review checklist

Before finalizing a patch, check:

- Is the change truly minimal?
- Could this break existing relevance behavior?
- Did I change ranking order intentionally?
- Did I preserve exact-match priority?
- Did I avoid broadening heuristics unnecessarily?
- Did I validate the reported failing scenario?
- Did I avoid changing Docker/runtime behavior unless required?

In the final response, include:
- what changed
- why it was needed
- regression risks
- how it was validated

---

## Preferred prompts and workflow

When asked to work on this repo, default to one of these modes:

### Bug fix mode
- reproduce mentally from code/tests/logs
- identify root cause
- make the smallest safe fix
- add/update regression coverage
- explain risk

### Feature mode
- preserve current behavior by default
- add the feature in the narrowest place possible
- guard risky behavior behind env flags if appropriate
- add tests for both enabled and default behavior

### Review mode
- focus on correctness, regressions, search relevance, and API compatibility
- call out any change that could broaden irrelevant matches

---

## Commands and verification

Before editing, discover and use the actual project commands from the repo.

Prefer to run the smallest relevant verification set first, then broader checks.
Typical categories to look for:
- install
- test
- lint
- build
- Docker compose / container run

Do not invent commands if they are not defined in the repo.
If commands are missing, say so explicitly.

---

## Documentation expectations

When behavior changes:
- update README or env var documentation if user-facing behavior changed
- keep docs concise
- do not add documentation noise for purely internal refactors
