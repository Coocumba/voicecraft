'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { Room as RoomType } from 'livekit-client'
import { cn } from '@/lib/utils'

interface AgentInfo {
  id: string
  name: string
  businessName: string
  status: string
}

interface TestCallClientProps {
  agent: AgentInfo
}

type CallState = 'idle' | 'connecting' | 'connected' | 'ended'

interface TokenResponse {
  token: string
  roomName: string
  livekitUrl: string
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const Waveform = memo(function Waveform({ active }: { active: boolean }) {
  const bars = [0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.45, 0.75, 0.55]
  return (
    <div className="flex items-center justify-center gap-1 h-10" aria-hidden="true">
      {bars.map((scale, i) => (
        <div
          key={i}
          className={cn(
            'w-1 rounded-full transition-all',
            active ? 'bg-green-400 animate-pulse' : 'bg-border'
          )}
          style={{
            height: active ? `${scale * 40}px` : '4px',
            animationDelay: active ? `${i * 80}ms` : '0ms',
            animationDuration: active ? `${600 + i * 60}ms` : '0ms',
          }}
        />
      ))}
    </div>
  )
})

export function TestCallClient({ agent }: TestCallClientProps) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [muted, setMuted] = useState(false)
  const [finalDuration, setFinalDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Refs so handleStart can read current values without being in its dep array
  const callStateRef = useRef(callState)
  const elapsedRef = useRef(elapsed)

  useEffect(() => {
    callStateRef.current = callState
  }, [callState])

  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])

  const roomRef = useRef<RoomType | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const disconnectRoom = useCallback(async () => {
    const room = roomRef.current
    if (room) {
      await room.disconnect()
      roomRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearTimer()
      void disconnectRoom()
    }
  }, [clearTimer, disconnectRoom])

  const handleStart = useCallback(async () => {
    setCallState('connecting')
    setElapsed(0)
    setMuted(false)
    setError(null)

    try {
      // Get a LiveKit token from our API
      const res = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to get token')
      }

      const { token, livekitUrl } = (await res.json()) as TokenResponse

      // Dynamically import livekit-client to keep it out of the initial bundle
      const { Room, RoomEvent, Track, LocalAudioTrack } = await import('livekit-client')

      // Connect to LiveKit room
      const room = new Room()
      roomRef.current = room

      room.on(RoomEvent.Disconnected, () => {
        if (callStateRef.current !== 'ended') {
          setFinalDuration((prev) => prev || elapsedRef.current)
          clearTimer()
          setCallState('ended')
        }
      })

      // Play remote audio (the agent's voice)
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const audioEl = track.attach()
          audioEl.id = 'agent-audio'
          document.body.appendChild(audioEl)
        }
      })

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => el.remove())
        }
      })

      await room.connect(livekitUrl, token)

      // Publish microphone
      await room.localParticipant.setMicrophoneEnabled(true)

      setCallState('connected')
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect'
      setError(message)
      toast.error(message)
      setCallState('idle')
      void disconnectRoom()
    }
  }, [agent.id, clearTimer, disconnectRoom])

  const handleEnd = useCallback(async () => {
    setFinalDuration(elapsedRef.current)
    clearTimer()
    await disconnectRoom()
    setCallState('ended')
  }, [clearTimer, disconnectRoom])

  const handleToggleMute = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const newMuted = !muted
    setMuted(newMuted)

    // Mute/unmute the local microphone track
    const { Track, LocalAudioTrack } = await import('livekit-client')
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
    if (micPub?.track && micPub.track instanceof LocalAudioTrack) {
      if (newMuted) {
        await micPub.mute()
      } else {
        await micPub.unmute()
      }
    }
  }, [muted])

  const handleCallAgain = useCallback(() => {
    setCallState('idle')
    setElapsed(0)
    setFinalDuration(0)
    setMuted(false)
    setError(null)
  }, [])

  return (
    <div className="flex flex-col">
      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-[60vh]">
        {callState === 'idle' && (
          <div className="flex flex-col items-center text-center max-w-sm w-full mx-auto">
            <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mb-6">
              <svg className="w-9 h-9 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            </div>
            <h2 className="font-serif text-2xl text-ink mb-1">{agent.name}</h2>
            {agent.businessName !== agent.name && (
              <p className="text-sm text-muted mb-1">{agent.businessName}</p>
            )}
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium mb-8',
              agent.status === 'ACTIVE' ? 'bg-success/10 text-success' : 'bg-muted/15 text-muted'
            )}>
              {agent.status === 'ACTIVE' ? 'Active' : agent.status === 'INACTIVE' ? 'Inactive' : 'Draft'}
            </span>

            <div className="bg-white rounded-xl border border-border p-5 mb-8 text-left w-full">
              <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">About this test</p>
              <p className="text-sm text-ink leading-relaxed">
                Talk to your agent just like a real phone call. Make sure your microphone is allowed when your browser asks.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-500 mb-4">{error}</p>
            )}

            <button
              onClick={() => void handleStart()}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-8 py-3.5 rounded-full font-medium text-sm transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2Z" />
              </svg>
              Start Test Call
            </button>
          </div>
        )}

        {callState === 'connecting' && (
          <div className="flex flex-col items-center text-center max-w-sm w-full mx-auto">
            <div className="relative mb-8">
              <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-green-300 animate-ping opacity-50" />
            </div>
            <h2 className="font-serif text-xl text-ink mb-2">Connecting…</h2>
            <p className="text-sm text-muted">Reaching {agent.name}</p>
          </div>
        )}

        {callState === 'connected' && (
          <div className="flex flex-col items-center text-center max-w-sm w-full mx-auto">
            <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-green-700">Connected</span>
            </div>
            <div className="w-20 h-20 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center mb-4">
              <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
              </svg>
            </div>
            <h2 className="font-serif text-xl text-ink mb-0.5">{agent.name}</h2>
            {agent.businessName !== agent.name && (
              <p className="text-sm text-muted">{agent.businessName}</p>
            )}
            <p className="font-mono text-3xl font-medium text-ink mb-6 tabular-nums">{formatDuration(elapsed)}</p>
            <div className="mb-8 w-full">
              <Waveform active={!muted} />
              {muted && <p className="text-xs text-muted mt-2">Microphone muted</p>}
            </div>
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => void handleToggleMute()}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
                    muted ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-border/40 text-ink hover:bg-border/70'
                  )}
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {muted ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                    )}
                  </svg>
                </button>
                <span className="text-xs text-muted">{muted ? 'Unmute' : 'Mute'}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => void handleEnd()}
                  aria-label="End call"
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
                >
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2Z" />
                  </svg>
                </button>
                <span className="text-xs text-muted">End Call</span>
              </div>
            </div>
          </div>
        )}

        {callState === 'ended' && (
          <div className="flex flex-col items-center text-center max-w-sm w-full mx-auto">
            <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mb-6">
              <svg className="w-7 h-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2Z" />
              </svg>
            </div>
            <h2 className="font-serif text-xl text-ink mb-2">Call ended</h2>
            <div className="flex items-center gap-2 mb-8">
              <span className="text-sm text-muted">Duration:</span>
              <span className="text-sm font-mono font-medium text-ink tabular-nums">{formatDuration(finalDuration)}</span>
            </div>
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={handleCallAgain}
                className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 rounded-full font-medium text-sm transition-colors"
              >
                Call Again
              </button>
              <Link
                href={`/voice-agents/${agent.id}`}
                className="flex-1 text-center bg-white text-ink px-6 py-2.5 rounded-full font-medium text-sm border border-border hover:bg-cream transition-colors"
              >
                Back to Agent
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
