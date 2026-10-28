import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  RefreshCw,
  X,
} from "lucide-react";
import type { CandidateProfile } from "@/types/candidate";

export type DocumentPreview = {
  url: string;
  name: string;
  mimeType: string;
  text: string;
};

export type ActivityJob = {
  id: string;
  name: string;
  state:
    | "Waiting"
    | "Extracting text"
    | "Parsing candidate information"
    | "Completed"
    | "Needs review"
    | "Failed";
  error?: string;
};

type DuplicateGroup = {
  versions: CandidateProfile[];
  primary: CandidateProfile;
};

export function ActivityDrawer({
  jobs,
  onClose,
  onClear,
}: {
  jobs: ActivityJob[];
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="overlay activity-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="activity-drawer">
        <header className="activity-drawer-head">
          <div>
            <span className="drawer-kicker">WORKSPACE</span>
            <h2>Activity</h2>
          </div>
          <button aria-label="Close activity" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="activity-drawer-body">
          {jobs.length ? (
            jobs.map((job) => {
              const completed = job.state === "Completed" || job.state === "Needs review";
              const failed = job.state === "Failed";
              return (
                <div className="activity-item" key={job.id}>
                  <div className={`activity-state ${failed ? "failed" : completed ? "done" : ""}`}>
                    {failed ? <AlertTriangle size={15} /> : completed ? <CheckCircle2 size={15} /> : <RefreshCw size={14} />}
                  </div>
                  <div className="activity-item-copy">
                    <b>{job.name}</b>
                    <span>{job.state}</span>
                    {job.error && <small>{job.error}</small>}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="activity-empty">No recent activity yet.</div>
          )}
        </div>
        <footer className="activity-drawer-foot">
          <span>{jobs.length} recent files</span>
          <button className="text-btn" onClick={onClear} disabled={!jobs.length}>
            Clear activity
          </button>
        </footer>
      </aside>
    </div>
  );
}

export function DocumentPreviewOverlay({
  preview,
  onClose,
}: {
  preview: DocumentPreview;
  onClose: () => void;
}) {
  return (
    <div
      className="overlay document-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="document-viewer">
        <header className="document-toolbar">
          <div>
            <FileText size={17} />
            <div>
              <b>{preview.name}</b>
              <small>Original resume document</small>
            </div>
          </div>
          <div>
            <a href={preview.url} download={preview.name} className="document-download">
              <Download size={14} /> Download
            </a>
            <button aria-label="Close document preview" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>
        {preview.mimeType === "application/pdf" ? (
          <iframe className="pdf-preview" title={`Resume document: ${preview.name}`} src={preview.url} />
        ) : (
          <div className="docx-preview"><pre>{preview.text}</pre></div>
        )}
      </section>
    </div>
  );
}

export function DuplicateVersionsDrawer({
  group,
  documents,
  onClose,
  onPreview,
  onOpenProfile,
}: {
  group: DuplicateGroup;
  documents: Record<string, DocumentPreview>;
  onClose: () => void;
  onPreview: (document: DocumentPreview) => void;
  onOpenProfile: (id: string) => void;
}) {
  return (
    <div
      className="overlay duplicate-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="duplicate-drawer">
        <header className="duplicate-drawer-head">
          <div>
            <div className="drawer-kicker">DUPLICATE PROFILES</div>
            <h2>{group.versions[0].name ?? "Candidate versions"}</h2>
            <p>
              {group.versions.length} versions share the same email address or phone number. Compare the original files and extracted details.
            </p>
          </div>
          <button aria-label="Close candidate versions" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="duplicate-version-list">
          {group.versions.map((version) => (
            <article className="duplicate-version" key={version.id}>
              <div className="duplicate-version-top">
                <div className="candidate-avatar">
                  {(version.name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="duplicate-version-title">
                  <b>{version.name ?? "Name not identified"}</b>
                  <span>{version.id === group.primary.id ? "Most complete version" : "Saved version"}</span>
                </div>
                <span className={`pill ${version.status === "completed" ? "pill-green" : "pill-amber"}`}>
                  <i />{version.status === "completed" ? "Parsed" : "Needs review"}
                </span>
              </div>
              <div className="duplicate-version-file">
                <FileText size={14} />
                <span title={version.originalFileName}>{version.originalFileName}</span>
              </div>
              <div className="duplicate-version-meta">
                <span>{version.email ?? "Email not identified"}</span>
                <span>{version.phone ?? "Phone not identified"}</span>
                <span>
                  {version.sourceEmail ? `From ${version.sourceEmail}` : "Manual upload"}
                  {" · "}{new Date(version.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="duplicate-version-skills">
                {version.skills.slice(0, 6).map((value) => <em key={value}>{value}</em>)}
              </div>
              <div className="duplicate-version-actions">
                <button
                  className="btn secondary"
                  disabled={!documents[version.id]}
                  onClick={() => {
                    const document = documents[version.id];
                    if (document) onPreview(document);
                  }}
                >
                  <FileText size={14} /> Preview resume
                </button>
                <button className="btn primary" onClick={() => onOpenProfile(version.id)}>
                  Open profile <ArrowRight size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
