-- Which admin approved/rejected this alert, so the DecisionRegistry audit
-- trail (resolution_anchor) is actually attributable to a person, not just
-- "some admin, at some time." NULL for alerts resolved before per-admin
-- identity existed, or via the ADMIN_TOKEN bootstrap path (which still
-- shares one identity across every admin) — both are honest gaps, not bugs.
ALTER TABLE fraud_alerts ADD COLUMN resolved_by TEXT;
