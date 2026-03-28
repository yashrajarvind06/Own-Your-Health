import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import { Card } from "../components/ui/Card";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendRow = {
  date: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  glucose: number | null;
};

function TrendCard({
  title,
  disclaimer,
  children,
}: {
  title: string;
  disclaimer: string;
  children: React.ReactNode;
}) {
  return (
    <Card title={title}>
      <div className="h-[280px]">{children}</div>
      <p className="mt-4 text-xs text-gray-500">{disclaimer}</p>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
      {message}
    </div>
  );
}

export default function HealthTrends() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrends() {
      if (!user) return;
      try {
        setLoading(true);
        setError(null);
        const data = await api(`/reports/trends/${user.id}`);
        console.log("TRENDS DATA:", data);
        setRows(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setError(err.message || "Failed to load trends");
      } finally {
        setLoading(false);
      }
    }

    loadTrends();
  }, [user]);

  const bloodPressureRows = useMemo(
    () => rows.filter((row) => row.bp_systolic !== null && row.bp_diastolic !== null),
    [rows]
  );
  const heartRateRows = useMemo(
    () => rows.filter((row) => row.heart_rate !== null),
    [rows]
  );
  const glucoseRows = useMemo(
    () => rows.filter((row) => row.glucose !== null),
    [rows]
  );

  const latestInsights = useMemo(() => {
    const latestBp = [...bloodPressureRows].at(-1);
    const latestHeartRate = [...heartRateRows].at(-1);
    const latestGlucose = [...glucoseRows].at(-1);

    return [
      latestBp && latestBp.bp_systolic !== null && latestBp.bp_systolic >= 140
        ? { label: "High BP", value: `${latestBp.bp_systolic}/${latestBp.bp_diastolic}`, tone: "text-red-700 bg-red-50 border-red-200" }
        : null,
      latestHeartRate && latestHeartRate.heart_rate !== null && latestHeartRate.heart_rate > 100
        ? { label: "High Heart Rate", value: `${latestHeartRate.heart_rate} bpm`, tone: "text-amber-700 bg-amber-50 border-amber-200" }
        : null,
      latestGlucose && latestGlucose.glucose !== null && latestGlucose.glucose < 70
        ? { label: "Low Glucose", value: `${latestGlucose.glucose}`, tone: "text-blue-700 bg-blue-50 border-blue-200" }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string; tone: string }>;
  }, [bloodPressureRows, glucoseRows, heartRateRows]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card
        title="Health Trends"
        description="Interactive OCR-derived trends for blood pressure, heart rate, and glucose."
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-gray-500">
            These charts reflect values extracted from your uploaded reports. Missing OCR values are intentionally skipped.
          </p>
          <div className="text-sm font-medium text-gray-700">
            {rows.length} trend point{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && latestInsights.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {latestInsights.map((insight) => (
            <div key={insight.label} className={`rounded-xl border px-4 py-3 text-sm ${insight.tone}`}>
              <div className="font-semibold">{insight.label}</div>
              <div className="mt-1">{insight.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-gray-500">Loading trend data...</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card title="Health Trends">
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-sm text-gray-500">
            No valid trend data available. Upload reports with detectable dates.
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <TrendCard
            title="Blood Pressure Trend"
            disclaimer="Trends are indicative and not a substitute for clinical diagnosis."
          >
            {bloodPressureRows.length === 0 ? (
              <EmptyState message="No blood pressure values available yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bloodPressureRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="bp_systolic" name="Systolic" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="bp_diastolic" name="Diastolic" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </TrendCard>

          <TrendCard
            title="Heart Rate Trend"
            disclaimer="Heart rate may vary based on activity and conditions."
          >
            {heartRateRows.length === 0 ? (
              <EmptyState message="No heart rate values available yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={heartRateRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="heart_rate" name="Heart Rate" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </TrendCard>

          <TrendCard
            title="Glucose Trend"
            disclaimer="Values are indicative and should be clinically verified."
          >
            {glucoseRows.length === 0 ? (
              <EmptyState message="No glucose values available yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={glucoseRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="glucose" name="Glucose" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </TrendCard>
        </div>
      )}
    </div>
  );
}
