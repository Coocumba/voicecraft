export default function AppointmentsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-40 bg-border/50 rounded-lg mb-2" />
      <div className="h-4 w-24 bg-border/50 rounded mb-8" />

      <div className="grid grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 h-20" />
        ))}
      </div>

      <div className="flex gap-3 mb-6">
        <div className="h-9 w-32 bg-border/50 rounded-lg" />
        <div className="h-9 w-64 bg-border/50 rounded-lg" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 h-24" />
        ))}
      </div>
    </div>
  )
}
