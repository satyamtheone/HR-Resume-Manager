type CandidatePaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export default function CandidatePagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: CandidatePaginationProps) {
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="table-footer flex flex-wrap items-center justify-between gap-3">
      <span>
        Showing <b>{first}–{last}</b> of <b>{total}</b> candidate records <span>•</span> Session only
      </span>
      <nav className="pagination flex items-center gap-2" aria-label="Candidate pages">
        <button disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          Previous
        </button>
        <span aria-current="page">{page} / {pageCount}</span>
        <button disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>
          Next
        </button>
      </nav>
    </div>
  );
}
