import { Briefcase, CheckCircle2, Users } from "lucide-react";
import type { CandidateProfile } from "@/types/candidate";

type StatsCardsProps = {
  candidates: CandidateProfile[];
};

export default function StatsCards({ candidates }: StatsCardsProps) {
  const needsReview = candidates.filter(
    (candidate) => candidate.status === "needs_review"
  ).length;
  const averageExperience = candidates.length
    ? (
        candidates.reduce(
          (sum, candidate) => sum + (candidate.totalExperienceYears ?? 0),
          0
        ) / candidates.length
      ).toFixed(1)
    : "—";

  return (
    <section className="stats grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="Candidate statistics">
      <article className="stat">
        <div className="stat-icon lavender">
          <Users size={18} />
        </div>
        <div>
          <small>Profiles parsed</small>
          <b>{candidates.length}</b>
        </div>
        <span className="stat-note">in this session</span>
      </article>
      <article className="stat">
        <div className="stat-icon green">
          <CheckCircle2 size={18} />
        </div>
        <div>
          <small>Ready to review</small>
          <b>{needsReview}</b>
        </div>
        <span className="stat-note">need attention</span>
      </article>
      <article className="stat">
        <div className="stat-icon peach">
          <Briefcase size={18} />
        </div>
        <div>
          <small>Avg. experience</small>
          <b>
            {averageExperience}
            <em> yrs</em>
          </b>
        </div>
        <span className="stat-note">calculated from roles</span>
      </article>
    </section>
  );
}
