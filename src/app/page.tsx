"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  FileText,
  Users,
  Trash2,
  Activity,
  Menu,
} from "lucide-react";
import type { CandidateProfile } from "@/types/candidate";
import { validateFile } from "@/lib/resume/validate-file";
import { extractText } from "@/lib/resume/extract-text";
import {
  parseResume,
  missingRequiredResumeFields,
} from "@/lib/resume/resume-parser";
import { filterCandidates } from "@/lib/resume/candidate-search";
import { candidatesToCsv } from "@/lib/resume/export-csv";
import GmailScanPanel from "@/components/GmailScanPanel";
import ShortlistPanel from "@/components/ShortlistPanel";
import StatsCards from "@/components/dashboard/StatsCards";
import CandidateCard, {
  type CandidateGroup,
} from "@/components/candidates/CandidateCard";
import CandidateFilters from "@/components/candidates/CandidateFilters";
import CandidatePagination from "@/components/candidates/CandidatePagination";
import CandidateProfileDrawer from "@/components/candidates/CandidateProfileDrawer";
import {
  ActivityDrawer,
  DocumentPreviewOverlay,
  DuplicateVersionsDrawer,
  type ActivityJob as Job,
  type DocumentPreview,
} from "@/components/workspace/WorkspaceOverlays";
function duplicateOf(candidate: CandidateProfile, rows: CandidateProfile[]) {
  const email = candidate.email?.toLowerCase();
  const phone = candidate.phone?.replace(/\D/g, "");
  const name = candidate.name?.toLowerCase().replace(/[^a-z]/g, "");
  return rows.find((row) => {
    if (row.id === candidate.id) return false;
    const sameEmail = Boolean(email && row.email?.toLowerCase() === email);
    const samePhone = Boolean(phone && row.phone?.replace(/\D/g, "") === phone);
    const sameNameAndPhone = Boolean(
      name &&
        row.name?.toLowerCase().replace(/[^a-z]/g, "") === name &&
        phone &&
        row.phone?.replace(/\D/g, "") === phone
    );
    return sameEmail || samePhone || sameNameAndPhone;
  });
}
function profileDataScore(candidate: CandidateProfile) {
  return (
    Number(Boolean(candidate.name)) * 5 +
    Number(Boolean(candidate.email)) * 5 +
    Number(Boolean(candidate.phone)) * 5 +
    Number(Boolean(candidate.location)) * 4 +
    Math.min(candidate.skills.length, 12) * 0.5 +
    Math.min(candidate.experience.length, 6) * 1.5 +
    candidate.experience.reduce(
      (sum, role) =>
        sum +
        Number(Boolean(role.company)) * 2 +
        Number(Boolean(role.jobTitle)) * 2 +
        Number(Boolean(role.startDate)) * 1 +
        Number(Boolean(role.endDate || role.isCurrent)) * 1 +
        Number(Boolean(role.evidence)) * 0.5,
      0
    ) +
    Math.min(candidate.education.length, 4) +
    Math.min(candidate.certifications.length, 3) * 0.5 +
    Math.min(candidate.leadershipEvidence.length, 4) * 0.5 +
    Number(candidate.totalExperienceYears !== null) * 2 +
    Number(candidate.statedExperienceYears !== null)
  );
}
function groupCandidates(candidates: CandidateProfile[]): CandidateGroup[] {
  const parent = candidates.map((_, i) => i);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i]));
  const join = (a: number, b: number) => {
    const ra = root(a),
      rb = root(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const owners = new Map<string, number>();
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i],
      keys = [
        candidate.email ? `email:${candidate.email.trim().toLowerCase()}` : "",
        candidate.phone ? `phone:${candidate.phone.replace(/\D/g, "")}` : "",
      ].filter((key) => key.length > 6);
    for (const key of keys) {
      const owner = owners.get(key);
      if (owner === undefined) owners.set(key, i);
      else join(i, owner);
    }
  }
  const groups = new Map<number, CandidateProfile[]>();
  candidates.forEach((candidate, i) => {
    const r = root(i),
      items = groups.get(r) ?? [];
    items.push(candidate);
    groups.set(r, items);
  });
  return [...groups.entries()].map(([r, versions]) => ({
    key: candidates[r].id,
    versions,
  }));
}
export default function Home() {
  const [rows, setRows] = useState<CandidateProfile[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [min, setMin] = useState(""),
    [skill, setSkill] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [duplicateGroupId, setDuplicateGroupId] = useState<string | null>(null),
    [activityOpen, setActivityOpen] = useState(false),
    [gmailScanning, setGmailScanning] = useState(false),
    [actionCenterOpen, setActionCenterOpen] = useState(false),
    [preview, setPreview] = useState<DocumentPreview | null>(null),
    [documentPreviews, setDocumentPreviews] = useState<
      Record<string, DocumentPreview>
    >({}),
    [drag, setDrag] = useState(false),
    [page, setPage] = useState(1),
    [sort, setSort] = useState<"name" | "experience" | "company">("name");
  const previewUrls = useRef<Record<string, DocumentPreview>>({});
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      Object.values(previewUrls.current).forEach((item) =>
        URL.revokeObjectURL(item.url)
      );
    },
    []
  );
  const current = rows.find((x) => x.id === selected) ?? null;
  const filtered = useMemo(
    () =>
      filterCandidates(
        rows,
        query,
        min ? Number(min) : null,
        status,
        skill
      ).sort((a, b) => {
        const av =
          sort === "name"
            ? a.name ?? ""
            : sort === "company"
            ? a.companies[0] ?? ""
            : String(a.totalExperienceYears ?? -1).padStart(4, "0");
        const bv =
          sort === "name"
            ? b.name ?? ""
            : sort === "company"
            ? b.companies[0] ?? ""
            : String(b.totalExperienceYears ?? -1).padStart(4, "0");
        return av.localeCompare(bv);
      }),
    [rows, query, min, status, skill, sort]
  );
  const groups = useMemo(() => {
    const rank = new Map(
      filtered.map((candidate, index) => [candidate.id, index] as const)
    );
    return groupCandidates(rows)
      .map((group) => {
        const versions = [...group.versions].sort(
          (a, b) =>
            profileDataScore(b) - profileDataScore(a) ||
            b.createdAt.localeCompare(a.createdAt)
        );
        return {
          ...group,
          versions,
          primary: versions[0],
          rank: Math.min(
            ...versions.map((version) => rank.get(version.id) ?? Infinity)
          ),
        };
      })
      .filter((group) => Number.isFinite(group.rank))
      .sort((a, b) => a.rank - b.rank);
  }, [rows, filtered]);
  const pageCount = Math.max(1, Math.ceil(groups.length / 6));
  const safePage = Math.min(page, pageCount);
  const visible = groups.slice((safePage - 1) * 6, safePage * 6);
  const duplicateGroup =
    groups.find((group) => group.key === duplicateGroupId) ?? null;
  const process = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const existing = [...rows];
      let parsedCount = 0,
        failedCount = 0;
      const errors: string[] = [];
      const newJobs = list.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        state: "Waiting" as const,
      }));
      setJobs((x) => [...newJobs, ...x].slice(0, 24));
      for (let i = 0; i < list.length; i++) {
        const f = list[i],
          job = newJobs[i];
        const update = (state: Job["state"], error?: string) =>
          setJobs((x) =>
            x.map((j) => (j.id === job.id ? { ...j, state, error } : j))
          );
        try {
          const issue = await validateFile(f);
          if (issue) throw new Error(issue);
          update("Extracting text");
          const text = await extractText(f);
          if (text.replace(/\s/g, "").length < 40)
            throw new Error("No readable resume text found.");
          update("Parsing candidate information");
          const parsed = parseResume(text, f.name);
          const missing = missingRequiredResumeFields(parsed);
          if (missing.length)
            throw new Error(
              `Not counted as a resume. Missing required information: ${missing.join(
                ", "
              )}.`
            );
          const source = (
            f as File & {
              mailSource?: {
                email: string;
                subject: string;
                receivedAt: string;
              };
            }
          ).mailSource;
          let candidate: CandidateProfile = {
            ...parsed,
            sourceEmail: source?.email || null,
            sourceSubject: source?.subject || null,
            sourceReceivedAt: source?.receivedAt || null,
          };
          const duplicate = duplicateOf(candidate, existing);
          if (duplicate) {
            candidate = {
              ...candidate,
              status: "needs_review",
              extractionWarnings: [
                ...candidate.extractionWarnings,
                `Possible duplicate of ${
                  duplicate.name ?? duplicate.originalFileName
                }.`,
              ],
            };
          }
          existing.unshift(candidate);
          const mimeType =
            f.type ||
            (f.name.toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          const documentPreview = {
            url: URL.createObjectURL(f),
            name: f.name,
            mimeType,
            text,
          };
          previewUrls.current = {
            ...previewUrls.current,
            [candidate.id]: documentPreview,
          };
          setDocumentPreviews({ ...previewUrls.current });
          setRows((x) => [candidate, ...x]);
          parsedCount++;
          update(
            candidate.status === "needs_review" ? "Needs review" : "Completed"
          );
        } catch (e) {
          failedCount++;
          const reason =
            e instanceof Error ? e.message : "Could not parse this document.";
          errors.push(`${f.name}: ${reason}`);
          update("Failed", reason);
        }
      }
      return { parsed: parsedCount, failed: failedCount, errors };
    },
    [rows]
  );
  const edit = (field: keyof CandidateProfile, value: unknown) => {
    if (!current) return;
    setRows((rs) =>
      rs.map((r) =>
        r.id === current.id
          ? ({
              ...r,
              [field]: value,
              manuallyEditedFields: [
                ...new Set([...r.manuallyEditedFields, String(field)]),
              ],
            } as CandidateProfile)
          : r
      )
    );
  };
  const editRole = (index: number, key: string, value: unknown) => {
    if (!current) return;
    const experience = current.experience.map((role, i) =>
      i === index
        ? {
            ...role,
            [key]: value,
            ...(key === "endDate" ? { isCurrent: value === null } : {}),
          }
        : role
    );
    setRows((rs) =>
      rs.map((r) =>
        r.id === current.id
          ? {
              ...r,
              experience,
              companies: [
                ...new Set(
                  experience.flatMap((x) => (x.company ? [x.company] : []))
                ),
              ],
              jobTitles: [
                ...new Set(
                  experience.flatMap((x) => (x.jobTitle ? [x.jobTitle] : []))
                ),
              ],
              manuallyEditedFields: [
                ...new Set([...r.manuallyEditedFields, "experience"]),
              ],
            }
          : r
      )
    );
  };
  const editEducation = (index: number, key: string, value: unknown) => {
    if (!current) return;
    edit(
      "education",
      current.education.map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      )
    );
  };
  const download = (name: string, data: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const deleteCandidate = (id: string) => {
    const stored = previewUrls.current[id];
    if (stored) {
      URL.revokeObjectURL(stored.url);
      const next = { ...previewUrls.current };
      delete next[id];
      previewUrls.current = next;
      setDocumentPreviews(next);
    }
    setRows((x) => x.filter((r) => r.id !== id));
    if (selected === id) setSelected(null);
    if (preview === stored) setPreview(null);
  };
  const clearSession = () => {
    Object.values(previewUrls.current).forEach((item) =>
      URL.revokeObjectURL(item.url)
    );
    previewUrls.current = {};
    setDocumentPreviews({});
    setRows([]);
    setJobs([]);
    setSelected(null);
    setPreview(null);
  };
  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">
            <FileText size={18} />
          </div>
          <div>
            <b>HR Resume Manager</b>
            <small>Recruiting workspace</small>
          </div>
        </div>
        <div className="topbar-actions">
          {jobs.length > 0 && (
            <button
              className="activity-trigger"
              onClick={() => setActivityOpen(true)}
            >
              <span className="activity-icon">
                <Activity size={15} />
              </span>
              Activity<b>{jobs.length}</b>
              <i />
            </button>
          )}
          <div
            className={`nav-action-center ${actionCenterOpen ? "open" : ""}`}
          >
            <button
              className="action-center-toggle"
              aria-expanded={actionCenterOpen}
              onClick={() => setActionCenterOpen((v) => !v)}
            >
              <Menu size={16} />
              Actions
            </button>
            <div className="action-center-popover">
              <ShortlistPanel
                candidates={rows}
                onSelect={setSelected}
                disabled={
                  !rows.length ||
                  gmailScanning ||
                  jobs.some(
                    (j) =>
                      j.state === "Waiting" ||
                      j.state === "Extracting text" ||
                      j.state === "Parsing candidate information"
                  )
                }
                variant="nav"
              />
              <button
                type="button"
                className={`nav-upload-button ${drag ? "drag" : ""}`}
                onClick={() => {
                  setActionCenterOpen(false);
                  input.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  setActionCenterOpen(false);
                  void process(e.dataTransfer.files);
                }}
                title="Drop PDF or DOCX here · up to 10 MB each"
              >
                <span className="nav-upload-icon">
                  <Upload size={16} />
                </span>
                <span>
                  <b>Add resumes</b>
                  <small>Drop PDF or DOCX · up to 10 MB each</small>
                </span>
              </button>
            </div>
          </div>
          <input
            ref={input}
            hidden
            type="file"
            multiple
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              if (e.target.files) void process(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="avatar">HR</div>
        </div>
      </header>
      <div className="content">
        <div className="heading">
          <div>
            <div className="eyebrow">TALENT OPERATIONS</div>
            <h1>Candidate workspace</h1>
            <p>
              Parse resumes, review profiles, and build a focused shortlist.
            </p>
          </div>
          <button
            className="btn secondary"
            onClick={() =>
              download(
                "candidates.csv",
                candidatesToCsv(rows),
                "text/csv;charset=utf-8"
              )
            }
            disabled={!rows.length}
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
        <GmailScanPanel
          onFiles={(files) => process(files)}
          onScanStateChange={setGmailScanning}
        />

        <StatsCards candidates={rows} />
        <section className="candidate-section">
          <div className="section-head">
            <div>
              <h2>
                Candidates <span className="count">{groups.length}</span>
              </h2>
              <p>Review and manage extracted candidate profiles.</p>
            </div>
            <div className="table-actions">
              <button
                className="btn small secondary"
                onClick={clearSession}
                disabled={!rows.length}
              >
                <Trash2 size={14} /> Clear session
              </button>
            </div>
          </div>
          <CandidateFilters
            query={query}
            status={status}
            minExperience={min}
            skill={skill}
            sort={sort}
            skills={[...new Set(rows.flatMap((row) => row.skills))].sort()}
            onQueryChange={setQuery}
            onStatusChange={setStatus}
            onMinExperienceChange={setMin}
            onSkillChange={setSkill}
            onSortChange={setSort}
          />
          <div className="candidate-grid grid grid-cols-1 gap-[14px] min-[761px]:grid-cols-2 min-[1101px]:grid-cols-3">
            {visible.map(({ primary, versions, key }, index) => (
              <CandidateCard
                key={key}
                candidate={primary}
                versions={versions}
                groupKey={key}
                index={index}
                hasDocument={Boolean(documentPreviews[primary.id])}
                onPreview={(id) => {
                  const source = documentPreviews[id];
                  if (source) setPreview(source);
                }}
                onExport={(candidate) =>
                  download(
                    `${(candidate.name ?? "candidate").toLowerCase().replace(/\s+/g, "-")}.json`,
                    JSON.stringify(candidate, null, 2),
                    "application/json"
                  )
                }
                onOpenProfile={setSelected}
                onSeeVersions={setDuplicateGroupId}
              />
            ))}
            {!visible.length && (
              <div className="empty">
                <div className="empty-icon">
                  <Users size={22} />
                </div>
                <b>
                  {rows.length
                    ? "No candidates match your filters"
                    : "No candidates yet"}
                </b>
                <p>
                  {rows.length
                    ? "Try adjusting your search or filters."
                    : "Upload resumes or scan Gmail to create candidate profiles."}
                </p>
              </div>
            )}
          </div>
          <CandidatePagination
            page={safePage}
            pageCount={pageCount}
            total={groups.length}
            pageSize={6}
            onPageChange={setPage}
          />
        </section>
        <footer>
          HR Resume Manager <span>•</span> Browser-based extraction{" "}
          <span className="footer-right">Your data stays on this device</span>
        </footer>
      </div>
      {duplicateGroup && (
        <DuplicateVersionsDrawer
          group={duplicateGroup}
          documents={documentPreviews}
          onClose={() => setDuplicateGroupId(null)}
          onPreview={(document) => {
            setPreview(document);
            setDuplicateGroupId(null);
          }}
          onOpenProfile={(id) => {
            setSelected(id);
            setDuplicateGroupId(null);
          }}
        />
      )}
      {activityOpen && (
        <ActivityDrawer
          jobs={jobs}
          onClose={() => setActivityOpen(false)}
          onClear={() => setJobs([])}
        />
      )}
      {preview && (
        <DocumentPreviewOverlay
          preview={preview}
          onClose={() => setPreview(null)}
        />
      )}
      {current && (
        <CandidateProfileDrawer
          candidate={current}
          onClose={() => setSelected(null)}
          onDelete={deleteCandidate}
          onEdit={edit}
          onEditRole={editRole}
          onEditEducation={editEducation}
          onExport={(candidate) =>
            download(
              `${(candidate.name ?? "candidate").toLowerCase().replace(/\s+/g, "-")}.json`,
              JSON.stringify(candidate, null, 2),
              "application/json"
            )
          }
        />
      )}
    </main>
  );
}
