export default function NewAgentLoading() {
  return (
    <div className="flex flex-col h-screen">
      <div className="bg-white border-b border-border h-14 flex-shrink-0" />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    </div>
  )
}
