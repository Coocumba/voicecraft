export default function SettingsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-24 bg-border/50 rounded-lg mb-8" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-6 h-32" />
        ))}
      </div>
    </div>
  )
}
