import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { smsNotificationService, ResponseTokenPayload } from '../services/smsNotificationService';
import {
  Heart,
  ShieldCheck,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  Droplet,
  ArrowRight,
  MessageSquare,
  Lock,
} from 'lucide-react';

export const SmsResponseView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [tokenData, setTokenData] = useState<ResponseTokenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<{
    success: boolean;
    action: 'ACCEPTED' | 'DECLINED';
    message: string;
    conversationId?: string;
  } | null>(null);
  const [declineReason, setDeclineReason] = useState<string>('');
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    const resolved = smsNotificationService.resolveToken(token);
    setTokenData(resolved);
    setLoading(false);
  }, [token]);

  const handleAccept = async () => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const res = await smsNotificationService.processTokenResponse(token, 'ACCEPT');
      setActionResult(res);
      const updated = smsNotificationService.resolveToken(token);
      setTokenData(updated);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async (reason?: string) => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const chosenReason = reason || declineReason || 'Temporarily unavailable';
      const res = await smsNotificationService.processTokenResponse(token, 'DECLINE', chosenReason);
      setActionResult(res);
      const updated = smsNotificationService.resolveToken(token);
      setTokenData(updated);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-app-text-secondary text-sm">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span>Verifying emergency response token...</span>
        </div>
      </div>
    );
  }

  // Case 1: Invalid or Missing Token
  if (!tokenData) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-app-surface border border-app-border rounded-2xl shadow-subtle p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emergency-light border border-emergency-border text-emergency mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-app-text font-display">
            Invalid or Expired Link
          </h2>
          <p className="text-xs text-app-text-secondary leading-relaxed">
            This emergency alert link could not be verified. It may have been typed incorrectly or previously revoked.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors"
            >
              Return to CareLoop
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Action already taken or just taken
  if (actionResult || tokenData.status === 'USED') {
    const isAccepted =
      actionResult?.action === 'ACCEPTED' || tokenData.actionTaken === 'ACCEPTED';

    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-app-surface border border-app-border rounded-2xl shadow-subtle p-6 sm:p-8 space-y-6 animate-fade-in">
          <div className="text-center space-y-3">
            <div
              className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center ${
                isAccepted
                  ? 'bg-success-light border border-success-border text-success'
                  : 'bg-app-muted border border-app-border text-app-text-secondary'
              }`}
            >
              {isAccepted ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
            </div>

            <h2 className="text-xl font-bold text-app-text font-display">
              {isAccepted ? 'Response Confirmed — Thank You!' : 'Response Recorded'}
            </h2>
            <p className="text-xs text-app-text-secondary leading-relaxed">
              {actionResult?.message ||
                (isAccepted
                  ? `Your acceptance for emergency request ${tokenData.referenceCode} has been recorded.`
                  : `You declined emergency request ${tokenData.referenceCode}. We will notify other compatible donors.`)}
            </p>
          </div>

          {/* Hospital Directions and Next Steps if Accepted */}
          {isAccepted && (
            <div className="p-4 rounded-xl bg-app-muted/30 border border-app-border space-y-3 text-xs">
              <div className="flex items-center gap-2 text-brand font-bold">
                <Building2 className="w-4 h-4 shrink-0" />
                <span>Reporting Location:</span>
              </div>
              <div className="pl-6 space-y-1">
                <p className="font-bold text-app-text">{tokenData.hospitalName}</p>
                <p className="text-app-text-secondary">{tokenData.hospitalAddress || tokenData.city}</p>
              </div>

              <div className="pt-2 border-t border-app-border flex items-center justify-between text-[11px] text-app-text-secondary">
                <span>Ref Code: <strong className="text-app-text font-mono">{tokenData.referenceCode}</strong></span>
                <span>Component: <strong className="text-brand">{tokenData.component}</strong></span>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {isAccepted && (
              <button
                type="button"
                onClick={() => navigate('/communication')}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand text-white text-xs font-bold shadow-subtle hover:bg-brand-dark transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open Secure Coordination Chat</span>
              </button>
            )}
            <Link
              to="/"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-app-border bg-app-surface text-app-text text-xs font-semibold hover:bg-app-muted transition-colors"
            >
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Expired Token
  if (tokenData.status === 'EXPIRED') {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-app-surface border border-app-border rounded-2xl shadow-subtle p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-warning-light border border-warning-border text-warning-dark mx-auto flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-app-text font-display">
            Emergency Alert Expired
          </h2>
          <p className="text-xs text-app-text-secondary leading-relaxed">
            This emergency alert for <strong>{tokenData.referenceCode}</strong> has expired. Thank you for your dedication to life-saving blood donation.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors"
            >
              Return to CareLoop
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 4: Active Token — Show Emergency Details & One-Click Accept/Decline
  const isCritical = tokenData.urgency === 'Critical';

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-lg w-full bg-app-surface border border-app-border rounded-2xl shadow-subtle overflow-hidden animate-fade-in space-y-0">
        {/* Header Banner */}
        <div
          className={`p-5 sm:p-6 text-white ${
            isCritical ? 'bg-emergency' : 'bg-brand'
          } relative overflow-hidden`}
        >
          <div className="flex items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                {tokenData.urgency} Blood Emergency
              </span>
            </div>
            <span className="text-[11px] font-mono opacity-90">Ref: {tokenData.referenceCode}</span>
          </div>

          <div className="mt-3 relative z-10">
            <h1 className="text-xl sm:text-2xl font-black font-display tracking-tight">
              Compatible Donor Needed
            </h1>
            <p className="text-xs text-white/80 mt-1">
              Your registered blood group matches this immediate transfusion need.
            </p>
          </div>
        </div>

        {/* Clinical Request Specs */}
        <div className="p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/30">
              <span className="text-[10px] uppercase font-bold text-app-text-secondary tracking-wider block">
                Required Blood Group
              </span>
              <span className="text-2xl font-extrabold text-brand font-display mt-0.5 block">
                {tokenData.bloodGroup}
              </span>
              <span className="text-[11px] text-app-text-secondary font-medium">
                {tokenData.component}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/30">
              <span className="text-[10px] uppercase font-bold text-app-text-secondary tracking-wider block">
                Units Needed
              </span>
              <span className="text-2xl font-extrabold text-app-text font-display mt-0.5 block">
                {tokenData.unitsNeeded} {tokenData.unitsNeeded === 1 ? 'Unit' : 'Units'}
              </span>
              <span className="text-[11px] text-app-text-secondary font-medium">
                Hospital Transfusion
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-app-border bg-app-muted/20 space-y-2 text-xs">
            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-app-text">{tokenData.hospitalName}</p>
                <p className="text-app-text-secondary text-[11px] mt-0.5">
                  {tokenData.hospitalAddress || tokenData.city}
                </p>
              </div>
            </div>
          </div>

          {/* Privacy & Clinical Assurance */}
          <div className="p-3 rounded-lg bg-info-light border border-info-border text-info text-[11px] flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Healthcare Privacy:</strong> Patient personal identifiers are kept private. Accepting will activate a secure, encrypted one-to-one coordination channel with hospital personnel.
            </span>
          </div>

          {/* Response Actions */}
          {!showDeclineForm ? (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-success text-white text-xs font-bold shadow-subtle hover:bg-success/90 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Confirming Acceptance...' : 'Accept Emergency Call (I Can Donate)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeclineForm(true)}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-app-border bg-app-surface text-app-text-secondary hover:text-app-text text-xs font-semibold hover:bg-app-muted transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>I Am Unavailable Right Now</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-xl border border-app-border bg-app-muted/30 animate-fade-in text-xs">
              <span className="font-bold text-app-text block">
                Let us know why (Optional):
              </span>
              <div className="grid grid-cols-2 gap-2">
                {['At work / Busy', 'Recently donated', 'Feeling unwell', 'Out of town'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleDecline(r)}
                    className="p-2 rounded-lg border border-app-border bg-app-surface text-[11px] font-medium text-app-text hover:border-brand hover:text-brand transition-colors text-left"
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleDecline()}
                  disabled={submitting}
                  className="flex-1 py-2 px-3 rounded-lg bg-emergency text-white text-xs font-bold hover:bg-emergency-dark transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Confirm Decline'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeclineForm(false)}
                  className="py-2 px-3 rounded-lg border border-app-border text-app-text-secondary text-xs hover:bg-app-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
