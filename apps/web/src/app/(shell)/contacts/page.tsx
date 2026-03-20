import { getSession } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@voicecraft/db'
import { ContactsClient } from '@/components/contacts/ContactsClient'
import type { ContactCardData } from '@/components/contacts/ContactCard'

export const metadata = { title: 'Contacts' }

export default async function ContactsPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  // Fetch the first page and total on the server for instant hydration.
  const PAGE_SIZE = 20

  const [rawContacts, total] = await Promise.all([
    prisma.contact.findMany({
      where: { userId },
      orderBy: [
        { lastCalledAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: PAGE_SIZE + 1,
    }),
    prisma.contact.count({ where: { userId } }),
  ])

  const hasMore = rawContacts.length > PAGE_SIZE
  const pageContacts = hasMore ? rawContacts.slice(0, PAGE_SIZE) : rawContacts
  const lastContact = pageContacts[pageContacts.length - 1]
  const nextCursor = hasMore && lastContact ? lastContact.id : null

  // Fetch appointment counts for this page.
  const phones = pageContacts
    .map((c) => c.phone)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)

  const appointmentCounts =
    phones.length > 0
      ? await prisma.appointment.groupBy({
          by: ['patientPhone'],
          where: {
            patientPhone: { in: phones },
            agent: { userId },
          },
          _count: { id: true },
        })
      : []

  const appointmentCountByPhone = new Map<string, number>(
    appointmentCounts.map((row) => [row.patientPhone ?? '', row._count.id])
  )

  const contacts: ContactCardData[] = pageContacts.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    email: c.email,
    notes: c.notes,
    callCount: c.callCount,
    lastCalledAt: c.lastCalledAt?.toISOString() ?? null,
    appointmentCount: appointmentCountByPhone.get(c.phone) ?? 0,
  }))

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">Contacts</h1>
        <p className="text-sm text-muted mt-1">
          {total === 0
            ? 'No contacts yet'
            : total === 1
              ? '1 contact'
              : `${total.toLocaleString()} contacts`}
        </p>
      </div>

      <ContactsClient
        initialContacts={contacts}
        initialTotal={total}
        initialNextCursor={nextCursor}
      />
    </div>
  )
}
