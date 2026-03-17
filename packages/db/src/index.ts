import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export { PrismaClient } from "@prisma/client"
export { AgentStatus, CallOutcome, AppointmentStatus, ConversationStatus, IntegrationProvider, PhoneNumberStatus } from "@prisma/client"
export type { User, Agent, Call, Appointment, BuilderConversation, Integration, Contact, PhoneNumber, Prisma } from "@prisma/client"
