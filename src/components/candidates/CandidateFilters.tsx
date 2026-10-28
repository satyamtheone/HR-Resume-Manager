import { ChevronDown, Filter, Search, X } from "lucide-react";

type CandidateFiltersProps = {
  query: string;
  status: string;
  minExperience: string;
  skill: string;
  sort: "name" | "experience" | "company";
  skills: string[];
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onMinExperienceChange: (value: string) => void;
  onSkillChange: (value: string) => void;
  onSortChange: (value: "name" | "experience" | "company") => void;
};

export default function CandidateFilters({
  query,
  status,
  minExperience,
  skill,
  sort,
  skills,
  onQueryChange,
  onStatusChange,
  onMinExperienceChange,
  onSkillChange,
  onSortChange,
}: CandidateFiltersProps) {
  return (
    <div className="filters flex flex-wrap items-center gap-2">
      <label className="search min-w-[220px] flex-1">
        <Search size={16} />
        <input
          placeholder="Search name, email, company, skill..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => onQueryChange("")}>
            <X size={14} />
          </button>
        )}
      </label>
      <Select label="Candidate status" value={status} onChange={onStatusChange}>
        <option value="all">All statuses</option>
        <option value="completed">Completed</option>
        <option value="needs_review">Needs review</option>
      </Select>
      <Select label="Minimum experience" value={minExperience} onChange={onMinExperienceChange}>
        <option value="">Any experience</option>
        <option value="1">1+ years</option>
        <option value="3">3+ years</option>
        <option value="5">5+ years</option>
        <option value="8">8+ years</option>
      </Select>
      <Select label="Filter by skill" value={skill} onChange={onSkillChange}>
        <option value="">All skills</option>
        {skills.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
      <Select
        label="Sort candidates"
        value={sort}
        onChange={(value) => onSortChange(value as CandidateFiltersProps["sort"])}
      >
        <option value="name">Sort: name</option>
        <option value="experience">Sort: experience</option>
        <option value="company">Sort: company</option>
      </Select>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="select-wrap">
      {label === "Candidate status" && <Filter size={15} />}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}
