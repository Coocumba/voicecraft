export default function FocusedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen bg-cream overflow-hidden">
      {children}
    </div>
  )
}
