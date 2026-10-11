CREATE TABLE IF NOT EXISTS content_factory_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 status text NOT NULL,
 requested_limit integer NOT NULL,
 inserted integer NOT NULL DEFAULT 0,
 rejected integer NOT NULL DEFAULT 0,
 skipped integer NOT NULL DEFAULT 0,
 quota_paused integer NOT NULL DEFAULT 0,
 note text
);
CREATE INDEX IF NOT EXISTS content_factory_runs_started_idx ON content_factory_runs (started_at DESC);
