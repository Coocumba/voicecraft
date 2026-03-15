import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { SignOutButton } from "@/components/auth/SignOutButton"

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <main className="p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-2xl sm:text-3xl text-ink">
            Dashboard
          </h1>
          <SignOutButton />
        </div>

        <div className="bg-white rounded-xl border border-border p-6">
          <p className="text-sm text-muted mb-1">Signed in as</p>
          <p className="font-medium text-ink">{session.user?.name}</p>
          <p className="text-sm text-muted mt-0.5">{session.user?.email}</p>
        </div>
      </div>
    </main>
  )
}
