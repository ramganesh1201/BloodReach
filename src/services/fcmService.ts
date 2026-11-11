/**
 * CareLoop — Firebase Cloud Messaging (FCM) Web Push Service
 * 
 * Capabilities:
 * 1. Safe modular Firebase SDK initialization (v9+ / v13).
 * 2. Strict browser capability detection (Notification, ServiceWorker, PushManager, isSupported).
 * 3. User-gesture driven notification permission management.
 * 4. FCM token generation with Web Push VAPID key.
 * 5. Automatic registration of tokens into Supabase `public.device_tokens` table.
 * 6. Foreground push interception and in-app banner delivery.
 * 7. Secure logout cleanup removing registered tokens.
 * 8. Zero patient PII exposure in push payload notifications.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, deleteToken, isSupported, Messaging } from 'firebase/messaging';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { notificationService } from './notificationService';
import { PushPermissionStatus, PushNotificationState } from '../types';

export interface FirebaseWebConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
}

type PushStateListener = (state: PushNotificationState) => void;

class FcmService {
  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private currentToken: string | null = null;
  private currentUserId: string | null = null;
  private stateListeners: Set<PushStateListener> = new Set();
  private isCheckingSupport: boolean = false;
  private supportCached: boolean | null = null;

  private state: PushNotificationState = {
    isSupported: false,
    isConfigured: false,
    permission: 'default',
    token: null,
    loading: false,
    error: null,
  };

  constructor() {
    this.checkInitialState();
  }

  /**
   * Retrieves Firebase configuration from Vite environment variables
   */
  public getConfig(): FirebaseWebConfig {
    const env: Partial<ImportMetaEnv> = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      vapidKey: env.VITE_FIREBASE_VAPID_KEY,
    };
  }

  /**
   * Checks whether Firebase credentials have been configured with real non-placeholder values
   */
  public isFirebaseConfigured(): boolean {
    const cfg = this.getConfig();
    if (!cfg.apiKey || !cfg.projectId || !cfg.messagingSenderId || !cfg.appId) {
      return false;
    }
    // Check against placeholder tokens
    const placeholders = ['REPLACE_ME', 'placeholder', 'YOUR_API_KEY'];
    if (
      placeholders.includes(cfg.apiKey) ||
      placeholders.includes(cfg.projectId) ||
      placeholders.includes(cfg.messagingSenderId) ||
      placeholders.includes(cfg.appId)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Checks whether the current browser environment supports Push Notifications & Service Workers
   */
  public async isPushSupported(): Promise<boolean> {
    if (this.supportCached !== null) {
      return this.supportCached;
    }

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      this.supportCached = false;
      return false;
    }

    const hasBasicApis =
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;

    if (!hasBasicApis) {
      this.supportCached = false;
      return false;
    }

    try {
      const supported = await isSupported();
      this.supportCached = supported;
      return supported;
    } catch {
      this.supportCached = false;
      return false;
    }
  }

  /**
   * Initializes state and permission status
   */
  private async checkInitialState(): Promise<void> {
    const supported = await this.isPushSupported();
    const configured = this.isFirebaseConfigured();
    let permission: PushPermissionStatus = 'unsupported';

    if (!supported) {
      permission = 'unsupported';
    } else if (!configured) {
      permission = 'not_configured';
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      permission = Notification.permission as PushPermissionStatus;
    }

    this.updateState({
      isSupported: supported,
      isConfigured: configured,
      permission,
    });

    // If permission is already granted and configured, auto-refresh the token
    if (permission === 'granted' && configured && supported) {
      this.initMessagingInstance().then(() => {
        this.setupForegroundListener();
      }).catch(() => {});
    }
  }

  /**
   * Initializes Firebase app and messaging instance lazily
   */
  private async initMessagingInstance(): Promise<Messaging | null> {
    if (this.messaging) return this.messaging;

    const supported = await this.isPushSupported();
    if (!supported) return null;

    if (!this.isFirebaseConfigured()) return null;

    const cfg = this.getConfig();
    try {
      if (!getApps().length) {
        this.app = initializeApp({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain,
          projectId: cfg.projectId,
          storageBucket: cfg.storageBucket,
          messagingSenderId: cfg.messagingSenderId,
          appId: cfg.appId,
        });
      } else {
        this.app = getApp();
      }

      this.messaging = getMessaging(this.app);
      return this.messaging;
    } catch (err: any) {
      console.warn('[FcmService] Firebase messaging initialization failed:', err.message);
      return null;
    }
  }

  /**
   * Subscribes a listener to push notification state updates
   */
  public subscribeToPushState(listener: PushStateListener): () => void {
    this.stateListeners.add(listener);
    listener({ ...this.state });
    return () => this.stateListeners.delete(listener);
  }

  private updateState(partial: Partial<PushNotificationState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = { ...this.state };
    this.stateListeners.forEach((fn) => fn(snapshot));
  }

  public getState(): PushNotificationState {
    return { ...this.state };
  }

  /**
   * Request user permission and register device token
   * MANDATE: Must be invoked only in response to a user action (button tap / click).
   */
  public async requestPermissionAndGetToken(userId?: string): Promise<{
    success: boolean;
    status: PushPermissionStatus;
    token?: string;
    error?: string;
  }> {
    const supported = await this.isPushSupported();
    if (!supported) {
      this.updateState({ permission: 'unsupported', error: 'Push notifications are not supported in this browser.' });
      return { success: false, status: 'unsupported', error: 'Browser does not support Web Push notifications.' };
    }

    if (!this.isFirebaseConfigured()) {
      this.updateState({ permission: 'not_configured', error: 'Firebase configuration placeholders not configured.' });
      return {
        success: false,
        status: 'not_configured',
        error: 'Firebase Web Push is pending configuration in environment variables.',
      };
    }

    this.updateState({ loading: true, error: null });

    try {
      // 1. Request Browser Notification Permission via user prompt
      const rawPermission = await Notification.requestPermission();
      const permission = rawPermission as PushPermissionStatus;

      if (permission !== 'granted') {
        this.updateState({ permission, loading: false });
        return {
          success: false,
          status: permission,
          error: permission === 'denied'
            ? 'Notification permission was denied. Please allow notifications in your browser settings.'
            : 'Notification permission dismissed.',
        };
      }

      // 2. Initialize Messaging
      const messaging = await this.initMessagingInstance();
      if (!messaging) {
        throw new Error('Unable to initialize Firebase messaging instance.');
      }

      // 3. Register or verify Service Worker Registration
      let serviceWorkerRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        try {
          serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/',
          });
          await navigator.serviceWorker.ready;
        } catch (swErr) {
          console.warn('[FcmService] Service worker explicit registration deferred, relying on ready:', swErr);
          serviceWorkerRegistration = await navigator.serviceWorker.ready;
        }
      }

      // 4. Retrieve FCM Token with VAPID Key
      const cfg = this.getConfig();
      const vapidKey = cfg.vapidKey && cfg.vapidKey !== 'REPLACE_ME' ? cfg.vapidKey : undefined;

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration,
      });

      if (!token) {
        throw new Error('No FCM registration token returned by provider.');
      }

      this.currentToken = token;

      // 5. Resolve User Context and Save to Supabase `public.device_tokens`
      let resolvedUserId = userId || this.currentUserId;
      if (!resolvedUserId && isSupabaseConfigured) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user?.id) {
            resolvedUserId = sessionData.session.user.id;
          }
        } catch {
          // Non-blocking
        }
      }

      if (resolvedUserId && isSupabaseConfigured) {
        await this.syncTokenToDatabase(resolvedUserId, token);
      }

      // 6. Setup Foreground Message Listener
      this.setupForegroundListener();

      this.updateState({
        permission: 'granted',
        token,
        loading: false,
        error: null,
      });

      return {
        success: true,
        status: 'granted',
        token,
      };
    } catch (err: any) {
      console.error('[FcmService] Failed to obtain push token:', err);
      const errorMsg = err.message || 'Failed to activate push notifications.';
      this.updateState({ loading: false, error: errorMsg });
      return {
        success: false,
        status: 'denied',
        error: errorMsg,
      };
    }
  }

  /**
   * Persists device token into `public.device_tokens` using authenticated Supabase client
   */
  public async syncTokenToDatabase(userId: string, token: string): Promise<boolean> {
    if (!userId || !token || !isSupabaseConfigured) return false;

    this.currentUserId = userId;

    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : 'Browser Web';

      const { error } = await supabase.from('device_tokens').upsert(
        {
          user_id: userId,
          token,
          platform: 'web',
          user_agent: userAgent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

      if (error) {
        console.warn('[FcmService] Failed to record device token in database:', error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.warn('[FcmService] Database device token sync error:', err);
      return false;
    }
  }

  /**
   * Cleanly unregisters token from database and device upon user logout
   */
  public async unregisterDeviceToken(userId?: string): Promise<void> {
    const targetToken = this.currentToken;
    const targetUserId = userId || this.currentUserId;

    if (targetToken && isSupabaseConfigured) {
      try {
        let query = supabase.from('device_tokens').delete().eq('token', targetToken);
        if (targetUserId) {
          query = query.eq('user_id', targetUserId);
        }
        await query;
      } catch (err) {
        console.warn('[FcmService] Token cleanup error on database:', err);
      }
    }

    if (this.messaging && targetToken) {
      try {
        await deleteToken(this.messaging);
      } catch {
        // Non-blocking cleanup
      }
    }

    this.currentToken = null;
    this.currentUserId = null;
    this.updateState({ token: null });
  }

  /**
   * Listens for foreground FCM push notifications and displays them via CareLoop in-app system
   */
  public setupForegroundListener(customHandler?: (payload: any) => void): () => void {
    if (!this.messaging) return () => {};

    const unsubscribe = onMessage(this.messaging, (payload) => {
      console.info('[FcmService] Foreground message received:', payload);

      const title = payload.notification?.title || payload.data?.title || 'CareLoop Emergency Blood Alert';
      const content = payload.notification?.body || payload.data?.body || 'Urgent coordination alert received.';
      const requestId = payload.data?.requestId;

      // Integrate into CareLoop in-app notification drawer
      notificationService.sendInAppNotification({
        title,
        content,
        requestId,
        metadata: {
          ...(payload.data || {}),
          fcm_foreground: true,
          fcm_message_id: payload.messageId,
        },
      });

      if (customHandler) {
        customHandler(payload);
      }
    });

    return unsubscribe;
  }

  /**
   * Invokes backend Supabase Edge Function to dispatch push alerts to matched donor users
   * Non-blocking: failures or unconfigured state do not throw or impede core clinical workflows.
   */
  public async dispatchPushToMatchedDonors(options: {
    requestId: string;
    referenceCode: string;
    bloodGroup: string;
    component: string;
    hospitalName: string;
    city: string;
    recipientUserIds: string[];
  }): Promise<{ success: boolean; status?: string; error?: string }> {
    if (!options.recipientUserIds || options.recipientUserIds.length === 0) {
      return { success: true, status: 'NO_RECIPIENTS' };
    }

    if (!isSupabaseConfigured) {
      return { success: true, status: 'SKIPPED_OFFLINE' };
    }

    try {
      let authHeader = '';
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        authHeader = `Bearer ${sessionData.session.access_token}`;
      }

      const { data, error } = await supabase.functions.invoke('dispatch-push-notification', {
        headers: authHeader ? { Authorization: authHeader } : {},
        body: {
          requestId: options.requestId,
          recipientUserIds: options.recipientUserIds,
          title: `CareLoop Emergency Alert: ${options.bloodGroup} Needed`,
          body: `Urgent need for ${options.bloodGroup} (${options.component}) at ${options.hospitalName}, ${options.city}. Ref: ${options.referenceCode}.`,
          clickUrl: '/donor',
        },
      });

      if (error) {
        console.warn('[FcmService] Push dispatch invocation non-blocking notice:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true, status: data?.status || 'DISPATCHED' };
    } catch (err: any) {
      console.warn('[FcmService] Push dispatch non-blocking exception:', err);
      return { success: false, error: err.message };
    }
  }
}

export const fcmService = new FcmService();
