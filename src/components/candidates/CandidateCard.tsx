import { ArrowRight, Building2, Download, FileText, Layers, Mail, MapPin, Phone } from "lucide-react";
import type { CSSProperties } from "react";
import type { CandidateProfile } from "@/types/candidate";

export type CandidateGroup = {
  key: string;
  versions: CandidateProfile[];
};

type CandidateCardProps = {
  candidate: CandidateProfile;
  versions: CandidateProfile[];
  groupKey: string;
  index: number;
  hasDocument: boolean;
  onPreview: (id: string) => void;
  onExport: (candidate: CandidateProfile) => void;
  onOpenProfile: (id: string) => void;
  onSeeVersions: (groupKey: string) => void;
};

export default function CandidateCard({
  candidate,
  versions,
  groupKey,
  index,
  hasDocument,
  onPreview,
  onExport,
  onOpenProfile,
  onSeeVersions,
}: CandidateCardProps) {
  const isDuplicate = versions.length > 1;

  return (
    <article
      className={`candidate-card transition duration-200 hover:-translate-y-0.5 ${isDuplicate ? "duplicate-card" : ""}`}
      style={{ "--card-index": index } as CSSProperties}
    >
      <div className="candidate-card-top">
        <div className="candidate-avatar">
          {(candidate.name ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <span className={`pill ${candidate.status === "completed" ? "pill-green" : "pill-amber"}`}>
          <i />
          {candidate.status === "completed" ? "Parsed" : "Needs review"}
        </span>
        <button
          className="card-document"
          title={hasDocument ? "Preview original resume" : "Resume preview unavailable"}
          disabled={!hasDocument}
          onClick={() => onPreview(candidate.id)}
        >
          <FileText size={14} /> Document
        </button>
        <button
          className="card-export"
          title="Export profile JSON"
          onClick={() => onExport(candidate)}
        >
          <Download size={15} />
        </button>
      </div>
      {isDuplicate && (
        <button
          className="duplicate-stack-trigger"
          onClick={(event) => {
            event.stopPropagation();
            onSeeVersions(groupKey);
          }}
        >
          <span className="duplicate-stack-glyph">
            <Layers size={16} />
            <i>{versions.length}</i>
          </span>
          <span className="duplicate-stack-copy">
            <b>Duplicate stack</b>
            <small>{versions.length} resume versions · sorted by profile detail</small>
          </span>
          <span className="duplicate-stack-link">
            See all <ArrowRight size={13} />
          </span>
        </button>
      )}
      <button className="card-open" onClick={() => onOpenProfile(candidate.id)}>
        <h3>{candidate.name ?? "Name not identified"}</h3>
        <span className="card-filename">{candidate.originalFileName}</span>
        <div className="card-contact">
          <span><Mail size={13} />{candidate.email ?? "Email not found"}</span>
          <span><Phone size={13} />{candidate.phone ?? "Phone not found"}</span>
        </div>
        <div className="card-facts">
          <div>
            <small>EXPERIENCE</small>
            <b>{candidate.totalExperienceYears === null ? "—" : `${candidate.totalExperienceYears} yrs`}</b>
          </div>
          <div>
            <small>LOCATION</small>
            <b><MapPin size={13} />{candidate.location ?? "Not identified"}</b>
          </div>
          <div className="card-company">
            <small>MOST RECENT COMPANY</small>
            <b><Building2 size={13} />{candidate.companies.at(-1) ?? "Not identified"}</b>
          </div>
        </div>
        <div className="card-skills">
          {candidate.skills.slice(0, 4).map((value) => <span className="tag" key={value}>{value}</span>)}
          {candidate.skills.length > 4 && <span className="more">+{candidate.skills.length - 4} more</span>}
          {!candidate.skills.length && <span className="more">No recognized skills</span>}
        </div>
        <div className="card-bottom">
          <span>{candidate.sourceEmail ? `From ${candidate.sourceEmail}` : "Manual upload"}</span>
          <span className="view-profile">View profile <ArrowRight size={13} /></span>
        </div>
      </button>
    </article>
  );
}
