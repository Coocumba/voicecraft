export default function AgentDetailLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      <div className="h-4 w-24 bg-border/50 rounded mb-4" />
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="space-y-2">
          <div className="h-9 w-64 bg-border/50 rounded-lg" />
          <div className="h-4 w-40 bg-border/50 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-border/50 rounded-lg" />
          <div className="h-9 w-28 bg-border/50 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 h-24" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-border h-64" />
    </div>
  )
}
