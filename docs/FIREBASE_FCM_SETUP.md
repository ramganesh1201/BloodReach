# CareLoop — Firebase Cloud Messaging (FCM) Setup & Operations Guide

This guide details the complete configuration, deployment, and testing lifecycle for Web Push Notifications in CareLoop using **Firebase Cloud Messaging (FCM) HTTP v1** and **Supabase Edge Functions**.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Browser ["Client Browser / PWA"]
        SW["firebase-messaging-sw.js"]
        UI["CareLoop Header / Notification Center"]
        FCM_CLIENT["fcmService.ts (Firebase Web SDK)"]
    end

    subgraph Supabase ["Supabase Backend"]
        REST["PostgREST (public.device_tokens)"]
        EDGE["Edge Function: dispatch-push-notification"]
        AUTH["Supabase Auth"]
    end

    subgraph Google ["Google Cloud / Firebase"]
        FCM_V1["FCM HTTP v1 API"]
        OAUTH["Google OAuth2 Token Service"]
    end

    UI -->|"1. Request Permission"| FCM_CLIENT
    FCM_CLIENT -->|"2. Fetch Web Token (VAPID)"| Google
    FCM_CLIENT -->|"3. Sync Token (RLS auth.uid())"| REST
    EDGE -->|"4. Resolve Device Tokens"| REST
    EDGE -->|"5. Generate RS256 JWT & OAuth2"| OAUTH
    EDGE -->|"6. Send Push (Non-PII Payload)"| FCM_V1
    FCM_V1 -->|"7. Deliver Push"| SW
    SW -->|"8. Display Notification"| UI
```

### Security & Privacy Tenets
1. **Zero Frontend Secrets**: Firebase service account private keys and client emails are **strictly server-side** in Supabase Edge Functions. Frontend only accesses public Web App config and VAPID public key.
2. **Zero PII in Push Payloads**: Emergency push notifications contain only non-sensitive clinical alerts (e.g. `Emergency Blood Request: O+ needed in Hyderabad`), never patient names, private medical details, or contact phone numbers.
3. **Database RLS Enforced**: Client devices can only write or delete their own tokens in `public.device_tokens` (`user_id = auth.uid()`).
4. **Token Resolution & Pruning**: Edge functions verify sender credentials and automatically remove `UNREGISTERED` or `INVALID_ARGUMENT` tokens from Supabase.

---

## 1. Firebase Console Configuration

### Step 1.1: Register Web Application
1. Open the [Firebase Console](https://console.firebase.google.com/) and select your project.
2. Click the **Settings gear** icon next to *Project Overview* -> **Project settings**.
3. Under the **General** tab, scroll to the **Your apps** section.
4. Click the **Web icon (`</>`)** to add a new web application:
   - App nickname: `CareLoop Web`
   - Check *Also set up Firebase Hosting* (optional, uncheck if using Vercel).
   - Click **Register app**.
5. Copy the `firebaseConfig` object values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

### Step 1.2: Generate Web Push (VAPID) Key Pair
1. In **Project settings**, navigate to the **Cloud Messaging** tab.
2. Scroll to the **Web configuration** section.
3. Under **Web Push certificates**, click **Generate key pair**.
4. Copy the generated **Key pair string** (this is your Public VAPID Key).

---

## 2. Firebase Service Account Setup (For Edge Functions)

CareLoop's backend dispatches notifications directly via the modern **FCM HTTP v1 API**, requiring a Google Service Account with OAuth2 token generation.

1. In the [Firebase Console](https://console.firebase.google.com/) -> **Project settings** -> **Service accounts** tab.
2. Ensure **Firebase Admin SDK** is selected.
3. Click **Generate new private key**, then click **Generate key** in the confirmation modal.
4. A `.json` file will be downloaded. Open it securely in a text editor to locate:
   - `project_id`
   - `client_email`
   - `private_key` (contains `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`)

> [!CAUTION]
> **NEVER commit the service account JSON or private key to Git.**
> Never prefix these variables with `VITE_` or expose them to the browser bundle.

---

## 3. Environment Configuration

### Step 3.1: Frontend Environment (.env.local & Vercel)

Add the public client configuration to your local `.env.local` or to the **Vercel Project Settings -> Environment Variables**:

```env
# Public Firebase Web App Configuration
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
VITE_FIREBASE_VAPID_KEY=BNx...your_public_vapid_key...
```

### Step 3.2: Supabase Edge Function Secrets

Configure the server-side secrets in your Supabase project using the Supabase CLI:

```bash
# Set Edge Function secrets
supabase secrets set \
  FIREBASE_PROJECT_ID="your-project-id" \
  FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com" \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

