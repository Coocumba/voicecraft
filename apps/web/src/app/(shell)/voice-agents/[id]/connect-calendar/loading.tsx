export default function ConnectCalendarLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] animate-pulse">
      <div className="max-w-lg w-full text-center space-y-4">
        <div className="h-8 w-64 bg-border/50 rounded-lg mx-auto" />
        <div className="h-5 w-96 bg-border/50 rounded mx-auto" />
        <div className="h-10 w-48 bg-border/50 rounded-lg mx-auto mt-6" />
      </div>
    </div>
  )
}
