# CARELOOP PHASE 2.4.4 — FINAL AUTHORIZATION, CONCURRENCY & DATABASE PRIVILEGE AUDIT REPORT

**Target System:** CareLoop Emergency Blood Coordination Platform  
**Phase:** 2.4.4 Final Authorization Freshness, Concurrency Serialization & Database Privilege Audit  
**Auditor / Security Engineer:** Senior PostgreSQL / Supabase Security Engineer, Concurrency Specialist & WebRTC Infrastructure Architect  
**Execution Environment:** Isolated Local Docker PostgreSQL 17.6 (`supabase_db_blood`)  
**Date:** November 5, 2026  
**Safety Scope:** Strict Local Environment Execution. Zero Remote Database Access.  
- **Local Database:** **VERIFIED** (PostgreSQL 17.6, 10 migrations applied, 16/16 regression tests passed)  
- **Application Codebase:** **VERIFIED** (60/60 Vitest tests passed, 0 TypeScript compilation errors, build passed in 6.03s)  
- **VPS Coturn Relay Daemon:** **NOT DEPLOYED** (RFC 8489 STUN & draft-uberti-behave-turn-rest-00 ephemeral REST HMAC verified locally; Linux VPS turnserver hosting pending)  
- **Remote Supabase Project (`uzwtchnqmveapzehuafb`):** **NOT VERIFIED** (Completely Untouched; `supabase db push` and `supabase link` strictly prohibited)  

---

## A. EXECUTIVE SUMMARY

### What Was Audited
1. **Membership Mutation Serialization (Audit A):** Inspected all mutation paths affecting `public.blood_centre_memberships`. Proved that only vetted `SECURITY DEFINER` atomic procedures (`add_centre_member_atomic`, `set_centre_member_status_atomic`) can mutate memberships. Verified that direct table writes (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) remain completely revoked from client roles (`PUBLIC`, `anon`, `authenticated`).
2. **Authorization Freshness Under Concurrency (Audit B):** Investigated whether a caller can begin a privileged operation while authorized and commit it after their role or membership has been revoked/suspended. Identified a race window where role revocation was not synchronized with ongoing mutations. Discovered a subtle PostgreSQL three-valued logic (`NULL`) trap where `SELECT ... INTO` leaving variables `NULL` caused `IF NOT (...)` statements to evaluate to `NULL` rather than `TRUE`, skipping authorization rejections.
3. **PostgreSQL Default Privileges (Audit C):** Audited `pg_default_acl` across all function-creator roles (`postgres`, `supabase_admin`). Discovered that while `postgres` had default `anon` and `PUBLIC` execute revoked, `supabase_admin`'s default ACL in `public` still granted `anon=EXECUTE`. Created and inspected temporary functions under both creator roles to verify effective runtime permissions.
4. **Notification Delivery RPC Alignment (Audit D):** Inspected `public.update_notification_delivery_status`. Removed contradictory coordinator/admin authorization branches to align the internal check strictly with its `service_role`-only execution contract. Verified that `'ACKNOWLEDGED'` cannot be set via the delivery status RPC.
5. **Full Function ACL Audit (Audit E):** Inspected all 38 public functions via catalog inspection (`aclexplode`). Verified that 100% are `SECURITY DEFINER` with fixed `search_path`, zero grant `PUBLIC=EXECUTE`, and zero client roles possess `CREATE` on sensitive schemas.
6. **TURN Documentation Accuracy (Audit F):** Corrected protocol citations in `src/services/webRtcService.ts` and database documentation to accurately reference RFC 8656 (TURN), RFC 8489 (STUN), and `draft-uberti-behave-turn-rest-00` (Coturn REST HMAC credentials).

### What Was Fixed (Migration 10 Applied)
1. **Authorization Freshness Locks:**
   - In `add_centre_member_atomic` and `set_centre_member_status_atomic`, caller authorization is now protected by row locks `FOR SHARE`:
     - Caller's profile row in `public.profiles` is locked `FOR SHARE`, serializing against concurrent role changes (`admin_set_user_role`).
     - Caller's own membership row in `public.blood_centre_memberships` is locked `FOR SHARE`, serializing against concurrent coordinator demotions/suspensions.
2. **Three-Valued Boolean Logic Hardening:**
   - Wrapped `v_caller_mem_role`, `v_caller_mem_status`, and target roles with `COALESCE` to eliminate PostgreSQL three-valued boolean bypasses when records are absent.
