export default function VoiceAgentsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div className="h-8 w-36 bg-border/50 rounded-lg" />
        <div className="h-9 w-28 bg-border/50 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-6 h-36" />
        ))}
      </div>
    </div>
  )
}
