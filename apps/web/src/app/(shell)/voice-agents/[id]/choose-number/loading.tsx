export default function ChooseNumberLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      <div className="h-4 w-32 bg-border/50 rounded mb-4" />
      <div className="h-9 w-72 bg-border/50 rounded-lg mb-2" />
      <div className="h-5 w-96 bg-border/50 rounded mb-8" />

      {/* Search filters skeleton */}
      <div className="flex flex-wrap gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 w-40 bg-border/50 rounded-lg" />
        ))}
        <div className="h-10 w-24 bg-border/50 rounded-lg" />
      </div>

      {/* Results grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 h-24" />
        ))}
      </div>
    </div>
  )
}
