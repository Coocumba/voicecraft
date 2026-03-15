export default function AgentsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      {/* Header row */}
      <div className="flex items-center justify-between mb-8">
        <div className="h-8 w-36 bg-border/50 rounded-lg" />
        <div className="h-9 w-28 bg-border/50 rounded-lg" />
      </div>

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 space-y-2 min-w-0 pr-3">
                <div className="h-4 w-40 bg-border/50 rounded" />
                <div className="h-3 w-28 bg-border/50 rounded" />
              </div>
              <div className="h-5 w-16 bg-border/50 rounded-full flex-shrink-0" />
            </div>
            <div className="h-3 w-24 bg-border/50 rounded mt-4" />
          </div>
        ))}
      </div>
    </div>
  )
}
