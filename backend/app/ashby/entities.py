"""Declarative list of the 13 Ashby entities we fetch.

`supports_sync_token = True`  -> incremental on subsequent runs (fallback to full
                                 on syncTokenExpired).
`supports_sync_token = False` -> full re-fetch every run (small lookup tables).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Entity:
    name: str                      # storage key / file basename
    endpoint: str                  # ashby endpoint (category.method)
    pk: str | None                 # primary-key field in the response row, or None
    supports_sync_token: bool


ENTITIES: list[Entity] = [
    # token-supporting, bulk
    Entity("jobs",                "job.list",                "id", True),
    Entity("job_postings",        "jobPosting.list",         "id", True),
    Entity("openings",            "opening.list",            "id", True),
    Entity("candidates",          "candidate.list",          "id", True),
    Entity("applications",        "application.list",        "id", True),
    Entity("offers",              "offer.list",              "id", True),
    # small lookup tables (full re-fetch each run)
    Entity("archive_reasons",     "archiveReason.list",      "id", False),
    Entity("sources",             "source.list",             "id", False),
    Entity("users",               "user.list",               "id", False),
    Entity("departments",         "department.list",         "id", False),
    Entity("locations",           "location.list",           "id", False),
]

# Entities that Ashby gates behind a parent-id (so .list with empty body fails):
#   application.listHistory -> requires applicationId; fan out across all applications.
#   interviewStage.list     -> requires interviewPlanId; fan out across plans on jobs.
# Handled by specialized fetchers in app.sync.parent_keyed (deferred to v1.1);
# for v1 we compute pipeline state from applications.currentInterviewStage only.


ENTITY_MAP: dict[str, Entity] = {e.name: e for e in ENTITIES}
