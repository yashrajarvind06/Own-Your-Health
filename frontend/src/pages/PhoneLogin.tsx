// src/pages/PhoneLogin.tsx
// Standalone Phone OTP login page.
// Route: /login/phone
// This page uses Firebase Phone Authentication and does NOT interfere with the
// existing email/password login or backend JWT session.

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  setupRecaptcha,
  sendOTP,
  verifyOTP,
  getPhoneAuthErrorMessage,
} from "../auth/phoneAuth";
import type { ConfirmationResult } from "firebase/auth";

// ---------------------------------------------------------------------------
// Step type for the multi-step flow
// ---------------------------------------------------------------------------
type Step = "phone" | "otp" | "success";

export default function PhoneLogin() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialise reCAPTCHA once on mount
  useEffect(() => {
    setupRecaptcha("recaptcha-container");
    return () => {
      // cleanup
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Countdown timer after OTP sent
  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  // -------------------------------------------------------------------------
  // Step 1 — Send OTP
  // -------------------------------------------------------------------------
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation — ensure E.164 format hint
    const trimmed = phone.trim();
    if (!trimmed.startsWith("+")) {
      setError("Please include the country code, e.g. +919876543210");
      return;
    }

    setLoading(true);
    try {
      // Re-initialise reCAPTCHA in case the user retried
      setupRecaptcha("recaptcha-container");
      const result = await sendOTP(trimmed);
      setConfirmationResult(result);
      setStep("otp");
      startCountdown();
    } catch (err: any) {
      setError(getPhoneAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 2 — Verify OTP
  // -------------------------------------------------------------------------
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!confirmationResult) return;

    setLoading(true);
    try {
      const credential = await verifyOTP(confirmationResult, otp.trim());
      // Store Firebase UID — your backend can later verify this via Firebase Admin SDK
      localStorage.setItem("firebase_uid", credential.user.uid);
      localStorage.setItem("firebase_phone", credential.user.phoneNumber ?? "");
      setStep("success");
    } catch (err: any) {
      setError(getPhoneAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Resend OTP
  // -------------------------------------------------------------------------
  const handleResend = async () => {
    setError(null);
    setOtp("");
    setLoading(true);
    try {
      setupRecaptcha("recaptcha-container");
      const result = await sendOTP(phone.trim());
      setConfirmationResult(result);
      startCountdown();
    } catch (err: any) {
      setError(getPhoneAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Shared UI helpers
  // -------------------------------------------------------------------------
  const inputClass =
    "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/70 text-gray-900 " +
    "placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 " +
    "focus:border-transparent transition-all text-sm";

  const btnClass =
    "w-full py-3 rounded-xl font-semibold text-white text-sm transition-all " +
    "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 " +
    "disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 hover:scale-[1.01]";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-200px)] px-4">
      {/* Hidden reCAPTCHA container — MUST be in the DOM */}
      <div id="recaptcha-container" />

      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-blue-100/50 border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📱</span>
              <h1 className="text-xl font-bold tracking-tight">Phone Login</h1>
            </div>
            <p className="text-blue-100 text-sm">
              {step === "phone" && "Enter your phone number to receive an OTP"}
              {step === "otp" && `OTP sent to ${phone}`}
              {step === "success" && "You're verified!"}
            </p>
          </div>

          <div className="px-8 py-7">
            {/* ----------------------------------------------------------------
                Error banner
            ---------------------------------------------------------------- */}
            {error && (
              <div className="mb-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
                <span className="mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* ----------------------------------------------------------------
                STEP 1: Phone number input
            ---------------------------------------------------------------- */}
            {step === "phone" && (
              <form onSubmit={handleSendOTP} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Phone Number
                  </label>
                  <input
                    id="phone-input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+919876543210"
                    className={inputClass}
                    required
                    autoComplete="tel"
                    autoFocus
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    Include country code (e.g. +91 for India)
                  </p>
                </div>

                <button
                  id="send-otp-btn"
                  type="submit"
                  disabled={loading}
                  className={btnClass}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Sending OTP…
                    </span>
                  ) : (
                    "Send OTP"
                  )}
                </button>
              </form>
            )}

            {/* ----------------------------------------------------------------
                STEP 2: OTP verification
            ---------------------------------------------------------------- */}
            {step === "otp" && (
              <form onSubmit={handleVerifyOTP} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    One-Time Password
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/, ""))}
                    placeholder="6-digit OTP"
                    className={`${inputClass} text-center text-xl tracking-[0.4em] font-mono`}
                    required
                    autoFocus
                  />
                </div>

                <button
                  id="verify-otp-btn"
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className={btnClass}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Verifying…
                    </span>
                  ) : (
                    "Verify OTP"
                  )}
                </button>

                {/* Resend */}
                <div className="text-center text-sm text-gray-500">
                  {countdown > 0 ? (
                    <span>Resend OTP in <strong>{countdown}s</strong></span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
                    >
                      Resend OTP
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => { setStep("phone"); setError(null); setOtp(""); }}
                  className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Change phone number
                </button>
              </form>
            )}

            {/* ----------------------------------------------------------------
                STEP 3: Success
            ---------------------------------------------------------------- */}
            {step === "success" && (
              <div className="text-center space-y-5 py-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">
                  ✅
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Phone Verified!</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Your number <strong>{phone}</strong> has been authenticated via Firebase.
                  </p>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 text-left">
                  <strong>Firebase UID saved.</strong> Your backend can verify this token
                  using Firebase Admin SDK to issue a session.
                </div>
                <Link
                  to="/login"
                  className="inline-block w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600
                    text-white font-semibold text-sm text-center shadow-lg shadow-blue-500/20 hover:scale-[1.01] transition-all"
                >
                  Go to Email Login
                </Link>
              </div>
            )}

            {/* Footer link */}
            {step !== "success" && (
              <p className="mt-6 text-center text-sm text-gray-500">
                Back to{" "}
                <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
                  Email Login
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
