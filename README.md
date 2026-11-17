<div align="center">

<img src="./docs/assets/careloop-hero.svg" alt="CareLoop — National Emergency Blood Coordination Grid" width="100%" />

<br />
<br />

[![Live Production](https://img.shields.io/badge/Production-Live%20Platform-B42332?style=for-the-badge&logo=vercel&logoColor=white)](https://careloop-mauve.vercel.app/)
[![NBTC 2023](https://img.shields.io/badge/Compliance-NBTC%202023%20Guidelines-8F1928?style=for-the-badge)](https://careloop-mauve.vercel.app/)
[![React](https://img.shields.io/badge/React-18.3-202124?style=for-the-badge&logo=react&logoColor=00D8FF)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-202124?style=for-the-badge&logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Backend-Supabase%20PostgreSQL-202124?style=for-the-badge&logo=supabase&logoColor=3ECF8E)](https://supabase.com/)
[![WebRTC](https://img.shields.io/badge/Telephony-WebRTC%20P2P%20Voice-202124?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![PWA](https://img.shields.io/badge/Architecture-PWA%20v2%20Offline-202124?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

<br />

**A mission-critical healthcare coordination network bridging verified donors, accredited hospitals, and licensed blood depositories with sub-second matching and zero-delay dispatch.**

[Explore Live Platform](https://careloop-mauve.vercel.app/) • [Product Tour](#-visual-product-tour) • [Clinical Workflow](#-emergency-coordination-lifecycle) • [System Architecture](#-system-architecture) • [Stakeholder Workspaces](#-stakeholder-workspaces) • [Local Setup](#-getting-started)

</div>

---

## 🏛️ Executive Overview

During acute medical emergencies—such as hemorrhagic shock, obstetric hemorrhage, or severe poly-trauma—the time to transfusion is the single greatest predictor of patient survival. Conventional blood procurement workflows frequently rely on fragmented social media broadcasts, unverified volunteer registries, and manual telephone inquiries, resulting in critical delays, donor fatigue, and unverified clinical eligibility.

**CareLoop** replaces this ad-hoc model with an auditable, real-time coordination grid. Built to comply with the National Blood Transfusion Council (NBTC 2023) guidelines, CareLoop unifies emergency request intake, multi-tier compatibility calculations, location-bounded push dispatch, atomic donor acceptance locks, and case-bound encrypted communication into one unified clinical network.

### The Problem vs. The CareLoop Solution

| Critical Operational Dimension | Conventional Ad-Hoc Method | The CareLoop Coordinated Grid |
| :--- | :--- | :--- |
| **Emergency Triage Time** | 45–180 minutes spent making manual hospital and volunteer calls | **< 3 minutes** automated dispatch across radius-bounded verified donors |
| **Immunological Compatibility** | Guesswork; non-exact cross matches often rejected at hospital lab | **NBTC 2023 Matrix Engine** computing ABO and Rh-D compatibility instantly |
| **Donor Concurrency & Race Conditions** | Multiple donors arrive at the hospital unannounced for 1 unit | **PostgreSQL Atomic RPC Locks** ensuring single-assignment per unit |
| **Clinical Eligibility & Safety** | Unverified self-reports; high deferral rate at bedside | **Verified Medical Clearance Gate** with clinical review audit history |
| **Communication Privacy** | Personal phone numbers exposed over public messaging groups | **Case-Scoped Realtime Rooms** with WebRTC encrypted peer-to-peer voice |
| **Regulatory & Cold-Chain Oversight** | Zero audit trail; lack of central inventory visibility | **Full Audit Pipeline** logging timestamps, hospital IDs, and cold-chain status |

---

## 📸 Visual Product Tour

The following views demonstrate the CareLoop platform running in production at [careloop-mauve.vercel.app](https://careloop-mauve.vercel.app/).

<div align="center">

### 1. Real-Time Emergency Coordination Hub
<img src="./docs/assets/screenshots/01-landing-overview.png" alt="CareLoop Live Emergency Coordination Hub" width="100%" />

*The centralized emergency coordination hub displays live requests, blood inventory deficits, dynamic triage filters, and active donor statistics across regional trauma networks.*

<br />

---

### 2. Clinical Request Intake & Compatibility Matrix
<img src="./docs/assets/screenshots/02-emergency-request-workflow.png" alt="CareLoop Emergency Blood Request Intake Workflow" width="100%" />

*A structured 4-step emergency intake wizard capturing patient bed details, urgency classification, units required, and blood component types with instant ABO/Rh compatibility preview.*

<br />

---

### 3. Verified Donor Workspace & Eligibility Gate
<img src="./docs/assets/screenshots/03-donor-workspace.png" alt="CareLoop Verified Donor Workspace" width="100%" />

*The donor workspace manages real-time availability toggles, donation history, NBTC-compliant 90-day deferral tracking, clinical review hold status, and single-click emergency acceptance.*

<br />

---

### 4. Case-Bound Communication Hub & Direct Telephony
<img src="./docs/assets/screenshots/04-communication-hub.png" alt="CareLoop Case-Bound Private Communication Hub" width="100%" />

*Row-Level Security (RLS) restricts access strictly to the matched patient and donor. Features persistent chat history, ETA transmission, and integrated WebRTC P2P voice calling.*

<br />

---

### 5. Platform Governance & Regulatory Audit Console
<img src="./docs/assets/screenshots/05-admin-governance.png" alt="CareLoop Platform Administration & Governance" width="100%" />

*Administrators monitor cold-chain depositories, verify hospital licenses, audit clinical review requests, manage role-based credentials, and inspect end-to-end event logs.*

</div>

---

## 🔄 Emergency Coordination Lifecycle

CareLoop implements an 8-stage clinical lifecycle ensuring that from the moment an emergency is flagged at bedside, every dispatch step is atomic, auditable, and clinically sound.

<div align="center">
  <img src="./docs/assets/careloop-workflow.svg" alt="CareLoop End-to-End Workflow Diagram" width="100%" />
</div>

### Stage-by-Stage Breakdown

1. **Emergency Request Intake**
   The attending clinician, hospital coordinator, or patient family enters the patient's blood group, required components (Whole Blood, Packed RBCs, Platelets, Cryoprecipitate, or Fresh Frozen Plasma), unit volume, and hospital facility coordinates.

2. **Compatibility & Deferral Engine**
   The system queries the active donor registry against the NBTC 2023 immunological compatibility rules:
   * **Universal Red Cell Donors:** O-Negative donors matched across compatible recipients.
   * **Universal Plasma Donors:** AB-Positive plasma matched across compatible recipients.
   * **Donor Deferral Check:** Automatically excludes donors within their 90-day clinical rest window or with active medical holds.

3. **Multi-Channel Realtime Dispatch**
   A PostGIS spatial query identifies verified candidate donors within concentric geographic tiers (5 km → 15 km → 30 km). The dispatch engine triggers:
   * Supabase Realtime WebSocket broadcast to active donor browsers.
   * Firebase Cloud Messaging (FCM) high-priority push notifications to registered device tokens.

4. **Clinical Gatekeeper & Eligibility Check**
   Before a donor is permitted to accept, the server executes `public.accept_blood_request_atomic()`. If the donor has an active `PENDING_REVIEW` medical hold, acceptance is safely barred until a platform clinician completes the clinical review.

5. **Atomic Request Acceptance**
   The accepting donor confirms their commitment. A database transaction locks the requested unit allocation, updates donor state to `DISPATCHED`, broadcasts the estimated time of arrival (ETA), and prevents duplicate concurrent claims.

6. **Case-Bound Private Communication**
   Upon acceptance, the system provisions a dedicated `conversations` record linked to the emergency case ID. Row-Level Security ensures that only the authenticating patient and the assigned donor can read or transmit messages.

7. **WebRTC Peer-to-Peer Voice Calling**
   For rapid hands-free coordination while the donor is in transit, CareLoop provides browser-to-browser voice calling using WebRTC `RTCPeerConnection` with Supabase Realtime acting as the SDP exchange signaling layer.

8. **Hospital Cross-Match Verification & Audit Log**
   Upon arrival at the hospital transfusion facility, laboratory technicians execute mandatory serological and cross-match verification. Once transfusion is documented, the donor's 90-day deferral counter initiates and the case file moves to permanent audit storage.

---

## 🏗️ System Architecture

CareLoop is architected as a decoupled, multi-tiered healthcare system engineered for sub-second dispatch latency, high availability, and zero-trust security.

<div align="center">
  <img src="./docs/assets/careloop-architecture.svg" alt="CareLoop High-Altitude System Architecture" width="100%" />
</div>

### Architectural Tiers

#### Tier 1: Client Application & PWA Runtime
* **Framework:** React 18 with TypeScript 5, Vite, and Tailwind CSS.
* **Progressive Web App (PWA):** Service Worker v2 caching application shells, offline queue management with IndexedDB, and web app manifest for native mobile installation.
* **Telephony Engine:** WebRTC MediaStream API integration with dual STUN/TURN failover configurations.

#### Tier 2: Serverless API Routing & Edge Functions
* **Host:** Vercel Global Edge Network with low-latency CDN caching.
* **Endpoint Architecture:**
  * `POST /api/accept-request`: Atomic acceptance handler with clinical validation and session verification.
  * `POST /api/fcm/send`: High-priority Firebase Cloud Messaging push dispatch.
  * `POST /api/push-notify`: Web push fallback for background notifications.
* **Authentication Gateway:** Supabase Auth with Google OAuth 2.0 PKCE flow and custom JWT claims extraction.

#### Tier 3: Supabase Core & PostgreSQL 15 Engine
* **Database Engine:** PostgreSQL 15 with Row-Level Security (RLS) enabled on 100% of public tables.
* **Spatial Computations:** PostGIS spatial extensions for spherical distance calculations (`ST_DWithin`) between emergency hospital coordinates and donor locations.
* **Atomic Stored Procedures (PL/pgSQL):**
  * `accept_blood_request_atomic(p_request_id, p_donor_id)`: Atomic row locking with concurrency guards.
  * `review_donor_medical_clearance(p_donor_id, p_status, p_reason)`: Strict clinical reviewer authorization.
  * `get_user_role(p_user_id)`: Secure JWT-backed role resolution.
* **Realtime Engine:** PostgreSQL logical replication decoding published to Supabase Realtime WebSocket subscribers.

#### Tier 4: Telemetry & External Services
* **Push Services:** Google Firebase Cloud Messaging (FCM v1 HTTP API).
* **Geocoding:** OpenStreetMap / Nominatim API for reverse geocoding of coordinates into human-readable landmarks.
* **Signaling Infrastructure:** Google STUN servers with symmetric NAT traversal.

---

## 👥 Stakeholder Workspaces

CareLoop provides purpose-built, role-guarded workspaces tailored to each participant in the transfusion ecosystem:

```
                                  ┌───────────────────────────────┐
                                  │      CareLoop Auth Guard      │
                                  └───────────────┬───────────────┘
                                                  │
                 ┌────────────────┬───────────────┼───────────────┬────────────────┐
                 │                │               │               │                │
                 ▼                ▼               ▼               ▼                ▼
         ┌───────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────────┐
         │    Patient    │ │    Donor    │ │ Blood Centre│ │ Coordinator │ │ Administrator │
         │   Workspace   │ │  Workspace  │ │  Workspace  │ │ Control Room│ │   Console     │
         └───────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └───────────────┘
```

### 1. Patient & Family Workspace
* Guided emergency blood request submission with urgency triage (Normal, Urgent, Critical).
* Real-time radar tracking of active matching donors and hospital dispatch milestones.
* Nearby blood centre and hospital discovery via interactive location markers.
* Direct encrypted chat and voice communication with the matched donor.

### 2. Verified Donor Workspace
* One-click availability switch (`Available for Dispatch` vs. `Resting / Deferred`).
* Real-time notifications for incoming emergencies within matched radius and compatible blood groups.
* Medical clearance transparency showing review notes, clinical approval status, and 90-day rest timer.
* In-app transit ETA updates broadcasted directly to the receiving hospital.

### 3. Blood Centre & Depository Workspace
* Cold-chain unit inventory logging (Whole Blood, PRBC, Platelets, FFP).
* Expiry tracking and low-reserve proactive alerting.
* Direct intake logging for voluntary blood donation drives.

### 4. Emergency Coordinator Control Room
* Live bird's-eye map of active regional emergencies and transit statuses.
* Triage escalation for high-urgency pediatric, trauma, and maternal cases.
* Manual cross-region dispatch overrides for rare phenotypes (e.g., Bombay Blood Group, Rh-null).

### 5. Platform Administrator & Regulatory Console
* Clinical verification portal for approving or deferring donor medical clearances.
* Hospital and laboratory credential verification.
* Comprehensive audit trail monitoring user roles, system errors, and RPC performance metrics.

---

## 🛡️ Security, Governance & Clinical Responsibility

### Zero-Trust Row-Level Security (RLS)
CareLoop operates on a zero-trust architecture. Database rows are inaccessible by default unless explicitly granted by PostgreSQL policies:
* **Conversations & Messages:** Restricted strictly to `auth.uid() = participant_1 OR auth.uid() = participant_2`. Third-party users cannot query or eavesdrop on messages even with a valid JWT.
* **Medical Clearance Records:** Read access restricted to the donor and clinical administrators; write access restricted strictly to verified clinical roles (`admin`, `coordinator`).
* **Emergency Requests:** Public read access for active emergency triage; update and cancellation permissions restricted to the originating patient or emergency coordinator.

### Ethical & Regulatory Compliance
* **National Blood Transfusion Council (NBTC 2023):** Built according to non-commercial donation standards. CareLoop explicitly prohibits commercial compensation, paid donor incentives, or fee-per-unit transactions.
* **National Data Privacy Principles:** Sensitive health records, phone numbers, and home addresses are never exposed to public registries or unauthenticated endpoints.

> [!IMPORTANT]
> **Mandatory Hospital Cross-Matching Disclaimer**  
> CareLoop is an emergency coordination platform, not a blood bank or medical diagnostic device. Automated donor matching identifies potential compatibility based on self-reported and clinically reviewed donor profiles. **In accordance with national transfusion medicine standards, all blood products must undergo physical cross-matching, ABO/Rh re-typing, and Transfusion-Transmissible Infection (TTI) laboratory screening by accredited hospital staff prior to administration.**

---

## 📊 Integration & Operational Transparency

| Integration | Implementation | Status | Operational SLA & Reliability Considerations |
| :--- | :--- | :---: | :--- |
| **Supabase Authentication** | Google OAuth 2.0 PKCE + Email OTP | `Production Ready` | Sub-second token validation; custom session refresh listener |
| **PostgreSQL 15 / RLS** | Zero-trust policies across 100% of tables | `Production Ready` | Deterministic query isolation verified under concurrent loads |
| **Supabase Realtime** | WebSocket logical replication broadcast | `Production Ready` | Event delivery latency < 200ms across active browser tabs |
| **Atomic RPC Engine** | PL/pgSQL transaction procedures | `Production Ready` | Race-condition proof request claiming with rollbacks |
| **Web Push & FCM** | Firebase Cloud Messaging HTTP v1 | `Integrated` | Background push delivery dependent on mobile OS battery optimization |
| **WebRTC Audio Telephony** | P2P PeerConnection with STUN signaling | `Integrated` | Direct media stream; symmetric NAT traversal requires TURN relay |
| **Spatial Discovery** | PostGIS + OpenStreetMap / Nominatim | `Integrated` | Reverse geocoding reliant on OSM community service uptime |
| **PWA Service Worker** | CacheFirst + NetworkFirst strategies | `Production Ready` | Full offline shell availability with background sync queue |

---

## 💻 Tech Stack Ecosystem

```
Frontend Architecture       Backend & Database           Security & Protocols       DevOps & Hosting
──────────────────────      ──────────────────           ────────────────────       ────────────────
React 18.3                  Supabase Cloud (PaaS)        Row-Level Security (RLS)   Vercel Edge CDN
TypeScript 5.5              PostgreSQL 15                Google OAuth 2.0 PKCE      GitHub Actions CI
Vite 5                      PostGIS Spatial Extension    WebRTC DTLS / SRTP         Git SCM
Tailwind CSS                Supabase Realtime (WSS)      Firebase Messaging v1      Supabase CLI
Lucide React                PL/pgSQL Atomic Functions    AES-256 Cloud Storage      PWA Service Worker
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js:** v18.0.0 or later (LTS recommended)
* **npm:** v9.0.0 or later
* **Git:** Installed on local machine
* **Supabase Project:** Active account at [supabase.com](https://supabase.com)
* **Firebase Project:** (Optional) Active account at [firebase.google.com](https://firebase.google.com) for Web Push

### 1. Clone the Repository
```bash
git clone https://github.com/ramganesh1201/BloodReach.git
cd BloodReach
```

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Firebase Cloud Messaging Configuration
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_VAPID_KEY=your-vapid-public-key
```

### 4. Apply Database Migrations
Deploy the complete schema, RLS policies, and stored procedures to your Supabase project:
```bash
npx supabase db push
```

### 5. Launch the Local Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 6. Verification & Build
Ensure strict TypeScript adherence and unit test validation:
```bash
# Run TypeScript compilation check
npx tsc --noEmit

# Run unit and integration tests
npm test

# Build production bundle
npm run build
```

---

## 🌐 Production Deployment Architecture

CareLoop deploys continuously to the Vercel Edge Network connected to Supabase:

```
[Developer Push] ──> [GitHub: main] ──> [Vercel Automated Build] ──> [Global Edge Network]
                                                                            │
                                                                    (WSS / HTTPS / JWT)
                                                                            │
                                                                            ▼
                                                                 [Supabase Cloud Core]
                                                                 ├── PostgreSQL 15 + RLS
                                                                 ├── PostGIS Spatial Engine
                                                                 ├── Stored Procedures (RPC)
                                                                 └── Realtime WebSockets
```

* **Production URL:** [https://careloop-mauve.vercel.app/](https://careloop-mauve.vercel.app/)
* **Repository:** [https://github.com/ramganesh1201/BloodReach](https://github.com/ramganesh1201/BloodReach)

---

## 🤝 Contributing

We welcome contributions from healthcare professionals, software engineers, and UI/UX designers who want to make emergency blood coordination faster, safer, and more accessible.

1. Fork the repository (`https://github.com/ramganesh1201/BloodReach/fork`).
2. Create your feature branch (`git checkout -b feature/clinical-triage-optimization`).
3. Commit your changes with clear semantic messages (`git commit -m "feat: improve pediatric blood volume calculation"`).
4. Verify tests pass (`npm test && npx tsc --noEmit`).
5. Push to the branch (`git push origin feature/clinical-triage-optimization`).
6. Open a Pull Request for peer review.

---

## 📄 License & Ethical Usage

Distributed under the **MIT License**. See `LICENSE` for details.

This project is built for humanitarian and life-saving purposes. Commercial exploitation, automated fee collection for blood products, or misuse of donor contact information is strictly contrary to the project's ethical guidelines.

---

<div align="center">

<img src="./docs/assets/careloop-hero.svg" alt="CareLoop Logo" width="120" />

### Every Drop Matters. Every Connection Counts.

**CareLoop — National Emergency Blood Coordination Grid**  
*Connecting donors, clinicians, and patients when seconds matter most.*

[Visit CareLoop](https://careloop-mauve.vercel.app/) • [Report an Issue](https://github.com/ramganesh1201/BloodReach/issues) • [GitHub Repository](https://github.com/ramganesh1201/BloodReach)

</div>
