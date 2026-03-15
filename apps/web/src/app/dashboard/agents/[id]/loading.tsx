export default function AgentDetailLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-48 bg-border/50 rounded-lg" />
            <div className="h-5 w-16 bg-border/50 rounded-full" />
          </div>
          <div className="h-3.5 w-32 bg-border/50 rounded" />
          <div className="h-3 w-24 bg-border/50 rounded" />
        </div>
        <div className="h-9 w-24 bg-border/50 rounded-lg flex-shrink-0" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5">
            <div className="h-3 w-20 bg-border/50 rounded mb-3" />
            <div className="h-9 w-12 bg-border/50 rounded" />
          </div>
        ))}
      </div>

      {/* Configuration section */}
      <div className="mb-8">
        <div className="h-6 w-28 bg-border/50 rounded mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Greeting — full width */}
          <div className="bg-white rounded-xl border border-border p-5 md:col-span-2">
            <div className="h-3 w-16 bg-border/50 rounded mb-3" />
            <div className="h-4 w-full bg-border/50 rounded" />
            <div className="h-4 w-3/4 bg-border/50 rounded mt-2" />
          </div>
          {/* Details card */}
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="h-3 w-14 bg-border/50 rounded mb-3" />
            <div className="space-y-2.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-3.5 w-16 bg-border/50 rounded" />
                  <div className="h-3.5 w-20 bg-border/50 rounded" />
                </div>
              ))}
            </div>
          </div>
          {/* Services card */}
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="h-3 w-16 bg-border/50 rounded mb-3" />
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-3.5 w-24 bg-border/50 rounded" />
                  <div className="h-3.5 w-20 bg-border/50 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Call history section */}
      <div>
        <div className="h-6 w-28 bg-border/50 rounded mb-4" />
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Table head */}
          <div className="flex gap-4 px-5 py-3 border-b border-border">
            {['w-24', 'w-20', 'w-16', 'w-16'].map((w, i) => (
              <div key={i} className={`h-3 ${w} bg-border/50 rounded`} />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 px-5 py-4 border-b border-border last:border-0"
            >
              <div className="h-3.5 w-32 bg-border/50 rounded" />
              <div className="h-3.5 w-24 bg-border/50 rounded" />
              <div className="h-3.5 w-14 bg-border/50 rounded" />
              <div className="h-5 w-20 bg-border/50 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
