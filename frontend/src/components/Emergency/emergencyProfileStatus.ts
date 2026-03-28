import { useCallback, useEffect, useState } from "react";

import { api } from "../../api";

type Gender = "male" | "female" | "other" | "";
type DonorStatus = "yes" | "no" | "";

interface EmergencyProfileData {
  exists?: boolean;
  patient_id?: number | null;
  name?: string;
  date_of_birth?: string;
  gender?: Gender;
  medications?: string;
  organ_donor_status?: DonorStatus;
  pregnancy_status?: string;
}

interface EmergencyProfileStatusState {
  loading: boolean;
  percent: number;
  ringColor: string;
  isStepOneComplete: boolean;
  isStepTwoComplete: boolean;
  isStepThreeComplete: boolean;
}

const STATUS_EVENT = "emergency-profile-status-change";
const QR_GENERATED_KEY_PREFIX = "ownyourhealth:emergency-qr-generated:";

function getQrGeneratedKey(scopeId: number) {
  return `${QR_GENERATED_KEY_PREFIX}${scopeId}`;
}

function hasGeneratedQr(scopeId: number) {
  return localStorage.getItem(getQrGeneratedKey(scopeId)) === "true";
}

export function markEmergencyQrGenerated(scopeId: number) {
  localStorage.setItem(getQrGeneratedKey(scopeId), "true");
  window.dispatchEvent(new Event(STATUS_EVENT));
}

export function notifyEmergencyProfileStatusChanged() {
  window.dispatchEvent(new Event(STATUS_EVENT));
}

export function isEmergencyFormComplete(profile: EmergencyProfileData) {
  const baseFieldsFilled =
    !!profile.name?.trim() &&
    !!profile.date_of_birth &&
    !!profile.gender &&
    !!profile.medications?.trim() &&
    !!profile.organ_donor_status;

  if (!baseFieldsFilled) {
    return false;
  }

  if (profile.gender === "female") {
    return !!profile.pregnancy_status;
  }

  return true;
}

function buildStatus(profile: EmergencyProfileData, fallbackScopeId?: number | null): EmergencyProfileStatusState {
  const scopeId = profile.patient_id ?? fallbackScopeId ?? null;
  const isStepOneComplete = isEmergencyFormComplete(profile);
  const isStepTwoComplete = !!profile.exists;
  const isStepThreeComplete = scopeId ? hasGeneratedQr(scopeId) : false;

  if (isStepThreeComplete) {
    return {
      loading: false,
      percent: 100,
      ringColor: "#10b981",
      isStepOneComplete,
      isStepTwoComplete,
      isStepThreeComplete,
    };
  }

  if (isStepTwoComplete) {
    return {
      loading: false,
      percent: 75,
      ringColor: "#f59e0b",
      isStepOneComplete,
      isStepTwoComplete,
      isStepThreeComplete,
    };
  }

  if (isStepOneComplete) {
    return {
      loading: false,
      percent: 50,
      ringColor: "#10b981",
      isStepOneComplete,
      isStepTwoComplete,
      isStepThreeComplete,
    };
  }

  return {
    loading: false,
    percent: 0,
    ringColor: "#e5e7eb",
    isStepOneComplete,
    isStepTwoComplete,
    isStepThreeComplete,
  };
}

export function useEmergencyProfileStatus(userId?: number | null) {
  const [status, setStatus] = useState<EmergencyProfileStatusState>({
    loading: true,
    percent: 0,
    ringColor: "#e5e7eb",
    isStepOneComplete: false,
    isStepTwoComplete: false,
    isStepThreeComplete: false,
  });

  const refreshStatus = useCallback(async () => {
    if (!userId) {
      setStatus({
        loading: false,
        percent: 0,
        ringColor: "#e5e7eb",
        isStepOneComplete: false,
        isStepTwoComplete: false,
        isStepThreeComplete: false,
      });
      return;
    }

    try {
      const profile = await api("/api/emergency-qr/me");
      setStatus(buildStatus(profile, userId));
    } catch {
      setStatus(buildStatus({}, userId));
    }
  }, [userId]);

  useEffect(() => {
    refreshStatus();

    const handleStatusChange = () => {
      refreshStatus();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith(QR_GENERATED_KEY_PREFIX)) {
        refreshStatus();
      }
    };

    window.addEventListener(STATUS_EVENT, handleStatusChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(STATUS_EVENT, handleStatusChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshStatus]);

  return status;
}
