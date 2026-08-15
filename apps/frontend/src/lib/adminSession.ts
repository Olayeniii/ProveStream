/**
 * `sessionStorage` key for the admin session token issued by `POST
 * /api/admin/login` (see `AdminDashboard.tsx`). Shared with `PoliciesPage.tsx`,
 * which opportunistically reuses an already-logged-in admin session to
 * accelerate the policy-list cache after creating a policy — if the key
 * doesn't match exactly, that reuse silently breaks instead of erroring, so
 * this lives in one place rather than as a literal duplicated in both files.
 */
export const ADMIN_SESSION_STORAGE_KEY = 'adminToken';
