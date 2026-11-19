"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, requestJSON, send, showError } from "@/lib/utils/client";

type PoolKeyInfo = {
  index: number;
  id: string;
  masked: string;
  source: string;
};

type CooldownInfo = {
  keyId: string;
  masked: string;
  model: string;
  reason: string;
  status?: number;
  remainingMs: number;
  expiresAt: string;
};

type ProviderSnapshot = {
  pool: {
    gemini: {
      keyCount: number;
      keys: PoolKeyInfo[];
      cooldowns: CooldownInfo[];
    };
    groq: {
      keyCount: number;
      keys: PoolKeyInfo[];
      cooldowns: CooldownInfo[];
    };
  };
  models: {
    flash: string[];
    live: string[];
    liveThinkingLevel: string;
    transcribe: string;
    transcribeLive: string;
    tts: string[];
    groqStrategist: string[];
    groqWhisper: string[];
  };
  quotas: {
    maxInterviewsPerDay: number;
    maxCompanyInterviewsPerDayPerOrg: number;
    recordingRetentionDays: number;
  };
  aiMode: string;
  aiDataTier: string;
};

const formatRemaining = (ms: number) => {
  const secs = Math.max(1, Math.round(ms / 1000));
  if (secs < 60) return secs + "s";
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return mins + "m" + (rem ? " " + rem + "s" : "");
};