*Alternative (via Supabase Web Dashboard)*:
1. Open your Supabase Dashboard -> **Project Settings** -> **Edge Functions**.
2. Click **Add new secret**:
   - `FIREBASE_PROJECT_ID`: Your Firebase Project ID
   - `FIREBASE_CLIENT_EMAIL`: Your service account client email
   - `FIREBASE_PRIVATE_KEY`: Your service account private key (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)

---

## 4. Deploying the Supabase Edge Function

Deploy the `dispatch-push-notification` function to Supabase:

```bash
# Link to your project (if not already linked)
supabase link --project-ref uzwtchnqmveapzehuafb

# Deploy the function with standard JWT verification enabled
supabase functions deploy dispatch-push-notification
```

*(Note: JWT verification is enforced both by the Supabase Edge Runtime gateway and internally via `supabaseAdmin.auth.getUser()`, ensuring strict role verification and request ownership checks without security bypasses).*

---

## 5. Testing & Verification Procedures

### Step 5.1: Browser Push Permission & Token Registration
1. Start the local dev server (`npm run dev`) or access the deployed staging/production URL.
2. Log in as an authenticated user (Donor, Hospital, or Admin).
3. Open the **Notification Bell** in the top navigation header.
4. If push notifications are not yet enabled, you will see a banner:
   > *"Enable browser push notifications for real-time blood emergency alerts"*
5. Click **Enable Push Notifications**.
6. When prompted by the browser, click **Allow**.
7. Verify that:
   - Header status updates to **"Push Active"** (green badge).
   - The token is registered in Supabase `device_tokens` table:
     ```sql
     SELECT id, user_id, platform, created_at FROM public.device_tokens WHERE user_id = auth.uid();
     ```

### Step 5.2: Foreground Notification Verification
1. Keep the CareLoop tab open and active.
2. In another session (or via Supabase / Admin portal), create an emergency blood request matching the user's blood group and radius.
3. Observe:
   - Toast notification appears in CareLoop UI: *"New Emergency Blood Request"*.
   - Auditory alert chime triggers (if enabled).

### Step 5.3: Background / Service Worker Push Verification
1. Minimize the CareLoop browser window or switch to a different application tab.
2. Trigger an emergency blood request targeting the registered user.
3. Observe:
   - Operating system notification appears from the browser.
   - Title: `CareLoop Emergency Alert`
   - Body: `Urgent O+ blood needed at Apollo Hospital. Click to view details.`
   - Non-PII: No patient name or personal telephone numbers displayed.
4. Click the notification:
   - CareLoop tab is focused and navigates directly to the relevant request view.

### Step 5.4: Sign-Out / Token Cleanup Verification
1. Click **Log Out** in the user menu.
2. Observe in network console that `fcmService.unregisterDeviceToken` is invoked.
3. Verify that the token is deleted from `public.device_tokens` to prevent unauthorized notifications on shared computers.

---

## 6. Troubleshooting & Diagnostics

| Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| **"Push notifications blocked in browser"** | User previously clicked "Block" in browser permission prompt | Click the browser address bar lock/tune icon, reset Notification permission to "Ask" or "Allow", and reload the page. |
| **`messaging/invalid-vapid-key`** | The `VITE_FIREBASE_VAPID_KEY` does not match the Web Push certificate generated in Firebase Console | Verify key in Firebase Console -> Cloud Messaging -> Web Push certificates. Ensure no extra whitespace. |
| **`HTTP 401 Unauthorized` on Edge Function** | Missing or expired Supabase Auth bearer token | Ensure caller has an active Supabase session before invoking `dispatch-push-notification`. |
| **`PENDING_CONFIGURATION` logged by Edge Function** | Edge function secrets (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) not configured | Set secrets via `supabase secrets set` or the Supabase Project Dashboard. |
| **Service worker registration failure** | `firebase-messaging-sw.js` not found at domain root | Verify file exists in `public/firebase-messaging-sw.js` and is served as `/firebase-messaging-sw.js` with MIME type `application/javascript`. |
| **Tokens not persisting to `device_tokens`** | User is not authenticated or Supabase RLS policy issue | Ensure `auth.uid()` matches `user_id` when calling `syncTokenToDatabase`. Check table RLS policy. |

