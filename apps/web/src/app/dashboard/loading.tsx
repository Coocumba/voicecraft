export default function DashboardLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      {/* Page title */}
      <div className="h-8 w-32 bg-border/50 rounded-lg mb-8" />

      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-6">
            <div className="h-3 w-24 bg-border/50 rounded mb-3" />
            <div className="h-9 w-16 bg-border/50 rounded" />
          </div>
        ))}
      </div>

      {/* Recent activity section */}
      <div className="h-5 w-36 bg-border/50 rounded mb-4" />
      <div className="bg-white rounded-xl border border-border divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-4 gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 bg-border/50 rounded" />
              <div className="h-3 w-28 bg-border/50 rounded" />
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="h-5 w-20 bg-border/50 rounded-full" />
              <div className="h-3 w-16 bg-border/50 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