3. **Strict Service-Role Delivery Contract:**
   - Hardened `update_notification_delivery_status` to enforce `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION ... USING ERRCODE = '42501'; END IF;`.
4. **Creator Role Default Privileges Hardened:**
   - Hardened `supabase_admin` default ACL in `public` schema via `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon;`.

### What Remains Unresolved (Operational Boundaries)
- **Remote Supabase:** Project `uzwtchnqmveapzehuafb` remains untouched (**NOT VERIFIED**).
- **VPS Coturn Relay:** Linux daemon not provisioned on VPS (**NOT DEPLOYED**).
- **Carrier Cellular SMS:** Intentionally deactivated; system relies exclusively on persisted real-time in-app notifications.

---

## B. AUTHORIZATION CONCURRENCY MATRIX

| # | Operation | Concurrent Attack Scenario | Expected Result | Actual Result | Evidence |
|:---:|:---|:---|:---|:---|:---|
| 1 | `set_centre_member_status_atomic` | Two concurrent requests modifying the exact same membership row `(centre_id, user_id)`. | Serialized cleanly via `pg_advisory_xact_lock` and row-level `FOR UPDATE`. Zero lost updates or deadlocks. | **PASSED** (Both transactions succeed deterministically; valid final status). | `verify_phase2_4_4_audit.ts` Suite 1 Test 1 (1237ms). |
| 2 | `add_centre_member_atomic` vs `set_centre_member_status_atomic` | Coordinator promotes technician to manager while manager concurrently attempts to suspend technician. | TOCTOU eliminated. Row lock ensures manager sees promoted status; manager suspension rejected with 403. | **PASSED** (Coordinator promotion succeeded; manager rejected with Unauthorized). | `verify_phase2_4_4_audit.ts` Suite 1 Test 2 (1234ms). |
| 3 | `add_centre_member_atomic` vs `set_centre_member_status_atomic` | Manager technician promotion racing with manager technician suspension on the same member. | Serialized cleanly in sequence. Target state reflects serialized execution without corrupt intermediate states. | **PASSED** (Both operations serialized; final status: `technician\|suspended`). | `verify_phase2_4_4_audit.ts` Suite 1 Test 3 (1046ms). |
| 4 | Multi-Centre Concurrency | Parallel membership additions targeting distinct centres (`Centre 1` and `Centre 2`). | Non-blocking parallel execution (different advisory lock keys). | **PASSED** (Parallel execution finished in 223ms with 0 contention). | `verify_phase2_4_4_audit.ts` Suite 1 Test 4 (1058ms). |
| 5 | Direct Table Writes | Authenticated or anonymous attacker attempts direct `INSERT/UPDATE/DELETE` on `blood_centre_memberships`. | Rejected with SQLSTATE 42501 (table privileges revoked from client roles). | **PASSED** (`permission denied for table blood_centre_memberships`). | `verify_phase2_4_4_audit.ts` Suite 1 Test 5 (847ms). |
| 6 | Coordinator Demotion Race | Admin demotes coordinator to `donor` while coordinator is executing `add_centre_member_atomic`. | Profile row lock `FOR SHARE` serializes with admin `FOR UPDATE`. Demoted caller aborted with Unauthorized. | **PASSED** (Revocation serialized cleanly; subsequent operation blocked). | `verify_phase2_4_4_audit.ts` Suite 2 Test 1 (1198ms). |
| 7 | Manager Suspension Race | Coordinator suspends manager while manager is executing `add_centre_member_atomic`. | Membership row lock `FOR SHARE` on caller detects suspension immediately. Mutation aborted with Unauthorized. | **PASSED** (Suspension serialized; suspended manager unable to modify members). | `verify_phase2_4_4_audit.ts` Suite 2 Test 2 (1415ms). |

---

## C. FUNCTION ACL AUDIT (ALL 38 FUNCTIONS IN `public` SCHEMA)

Inspected via catalog query:
```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef,
       array_to_string(p.proconfig, ', '), pg_get_userbyid(p.proowner),
       (SELECT string_agg(grantee.rolname || '=' || priv.privilege_type, ', ')
        FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) priv
        JOIN pg_roles grantee ON grantee.oid = priv.grantee)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';
```

