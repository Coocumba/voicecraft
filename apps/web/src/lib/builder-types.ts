export interface DayHours {
  open: string
  close: string
}

export interface ServiceItem {
  name: string
  duration: number
  price: number
}

export interface VoicePreference {
  gender?: 'male' | 'female'
  style?: string
}

export interface AgentConfig {
  business_name?: string
  hours?: Record<string, DayHours | null>
  services?: ServiceItem[]
  tone?: string
  language?: string
  greeting?: string
  escalation_rules?: string[]
  voice?: VoicePreference
}
