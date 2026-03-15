export default function SettingsLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-pulse">
      {/* Page title */}
      <div className="h-8 w-28 bg-border/50 rounded-lg mb-8" />

      <div className="space-y-5">
        {/* API Key card */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5 space-y-2">
            <div className="h-4 w-24 bg-border/50 rounded" />
            <div className="h-3.5 w-72 bg-border/50 rounded" />
          </div>
          <div className="h-11 w-full bg-border/50 rounded-lg" />
          <div className="h-3 w-56 bg-border/50 rounded mt-2" />
        </div>

        {/* Google Calendar card */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5 space-y-2">
            <div className="h-4 w-32 bg-border/50 rounded" />
            <div className="h-3.5 w-64 bg-border/50 rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-3.5 w-44 bg-border/50 rounded" />
              <div className="h-3 w-56 bg-border/50 rounded" />
            </div>
            <div className="h-5 w-24 bg-border/50 rounded-full" />
          </div>
        </div>

        {/* Twilio card */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5 space-y-2">
            <div className="h-4 w-16 bg-border/50 rounded" />
            <div className="h-3.5 w-72 bg-border/50 rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-3.5 w-40 bg-border/50 rounded" />
              <div className="h-3 w-60 bg-border/50 rounded" />
            </div>
            <div className="h-5 w-24 bg-border/50 rounded-full" />
          </div>
        </div>

        {/* Account card */}
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="mb-5 space-y-2">
            <div className="h-4 w-20 bg-border/50 rounded" />
            <div className="h-3.5 w-36 bg-border/50 rounded" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-3.5 w-12 bg-border/50 rounded" />
                <div className="h-3.5 w-40 bg-border/50 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
