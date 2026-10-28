import { AlertTriangle, FileJson, FileText, Trash2, X } from "lucide-react";
import type { CandidateProfile } from "@/types/candidate";

type CandidateProfileDrawerProps = {
  candidate: CandidateProfile;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (field: keyof CandidateProfile, value: unknown) => void;
  onEditRole: (index: number, key: string, value: unknown) => void;
  onEditEducation: (index: number, key: string, value: unknown) => void;
  onExport: (candidate: CandidateProfile) => void;
};

export default function CandidateProfileDrawer({
  candidate,
  onClose,
  onDelete,
  onEdit,
  onEditRole,
  onEditEducation,
  onExport,
}: CandidateProfileDrawerProps) {
  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="drawer">
        <div className="drawer-top">
          <span>Candidate profile</span>
          <div>
            <button title="Delete candidate" onClick={() => onDelete(candidate.id)}>
              <Trash2 size={16} />
            </button>
            <button title="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="profile-head">
          <div className="profile-avatar">
            {(candidate.name ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <input
              className="name-edit"
              value={candidate.name ?? ""}
              placeholder="Candidate name"
              onChange={(event) => onEdit("name", event.target.value || null)}
            />
            <div className="profile-file">
              <FileText size={13} />
              {candidate.originalFileName}
            </div>
          </div>
          <span className={`pill ${candidate.status === "completed" ? "pill-green" : "pill-amber"}`}>
            {candidate.status === "completed" ? "Completed" : "Needs review"}
          </span>
        </div>
        <div className="drawer-content">
          <section className="profile-section">
            <h4>Contact information</h4>
            <div className="form-grid">
              <EditField label="Email" value={candidate.email} onChange={(value) => onEdit("email", value || null)} />
              <EditField label="Phone" value={candidate.phone} onChange={(value) => onEdit("phone", value || null)} />
              <EditField label="Location" value={candidate.location} onChange={(value) => onEdit("location", value || null)} />
            </div>
          </section>

          <section className="profile-section">
            <h4>Experience summary</h4>
            <div className="experience-summary">
              <label>
                Calculated years
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={candidate.totalExperienceYears ?? ""}
                  onChange={(event) => onEdit("totalExperienceYears", event.target.value ? Number(event.target.value) : null)}
                />
              </label>
              <label>
                Stated years
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={candidate.statedExperienceYears ?? ""}
                  onChange={(event) => onEdit("statedExperienceYears", event.target.value ? Number(event.target.value) : null)}
                />
              </label>
            </div>
          </section>

          <section className="profile-section">
            <h4>Technical skills <small>{candidate.skills.length}</small></h4>
            <textarea
              className="edit-area"
              value={candidate.skills.join(", ")}
              onChange={(event) => onEdit("skills", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))}
              placeholder="Add skills, separated by commas"
            />
            <div className="hint">Separate skills with commas.</div>
          </section>

          <section className="profile-section">
            <h4>Employment history</h4>
            {candidate.experience.length ? candidate.experience.map((role, index) => (
              <div className="role" key={index}>
                <div className="form-grid">
                  <EditField label="Job title" value={role.jobTitle} onChange={(value) => onEditRole(index, "jobTitle", value || null)} />
                  <EditField label="Company" value={role.company} onChange={(value) => onEditRole(index, "company", value || null)} />
                  <EditField label="Start date" value={role.startDate} onChange={(value) => onEditRole(index, "startDate", value || null)} />
                  <EditField label="End date" value={role.isCurrent ? "Present" : role.endDate} onChange={(value) => onEditRole(index, "endDate", value === "Present" ? null : value || null)} />
                </div>
                <label className="field">
                  <span>Supporting resume text</span>
                  <textarea className="edit-area" value={role.evidence} onChange={(event) => onEditRole(index, "evidence", event.target.value)} />
                </label>
              </div>
            )) : <p className="muted">No confident employment records extracted.</p>}
          </section>

          <section className="profile-section">
            <h4>Leadership evidence</h4>
            {candidate.leadershipEvidence.length ? candidate.leadershipEvidence.map((item, index) => (
              <div className="evidence" key={index}>
                <span>{item.category.replaceAll("_", " ")}</span>
                <textarea
                  className="edit-area"
                  value={item.evidenceText}
                  onChange={(event) => onEdit("leadershipEvidence", candidate.leadershipEvidence.map((entry, entryIndex) => entryIndex === index ? { ...entry, evidenceText: event.target.value, statement: event.target.value } : entry))}
                />
              </div>
            )) : <p className="muted">No explicit leadership evidence found.</p>}
          </section>

          <section className="profile-section">
            <h4>Education</h4>
            {candidate.education.length ? candidate.education.map((item, index) => (
              <div className="education form-grid" key={index}>
                <EditField label="Qualification" value={item.qualification} onChange={(value) => onEditEducation(index, "qualification", value)} />
                <EditField label="Institution" value={item.institution} onChange={(value) => onEditEducation(index, "institution", value || null)} />
                <label className="field">
                  <span>Graduation year</span>
                  <input type="number" value={item.graduationYear ?? ""} onChange={(event) => onEditEducation(index, "graduationYear", event.target.value ? Number(event.target.value) : null)} />
                </label>
              </div>
            )) : <p className="muted">No education details extracted.</p>}
          </section>

          <section className="profile-section">
            <h4>Certifications</h4>
            {candidate.certifications.length ? <ul>{candidate.certifications.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="muted">No certifications extracted.</p>}
          </section>

          <section className="profile-section">
            <h4>Extraction warnings</h4>
            {candidate.extractionWarnings.length ? candidate.extractionWarnings.map((warning) => (
              <div className="warning" key={warning}><AlertTriangle size={14} />{warning}</div>
            )) : <p className="muted">No extraction warnings.</p>}
          </section>

          <details className="profile-section raw">
            <summary><h4>Original extracted resume text</h4></summary>
            <pre>{candidate.extractedText}</pre>
          </details>
        </div>
        <div className="drawer-footer">
          <span>
            {candidate.manuallyEditedFields.length
              ? `Manually edited: ${candidate.manuallyEditedFields.join(", ")}`
              : "Fields can be edited inline"}
          </span>
          <button className="btn primary" onClick={() => onExport(candidate)}>
            <FileJson size={15} /> Export JSON
          </button>
        </div>
      </aside>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ""} placeholder="Not identified" onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
