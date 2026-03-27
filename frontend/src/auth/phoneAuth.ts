// src/auth/phoneAuth.ts
// Firebase Phone Authentication helpers.
// Usage:
//   1. Call setupRecaptcha("recaptcha-container") once on mount.
//   2. Call sendOTP("+91XXXXXXXXXX") on form submit → get confirmationResult.
//   3. Call verifyOTP(confirmationResult, "123456") with the code the user typed.

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  UserCredential,
} from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";

// Store the verifier instance so we can re-use / clear it
let recaptchaVerifier: RecaptchaVerifier | null = null;

/**
 * Initialises an invisible reCAPTCHA verifier and attaches it to the given
 * DOM container id.  Only call this ONCE per page load.
 *
 * @param containerId - id of the <div> that will hold the reCAPTCHA widget
 */
export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  // Clear any stale verifier from a previous render (important for React HMR)
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible", // invisible reCAPTCHA — no user interaction needed
    callback: () => {
      // reCAPTCHA solved automatically; sendOTP continues
      console.log("reCAPTCHA verified");
    },
    "expired-callback": () => {
      console.warn("reCAPTCHA expired — please retry");
    },
  });

  return recaptchaVerifier;
}

/**
 * Sends an OTP to the given phone number via Firebase.
 *
 * @param phoneNumber - E.164 format, e.g. "+919876543210"
 * @returns ConfirmationResult — pass this to verifyOTP()
 * @throws FirebaseError on invalid number or quota exceeded
 */
export async function sendOTP(phoneNumber: string): Promise<ConfirmationResult> {
  if (!recaptchaVerifier) {
    throw new Error("reCAPTCHA verifier not initialised. Call setupRecaptcha() first.");
  }

  try {
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      phoneNumber,
      recaptchaVerifier
    );
    console.log("OTP sent successfully to", phoneNumber);
    return confirmationResult;
  } catch (error: any) {
    // Clear the verifier so a fresh one can be created on retry
    recaptchaVerifier?.clear();
    recaptchaVerifier = null;
    console.error("sendOTP error:", error);
    throw error;
  }
}

/**
 * Verifies the OTP entered by the user.
 *
 * @param confirmationResult - returned by sendOTP()
 * @param code - 6-digit OTP string entered by user
 * @returns UserCredential on success
 * @throws FirebaseError if code is wrong / expired
 */
export async function verifyOTP(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<UserCredential> {
  try {
    const credential = await confirmationResult.confirm(code);
    console.log("OTP verified. User:", credential.user.uid);
    return credential;
  } catch (error: any) {
    console.error("verifyOTP error:", error);
    throw error;
  }
}

/**
 * Maps common Firebase Auth error codes to user-friendly messages.
 */
export function getPhoneAuthErrorMessage(error: any): string {
  switch (error?.code) {
    case "auth/invalid-phone-number":
      return "Invalid phone number. Use international format, e.g. +919876543210";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/invalid-verification-code":
      return "Incorrect OTP. Please check and try again.";
    case "auth/code-expired":
      return "OTP has expired. Please request a new one.";
    case "auth/quota-exceeded":
      return "SMS quota exceeded for this project. Try again later.";
    case "auth/missing-phone-number":
      return "Please enter a phone number.";
    default:
      return error?.message || "Authentication failed. Please try again.";
  }
}