export function AdminProviders() {
  const [resetting, setResetting] = useState(false);
  const query = useQuery({
    queryKey: ["admin-providers"],
    queryFn: () => requestJSON<ProviderSnapshot>("/api/admin/providers"),
    refetchInterval: 15_000,
  });

  async function resetCooldowns() {
    setResetting(true);
    try {
      await send("/api/admin/providers", "POST", { action: "reset_cooldowns" });
      await query.refetch();
      toast.success("All provider cooldowns cleared.");
    } catch (error) {
      showError(error);
    } finally {
      setResetting(false);
    }
  }

  if (query.isPending) return <p role="status">Loading AI pool status…</p>;
  if (query.isError) {
    return (
      <div className="card stack">
        <p role="alert" className="danger">
          {errorMessage(query.error)}
        </p>
        <div>
          <button className="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const data = query.data;
  const allCooldowns = [
    ...data.pool.gemini.cooldowns.map((item) => ({
      ...item,
      provider: "Gemini",
    })),
    ...data.pool.groq.cooldowns.map((item) => ({ ...item, provider: "Groq" })),
  ];

  return (
    <div className="stack-lg">
      <div className="page-header">
        <div className="stack-sm">
          <span className="eyebrow">Admin</span>
          <h1>AI provider pool</h1>
          <p className="muted">
            Tries the top model across every configured API key first, then
            steps down the model ladder on rate limits or upstream errors.
          </p>
        </div>
        <div className="cluster">
          <button
            className="button secondary"
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </button>
          <button
            className="button"
            disabled={resetting}
            onClick={() => void resetCooldowns()}
          >
            {resetting ? "Resetting…" : "Reset cooldowns"}
          </button>
        </div>
      </div>

      <div className="grid-4">
        <div className="card stat">
          <span className="stat-icon">
            <KeyRound size={19} aria-hidden="true" />
          </span>
          <small>Gemini API keys</small>
          <strong className="mono stat-value">
            {data.pool.gemini.keyCount}
          </strong>
        </div>
        <div className="card stat">
          <span className="stat-icon">
            <KeyRound size={19} aria-hidden="true" />
          </span>
          <small>Groq API keys</small>
          <strong className="mono stat-value">{data.pool.groq.keyCount}</strong>
        </div>
        <div className="card stat">
          <span className="stat-icon">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <small>Practice / day cap</small>
          <strong className="mono stat-value">
            {data.quotas.maxInterviewsPerDay}
          </strong>
        </div>
        <div className="card stat">
          <span className="stat-icon">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <small>Org / day cap · Retention</small>
          <strong className="mono stat-value">
            {data.quotas.maxCompanyInterviewsPerDayPerOrg} ·{" "}
            {data.quotas.recordingRetentionDays}d
          </strong>
        </div>
      </div>

      <div className="grid-2">
        <section className="card stack-sm">
          <div className="cluster between">
            <h2>Gemini key pool</h2>
            <span className="badge primary">
              {data.pool.gemini.keyCount} loaded
            </span>
          </div>
          {data.pool.gemini.keys.length ? (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Masked suffix</th>
                    <th>Key ID</th>
                    <th>Env var</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pool.gemini.keys.map((slot) => (
                    <tr key={slot.id}>
                      <td className="mono">#{slot.index}</td>
                      <td className="mono">{slot.masked}</td>
                      <td className="mono">{slot.id}</td>
                      <td className="mono">{slot.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No Gemini API keys configured.</p>
          )}
        </section>

        <section className="card stack-sm">
          <div className="cluster between">
            <h2>Groq key pool</h2>
            <span className="badge primary">
              {data.pool.groq.keyCount} loaded
            </span>
          </div>
          {data.pool.groq.keys.length ? (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Masked suffix</th>
                    <th>Key ID</th>
                    <th>Env var</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pool.groq.keys.map((slot) => (
                    <tr key={slot.id}>
                      <td className="mono">#{slot.index}</td>
                      <td className="mono">{slot.masked}</td>
                      <td className="mono">{slot.id}</td>
                      <td className="mono">{slot.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No Groq API keys configured.</p>
          )}
        </section>
      </div>

      <section className="card stack-sm">
        <h2>Model failover ladders</h2>
        <p className="muted small">
          Mode: <span className="mono">{data.aiMode}</span> · Data tier:{" "}
          <span className="mono">{data.aiDataTier}</span> · Live thinking level:{" "}
          <span className="mono">{data.models.liveThinkingLevel}</span>
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Workload</th>
                <th>Order tried (best across all keys first)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Gemini reasoning / CV / planning / report</td>
                <td className="mono">{data.models.flash.join(" → ")}</td>
              </tr>
              <tr>
                <td>Gemini Live audio interviewer</td>
                <td className="mono">{data.models.live.join(" → ")}</td>
              </tr>
              <tr>
                <td>Gemini Live real-time transcription</td>
                <td className="mono">{data.models.transcribeLive}</td>
              </tr>
              <tr>
                <td>Gemini batch / fallback transcription</td>
                <td className="mono">{data.models.transcribe}</td>
              </tr>
              <tr>
                <td>Gemini interviewer TTS</td>
                <td className="mono">{data.models.tts.join(" → ")}</td>
              </tr>
              <tr>
                <td>Groq live strategist</td>
                <td className="mono">{data.models.groqStrategist.join(" → ")}</td>
              </tr>
              <tr>
                <td>Groq Whisper STT</td>
                <td className="mono">{data.models.groqWhisper.join(" → ")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack-sm">
        <div className="cluster between">
          <h2>Active key-model cooldowns</h2>
          <span
            className={"badge " + (allCooldowns.length ? "warning" : "accent")}
          >
            {allCooldowns.length ? allCooldowns.length + " cooled" : "All healthy"}
          </span>
        </div>
        {allCooldowns.length ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Key</th>
                  <th>Model</th>
                  <th>Reason</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {allCooldowns.map((entry) => (
                  <tr
                    key={
                      entry.provider + ":" + entry.keyId + ":" + entry.model
                    }
                  >
                    <td>{entry.provider}</td>
                    <td className="mono">{entry.masked}</td>
                    <td className="mono">{entry.model}</td>
                    <td>
                      {entry.reason}
                      {entry.status ? ` (HTTP ${entry.status})` : ""}
                    </td>
                    <td className="mono">
                      {formatRemaining(entry.remainingMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No keys or models are currently cooled down.
          </p>
        )}
      </section>

      <section className="card stack-sm">
        <h2>Adding unlimited API keys</h2>
        <p className="muted">
          Set comma-separated keys in <code className="mono">.env.local</code>{" "}
          or Vercel Environment Variables with no upper limit:
        </p>
        <pre className="inset mono small wrap-anywhere">
          {
            "GEMINI_API_KEY=key1,key2,key3\nGROQ_API_KEY=gsk1,gsk2,gsk3\n# Optional extras also merged automatically:\n# GEMINI_API_KEYS=...\n# GEMINI_API_KEY_1=... GEMINI_API_KEY_2=...\n# GROQ_API_KEYS=...\n# GROQ_API_KEY_1=... GROQ_API_KEY_2=..."
          }
        </pre>
      </section>
    </div>
  );
}
