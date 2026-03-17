export default function ContactsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-pulse">
      <div className="h-8 w-32 bg-border/50 rounded-lg mb-2" />
      <div className="h-4 w-20 bg-border/50 rounded mb-8" />

      <div className="h-10 w-full bg-border/50 rounded-lg mb-6" />

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-5 h-28" />
        ))}
      </div>
    </div>
  )
}
