import { auth } from '@/auth'
import { TopBar } from '@/components/layout/TopBar'

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        userName={session?.user?.name}
        userEmail={session?.user?.email}
      />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
