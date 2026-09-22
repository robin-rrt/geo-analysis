import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client.js";
import { Bar } from "../charts/Bar.jsx";
import { bandColour, bandName } from "../lib/bands.js";
import { FidelityBadge } from "../components/FidelityBadge.jsx";
import { Loading, ErrorState, Empty } from "../components/States.jsx";
import { PageActions } from "../components/PageActions.jsx";

export default function PageDetail() {
  const { key } = useParams();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["page", key], queryFn: () => client.page(key) });

  if (isLoading) return <div className="wrap"><Loading label="Loading page" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const { audit, probeRuns = [], health } = data ?? {};
  const primary = probeRuns.find((r) => r.mode === "web") ?? probeRuns[0] ?? null;
  const url = audit?.url ?? null;

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="eyebrow"><Link to="/pages" className="quiet">Pages</Link></div>
        <h1>{audit?.title ?? key}</h1>
        <div className="sub mono">{audit?.url}</div>
      </div>

      {/* Offered in place, so the next step is where the gap is visible. */}
      <PageActions page={data} url={url} onDone={refetch} />

      {/* The same figure treatment as the Overview, one step down in scale. */}
      <div className="figure-row ruled">
        <div className="figure">
          <div className="figure-value" style={{ color: bandColour(audit?.score) }}>
            {Number.isFinite(audit?.score) ? audit.score : "—"}
          </div>
          <div className="figure-label">Page quality</div>
          <div className="figure-note">{bandName(audit?.score) ?? "not audited"}</div>
        </div>
        <div className="figure">
          <div className="figure-value" style={{ color: bandColour(primary?.avg_fidelity) }}>
            {Number.isFinite(primary?.avg_fidelity) ? Math.round(primary.avg_fidelity) : "—"}
          </div>
          <div className="figure-label">Answer fidelity</div>
          <div className="figure-note">
            {primary?.grader_model
              ? `graded by ${primary.grader_model.replace("claude-", "")}`
              : "not probed"}
          </div>
        </div>
        <div className="figure">
          <div className="figure-value" style={{ color: health?.clean ? "var(--text)" : "var(--warn)" }}>
            {health?.clean ? "OK" : "!"}
          </div>
          <div className="figure-label">Run health</div>
          <div className="figure-note">
            {health?.clean ? "searches clean" : `${health?.degraded ?? 0} degraded · ${health?.failed ?? 0} failed`}
          </div>
        </div>
      </div>

      {/* The report itself. parseAudit has always produced these; the UI simply
          never showed them, so "see the report it created" had no answer. */}
      {audit?.summary ? (
        <section className="ruled" style={{ marginTop: "var(--s6)" }}>
          <h2>Summary</h2>
          <p className="note" style={{ marginTop: 0 }}>{audit.summary}</p>
        </section>
      ) : null}

      {audit?.recommendations?.length ? (
        <section className="ruled" style={{ marginTop: "var(--s6)" }}>
          <h2>Recommended fixes</h2>
          {audit.recommendations.map((r, i) => (
            <div className="finding ruled-soft" key={i} style={{ paddingBottom: "var(--s3)", marginTop: i ? "var(--s3)" : 0 }}>
              <div>
                <div style={{ display: "flex", gap: "var(--s2)", alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13 }}>{r.title}</strong>
                </div>
                {r.meta ? <div className="finding-body">{r.meta}</div> : null}
                {r.body ? <div className="finding-body" style={{ whiteSpace: "pre-wrap" }}>{r.body}</div> : null}
              </div>
              <div>
                <div
                  className="finding-fig"
                  style={{ color: r.priority === 1 ? "var(--sev-high)" : r.priority === 2 ? "var(--sev-med)" : "var(--sev-low)" }}
                >
                  P{r.priority}
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {audit?.antiPatterns?.length ? (
        <section className="ruled" style={{ marginTop: "var(--s6)" }}>
          <h2>Anti-patterns found</h2>
          <ul className="note" style={{ marginTop: 0, paddingLeft: "1.1em" }}>
            {audit.antiPatterns.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
          </ul>
        </section>
      ) : null}

      {audit?.dimensions?.length ? (
        <section className="ruled" style={{ marginTop: "var(--s6)" }}>
          <h2>Dimensions</h2>
          {/* Sorted ascending so the weakest — the thing to act on — reads first. */}
          <Bar
            items={[...audit.dimensions]
              .sort((a, b) => a.score - b.score)
              .map((d) => ({ label: d.name, value: d.score, note: `weight ${d.weight}` }))}
            max={10}
            format={(v) => `${v}/10`}
          />
          {/* Per-dimension critique — the reasoning behind each score. */}
          {audit.dimensions.some((d) => d.analysis) ? (
            <div style={{ marginTop: 12 }}>
              {[...audit.dimensions]
                .sort((a, b) => a.score - b.score)
                .filter((d) => d.analysis)
                .map((d) => (
                  <details key={d.name} className="card" style={{ marginBottom: 6 }}>
                    <summary>
                      <strong className="small">{d.name}</strong>{" "}
                      <span className="muted small">{d.score}/10 · weight {d.weight}</span>
                    </summary>
                    <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{d.analysis}</div>
                  </details>
                ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="ruled" style={{ marginTop: "var(--s6)" }}>
      <h2>Probes</h2>
      {!primary ? (
        <Empty
          title={data?.probeSet?.present ? `${data.probeSet.count} probes generated, none graded` : "No probes yet"}
          hint={
            data?.probeSet?.present
              ? "The probe set exists and is paid for — grading it is the only remaining cost."
              : "Generate a probe set to measure how engines answer questions about this page."
          }
        />
      ) : !data?.tested ? (
        <Empty
          title="A probe run exists but graded nothing"
          hint={`${primary.probe_count ?? 0} probes, ${primary.error_count ?? 0} errored. The answers were never scored, so there is no fidelity for this page.`}
        />
      ) : (
        <>
          <p className="small muted">
            {primary.probe_count} probes, {primary.mode} mode, graded by {primary.grader_model}.
          </p>
          {primary.unattributed_count ? (
            /* A question the engine could not attribute to this product is a
               discoverability failure, not bad writing. Showing it separately
               keeps fidelity meaning one thing. */
            <p className="caveat">
              <strong>{primary.unattributed_count} of {primary.probe_count} answers never identified the subject.</strong>{" "}
              The model answered a different topic — it did not find this product. Those are excluded
              from the fidelity above ({primary.avg_fidelity_all != null ? `including them it would be ${Math.round(primary.avg_fidelity_all)}` : "unfiltered figure unavailable"}),
              because that is a retrieval problem rather than an answer-quality one. Look for probes
              marked <code>cold</code>, or wording that does not name the product.
            </p>
          ) : null}
          {(primary.results ?? []).map((r) => (
            <details key={r.probe_id} className="item">
              <summary>
                <strong>{r.probe_id}</strong>{" "}
                <span className="muted small">fidelity {r.fidelity ?? "—"}</span>{" "}
                {r.subject_identified === false ? (
                  <span className="badge" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
                    wrong subject
                  </span>
                ) : null}{" "}
                <span className="faint small">{r.prompt?.slice(0, 90)}</span>
              </summary>
              <div className="small" style={{ marginTop: 10 }}>
                <p className="muted">{r.prompt}</p>
                <pre className="mono" style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>{r.answer}</pre>
              </div>
            </details>
          ))}
        </>
      )}
      </section>
    </div>
  );
}