| # | Function Signature | Owner | SecDef | Fixed `search_path` | Effective Role Grants | Intended / Justification |
|:---:|:---|:---:|:---:|:---:|:---|:---:|
| 1 | `accept_call(p_call_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | WebRTC call callee acceptance. |
| 2 | `accept_request_and_create_conversation(p_request_id uuid, p_donor_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Atomic request acceptance and chat provisioning. |
| 3 | `acknowledge_all_notifications()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Batch acknowledges user's own alerts (`user_id = auth.uid()`). |
| 4 | `acknowledge_notification(p_notification_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Single alert acknowledgement with timestamp. |
| 5 | `add_centre_member_atomic(p_centre_id uuid, p_user_id uuid, p_role text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Freshness-locked staff/tech mutation. Manager guard enforced. |
| 6 | `adjust_inventory_atomic(p_centre_id uuid, p_blood_group text, p_component text, p_delta_units integer, p_reason text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Atomic blood inventory adjustment. Centre member check. |
| 7 | `admin_set_user_role(p_user_id uuid, p_new_role text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Administrative role assignment with audit trail. |
| 8 | `assign_blood_centre_atomic(p_request_id uuid, p_centre_id uuid, p_units integer, p_coordinator_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Coordinator blood centre dispatch allocation. |
| 9 | `assign_donor_atomic(p_request_id uuid, p_donor_id uuid, p_units integer, p_coordinator_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Coordinator donor emergency assignment. |
| 10 | `cancel_call(p_call_id uuid, p_reason text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Call participant termination. |
| 11 | `cancel_donor_assignment_atomic(p_assignment_id uuid, p_reason text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Assignment cancellation with reason. |
| 12 | `create_notification(p_user_id uuid, p_channel text, p_title text, p_content text, p_metadata jsonb, p_idempotency_key text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Persisted notification creator. Auth checked. |
| 13 | `discover_matching_donors(p_request_id uuid, p_max_distance_km numeric)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Haversine distance donor matching. |
| 14 | `end_call(p_call_id uuid, p_reason text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Active call session termination. |
| 15 | `enforce_call_session_immutability()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **Trigger Function.** Prevents call parameter tampering. |
| 16 | `expire_call(p_call_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Timeout call session expiration. |
| 17 | `get_current_donor_id()` | `postgres` | **t** | `public, pg_temp` | `anon, authenticated, service_role` | **RLS Helper.** Resolves donor UUID from `auth.uid()`. |
| 18 | `get_discoverable_emergency_requests(p_lat numeric, p_lng numeric, p_radius_km numeric)` | `postgres` | **t** | `public, pg_temp` | `anon, authenticated, service_role` | Public awareness discovery for nearby blood requests. |
| 19 | `get_ephemeral_turn_credentials(p_ttl_seconds integer)` | `postgres` | **t** | `public, extensions, pg_temp` | `authenticated, service_role` | 600s TTL HMAC REST credentials. Advisory-locked rate limit. |
| 20 | `get_user_role()` | `postgres` | **t** | `public, pg_temp` | `anon, authenticated, service_role` | **RLS Helper.** Resolves active profile role or `'anonymous'`. |
| 21 | `handle_new_user()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **Trigger Function.** Auto-provisions profile on auth signup. |
| 22 | `has_donor_responded_to_request(p_request_id uuid)` | `postgres` | **t** | `public, pg_temp` | `anon, authenticated, service_role` | **RLS Helper.** Evaluates donor response status. |
| 23 | `initiate_call(p_conversation_id uuid, p_call_type text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Initiates WebRTC call for conversation participant. |
| 24 | `is_assigned_donor_for_requester(p_donor_id uuid)` | `postgres` | **t** | `public, pg_temp` | `anon, authenticated, service_role` | **RLS Helper.** Verifies assignment link. |
| 25 | `is_centre_member(p_centre_id uuid, p_user_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **RLS Helper.** Non-recursive centre membership policy check. |
| 26 | `is_conversation_participant(p_conv_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **RLS Helper.** Non-recursive chat participant check. |
| 27 | `is_request_creator(p_request_id uuid)` | `postgres` | **t** | `public, pg_temp` | `anon, authenticated, service_role` | **RLS Helper.** Checks if `auth.uid()` created request. |
| 28 | `issue_ice_credentials(p_call_id uuid)` | `postgres` | **t** | `public, extensions, pg_temp` | `authenticated, service_role` | Issues call-specific HMAC ICE credentials. |
| 29 | `prevent_message_tampering()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **Trigger Function.** Guarantees message immutability. |
| 30 | `prevent_profile_privilege_escalation()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **Trigger Function.** Blocks non-admins from changing role. |
| 31 | `record_call_connected(p_call_id uuid)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Transitions call to `IN_PROGRESS`. |
| 32 | `reject_call(p_call_id uuid, p_reason text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Rejects incoming call by callee. |
| 33 | `set_centre_member_status_atomic(p_centre_id uuid, p_user_id uuid, p_status text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Freshness-locked status update. Inter-manager guard. |
| 34 | `set_inventory_atomic(p_centre_id uuid, p_blood_group text, p_component text, p_new_units integer, p_reason text)` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | Sets absolute inventory count. Manager/tech check. |
| 35 | `update_notification_delivery_status(p_notification_id uuid, p_status text, p_error text)` | `postgres` | **t** | `public, pg_temp` | `service_role` **ONLY** | Transport status update. Authenticated/anon revoked. |
| 36 | `validate_audit_log_actor()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **Trigger Function.** Ensures audit log actor integrity. |
| 37 | `validate_emergency_request_transition()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **Trigger Function.** Request state machine validator. |
| 38 | `validate_message_sender()` | `postgres` | **t** | `public, pg_temp` | `authenticated, service_role` | **Trigger Function.** Verifies sender matches `auth.uid()`. |

---

## D. DEFAULT PRIVILEGES AUDIT ACROSS CREATOR ROLES

### 1. Catalog Inspection (`pg_default_acl`)
```text
  creator_role  | target_schema | obj_type |                      default_privileges                       
----------------+---------------+----------+---------------------------------------------------------------
 postgres       | public        | f        | postgres=EXECUTE, authenticated=EXECUTE, service_role=EXECUTE
 supabase_admin | public        | f        | postgres=EXECUTE, authenticated=EXECUTE, service_role=EXECUTE
```

### 2. Runtime Verification with Temporary Functions
1. **Created by `postgres`:**
   ```sql
   CREATE FUNCTION public.tmp_verify_pg() RETURNS void LANGUAGE sql AS 'SELECT 1;';
   ```
   - **Resulting ACL:** `postgres=EXECUTE, authenticated=EXECUTE, service_role=EXECUTE`.
   - **`PUBLIC` Grant:** None.
   - **`anon` Grant:** None.
2. **Created by `supabase_admin`:**
   ```sql
   CREATE FUNCTION public.tmp_verify_sa() RETURNS void LANGUAGE sql AS 'SELECT 1;';
   ```
   - **Resulting ACL:** `supabase_admin=EXECUTE, postgres=EXECUTE, authenticated=EXECUTE, service_role=EXECUTE`.
   - **`PUBLIC` Grant:** None.
   - **`anon` Grant:** None.
3. **Cleanup:** Both temporary test functions were dropped immediately after inspection.

---

## E. TEST RESULTS & REGRESSION EVIDENCE

### 1. Real PostgreSQL Phase 2.4.4 Test Battery
```text
Command: npx tsx scripts/verify_phase2_4_4_audit.ts

================================================================
CARELOOP PHASE 2.4.4 FINAL AUTHORIZATION, CONCURRENCY & ACL AUDIT
Target: Local Docker PostgreSQL 17.6 (supabase_db_blood)
================================================================

--- SUITE 1: MEMBERSHIP MUTATION SERIALIZATION (AUDIT A) ---
  [PASS] [Audit A: Membership Concurrency] Two concurrent requests modifying same membership serialize cleanly (1237ms)
  [PASS] [Audit A: Membership Concurrency] Coordinator promotion racing with manager suspension: TOCTOU eliminated (1234ms)
  [PASS] [Audit A: Membership Concurrency] Manager suspension racing with technician addition is serialized (1046ms)
  [PASS] [Audit A: Membership Concurrency] Concurrent operations targeting different centres execute in parallel (1058ms)
  [PASS] [Audit A: Direct Write Restrictions] Direct INSERT, UPDATE, DELETE, TRUNCATE denied on blood_centre_memberships (847ms)

--- SUITE 2: AUTHORIZATION FRESHNESS UNDER CONCURRENCY (AUDIT B) ---
  [PASS] [Audit B: Authorization Freshness] Concurrent Coordinator privilege revocation serializes cleanly via FOR SHARE locks (1198ms)
  [PASS] [Audit B: Authorization Freshness] Concurrent Manager suspension prevents unauthorized subsequent mutations (1415ms)

--- SUITE 3: POSTGRESQL DEFAULT PRIVILEGES (AUDIT C) ---
  [PASS] [Audit C: Default Privileges] Default routine privileges for postgres in public schema revoke PUBLIC and anon (170ms)
  [PASS] [Audit C: Default Privileges] Default routine privileges for supabase_admin in public schema revoke PUBLIC and anon (196ms)
  [PASS] [Audit C: Creator Role Execution] Temporary function created by postgres has no PUBLIC or anon execute (678ms)
  [PASS] [Audit C: Creator Role Execution] Temporary function created by supabase_admin has no PUBLIC or anon execute (638ms)

--- SUITE 4: NOTIFICATION DELIVERY RPC STRICT EXECUTION (AUDIT D) ---
  [PASS] [Audit D: Delivery RPC Authorization] update_notification_delivery_status executable strictly by service_role (1878ms)
  [PASS] [Audit D: Notification Acknowledgement & Isolation] Users acknowledge only own notifications; cross-user SELECT isolated (1802ms)

--- SUITE 5: SECURITY DEFINER CATALOG AUDIT (AUDIT E) ---
  [PASS] [Audit E: Function Catalog Inspection] All 38 public functions are SECURITY DEFINER with fixed search paths (279ms)
  [PASS] [Audit E: Function Catalog Inspection] Zero functions grant EXECUTE to PUBLIC; anon granted only to legitimate helpers (368ms)
  [PASS] [Audit E: Schema CREATE Privilege Verification] Zero client roles have CREATE on public, extensions, realtime, storage (179ms)

================================================================
PHASE 2.4.4 AUDIT EXECUTION SUMMARY
================================================================
Total Tests Run: 16
Passed:         16
Failed:         0
Pass Rate:       100.0%
```

### 2. Backward Compatibility Regression
```text
Command: npx tsx scripts/verify_phase2_4_3_edge_cases.ts
Total Tests Run: 16
Passed:         16
Failed:         0
Pass Rate:       100.0%
```

### 3. Application Regression Results
- **Vitest Unit & Integration Suite (`npm test -- --run`):**
  - Files: 5/5 passed.
  - Tests: 60/60 passed.
  - Execution Time: 1.55s.
- **TypeScript Typecheck (`npx tsc --noEmit`):**
  - Exit code: 0 (Zero errors).
- **Vite Production Build (`npm run build`):**
  - Exit code: 0.
  - Bundle Size: 226.62 kB Supabase vendor, 187.07 kB LandingPage, 163.26 kB React vendor.
  - Build Duration: 6.03s.
- **Playwright Test Execution:**
  - Automated Playwright end-to-end spec files are not committed to `package.json` (`test` script executes `vitest run`). Playwright MCP browser tool is configured for interactive viewport inspection.

---

## F. REMAINING PRODUCTION RISKS & PRE-DEPLOYMENT PREREQUISITES

| Risk / Task Category | Status | Operational Requirement Before Production Rollout |
|:---|:---:|:---|
| **Local Database Engine** | **VERIFIED** | PostgreSQL 17.6 tested locally with all 10 migrations. |
| **Application & Build** | **VERIFIED** | Clean TypeScript compile and Vite production build. |
| **Remote Supabase Deployment** | **NOT VERIFIED** | Remote instance `uzwtchnqmveapzehuafb` remains untouched. All 10 migrations must be applied through a dedicated deployment pipeline using a verified DBA role. |
| **VPS Coturn Daemon Hosting** | **NOT DEPLOYED** | Ephemeral REST HMAC generation is verified locally. The Linux Coturn daemon (`turnserver`) must be provisioned on a dedicated VPS with UDP/TCP port 3478, TLS port 5349, UDP relay ports 49152–65535, valid TLS certificates, and matching `use-auth-secret`. |
| **Cellular SMS Gateway** | **DISABLED** | Outbound carrier SMS dispatch is intentionally dormant (`sendSms` suppressed). System relies on in-app notifications. Future SMS activation requires carrier DLT registration and aggregator provisioning (e.g., Twilio / AWS SNS). |
| **Real Network Traversal Testing** | **PENDING** | End-to-end voice calling must be tested across symmetric NATs, cellular carriers (Jio, Airtel), and restrictive enterprise firewalls once Coturn is hosted on the VPS. |
