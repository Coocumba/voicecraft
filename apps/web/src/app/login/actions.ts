"use server"

import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { EmailNotVerifiedError } from "@/auth"

export async function authenticate(
  prevState: { error: string } | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/voice-agents",
    })
  } catch (error) {
    if (error instanceof EmailNotVerifiedError) {
      return { error: "EMAIL_NOT_VERIFIED" }
    }
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." }
        default:
          return { error: "Something went wrong." }
      }
    }
    throw error
  }
}
