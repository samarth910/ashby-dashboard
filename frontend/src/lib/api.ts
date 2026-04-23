// Thin fetch wrapper. Backend is either same-origin (prod) or on :8000 (dev, via Vite proxy).

export type Envelope<T> = { data: T; lastSyncAt: string | null; source: string; servedAt: string };

async function get<T>(path: string): Promise<Envelope<T>> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return res.json();
}

export const api = {
  health: () =>
    fetch("/api/health").then((r) => r.json()) as Promise<{
      status: string;
      now: string;
      registry: { loadedAt: string | null; entities: Record<string, number>; derived: Record<string, number> };
      sync: {
        lastRunStartedAt: string | null;
        lastRunCompletedAt: string | null;
        lastRunKind: string | null;
        lastRunDurationSec: number | null;
        currentJobId: string | null;
        entities: Record<
          string,
          { syncToken: boolean; rowCount: number | null; lastFullSync: string | null; lastIncrementalSync: string | null; lastError: string | null }
        >;
      };
    }>,

  overview: () => get<Overview>("/api/overview"),
  roles: (q: { status?: string; department?: string; hiring_manager?: string; scope?: "listed_open" | "open" | "all" } = {}) => {
    const qs = new URLSearchParams();
    if (q.status) qs.set("status", q.status);
    if (q.department) qs.set("department", q.department);
    if (q.hiring_manager) qs.set("hiring_manager", q.hiring_manager);
    if (q.scope) qs.set("scope", q.scope);
    const s = qs.toString();
    return get<Role[]>(`/api/roles${s ? "?" + s : ""}`);
  },
  role: (jobId: string) => get<RoleDetail>(`/api/roles/${jobId}`),
  roleActivity: (jobId: string, days = 7) => get<RoleActivity>(`/api/roles/${jobId}/activity?days=${days}`),
  velocity: () => get<VelocityData>("/api/velocity"),
  sources: () => get<SourcesData>("/api/sources"),
  people: () => get<PersonLoad[]>("/api/people"),
  pipeline: (q: { stage?: string; job_id?: string; hiring_manager?: string; scope?: "listed_open" | "all"; min_days?: number } = {}) => {
    const qs = new URLSearchParams();
    if (q.stage) qs.set("stage", q.stage);
    if (q.job_id) qs.set("job_id", q.job_id);
    if (q.hiring_manager) qs.set("hiring_manager", q.hiring_manager);
    if (q.scope) qs.set("scope", q.scope);
    if (q.min_days && q.min_days > 0) qs.set("min_days", String(q.min_days));
    const s = qs.toString();
    return get<PipelineResponse>(`/api/pipeline${s ? "?" + s : ""}`);
  },
  roleTimeline: (jobId: string) => get<RoleTimeline>(`/api/roles/${jobId}/timeline`),
  refreshStart: (full = false) =>
    post<{ jobId: string; status: string; kind: string }>(`/api/refresh${full ? "?full=true" : ""}`),
  refreshStatus: (jobId: string) => fetch(`/api/refresh/${jobId}`).then((r) => r.json()) as Promise<RefreshJob>,
};

export type FunnelBuckets = {
  applied: number;
  live: number;
  in_interview: number;
  offer: number;
  rejected: number;
};

export type RoundSplit = {
  round_1: number;
  round_2: number;
  round_3: number;
  round_4: number;
  final_round: number;
};

export type RoleRow = {
  job_id: string;
  title: string;
  hiring_manager: string | null;
  applied: number;
  live: number;
  offer: number;
  rejected: number;
} & RoundSplit;

export type RoundBreakdown = {
  stage: string;
  count: number;
  median_days: number | null;
  p90_days: number | null;
  stuck_count: number;
  sla_days: number | null;
};

export type Overview = {
  kpis: {
    openRoles: number;
    totalInPipeline: number;
    applicationsLast7: number;
    applicationsPrev7: number;
    applicationsDelta: number;
    offersOutstanding: number;
    offerAcceptRate30d: number | null;
  };
  conversionFunnel: FunnelBuckets;
  rolesSummary: FunnelBuckets & RoundSplit & { total_roles: number };
  roles: RoleRow[];
  rounds: RoundBreakdown[];
  applicationsPerDay30d: { date: string; source: string; count: number }[];
  stuckCandidates: {
    application_id: string;
    candidate_id: string;
    candidate_name: string;
    job_id: string;
    job_title: string;
    stage: string;
    days_since_update: number;
  }[];
};

export type PipelineResident = {
  application_id: string;
  candidate_id: string;
  candidate_name: string;
  job_id: string;
  job_title: string;
  department: string | null;
  location: string | null;
  hiring_manager: string | null;
  source_title: string;
  stage_title: string;
  stage_type: string;
  stage_number: number | null;
  entered_stage_at: string | null;
  days_in_stage: number | null;
  is_listed_open: boolean;
  sla_breach: boolean;
};

export type PipelineResponse = {
  residents: PipelineResident[];
  rounds: RoundBreakdown[];
};

export type RoleTimeline = {
  candidates: {
    application_id: string;
    candidate_id: string;
    candidate_name: string;
    current_stage: string;
    status: string;
    stages: {
      stage: string;
      stage_number: number | null;
      entered_at: string | null;
      left_at: string | null;
      duration_days: number | null;
      is_current: boolean;
    }[];
  }[];
};

export type Role = {
  job_id: string;
  title: string;
  status: string;
  is_listed: boolean;
  is_open: boolean;
  is_listed_open: boolean;
  department: string | null;
  location: string | null;
  hiring_manager: string | null;
  recruiter: string | null;
  days_open: number | null;
  applied: number;
  live: number;
  in_interview: number;
  offer: number;
  rejected: number;
  hired: number;
  last_activity_at: string | null;
} & RoundSplit;

export type RoleDetail = {
  meta: { jobId: string; title: string; status: string; createdAt: string; openedAt: string | null };
  funnel: { stage: string; active_now: number; all_time: number; last_7d: number; median_days: number | null }[];
  sources: {
    source: string;
    applied: number;
    past_review: number;
    to_interview: number;
    offered: number;
    hired: number;
    past_review_pct: number;
  }[];
};

export type RoleActivity = {
  newApplications: { date: string; source: string; count: number }[];
  stageEntries: { date: string; stage: string; count: number }[];
};

export type VelocityData = {
  heatmap: { job_id: string; stage: string; median_days: number; title?: string }[];
  funnel90d: {
    applied: number;
    past_review: number;
    interview: number;
    offer: number;
    hired: number;
  };
};

export type SourcesData = {
  table: {
    source: string;
    window: string;
    applied: number;
    past_review: number;
    to_interview: number;
    offered: number;
    hired: number;
  }[];
  thisWeekShare: { source: string; count: number }[];
};

export type PersonLoad = {
  hiring_manager: string;
  active_roles: number;
  live: number;
  in_interview: number;
  offer: number;
};

export type RefreshJob = {
  id: string;
  kind: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_sec: number | null;
  error: string | null;
  progress: number;
  entities: Record<string, { state: string; count: number; fetched: number; duration_sec: number | null; error: string | null }>;
};
