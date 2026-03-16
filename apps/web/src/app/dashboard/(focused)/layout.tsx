export default function FocusedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen bg-cream">
      {children}
    </div>
  )
}
