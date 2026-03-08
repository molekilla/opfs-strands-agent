/**
 * useFileAgent — React 19 custom hook
 *
 * Manages the full lifecycle of an OPFS-backed Strands Agent:
 *   - initialises opfs-worker and builds the OPFS tools on mount
 *   - exposes `invoke(prompt)` to send natural-language requests
 *   - returns streaming lines so the UI can render incrementally
 *   - cleans up on unmount
 *
 * Setup
 * ─────
 * npm install @strands-agents/sdk opfs-worker zod
 * npm install react@^19  (peer dep — already in your React project)
 *
 * AWS credentials (for default Bedrock model) must be configured before the
 * app loads, or pass a custom `model` option (see agent.ts for examples).
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type RefObject,
} from 'react'
import { Agent, type AgentConfig, ModelStreamUpdateEvent } from '@strands-agents/sdk'
import { createWorker } from 'opfs-worker'
import { createOpfsTools } from '../../src/tools/opfs-tools.ts'

// ─── types ────────────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'initialising' | 'ready' | 'busy' | 'error'

export interface FileAgentState {
  /** Current lifecycle status of the agent. */
  status: AgentStatus
  /** Output lines accumulated from the most recent invocation. */
  lines: string[]
  /** Error message if status === 'error'. */
  error: string | null
  /** Send a natural-language prompt to the agent. */
  invoke: (prompt: string) => Promise<void>
  /** Clear the output lines buffer. */
  clearLines: () => void
  /** Direct ref to the Agent instance (null while not ready). */
  agentRef: RefObject<Agent | null>
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useFileAgent(options?: {
  /** Optional custom model to use instead of the default Bedrock model. */
  model?: AgentConfig['model']
}): FileAgentState {
  const agentRef = useRef<Agent | null>(null)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Initialise once on mount
  useEffect(() => {
    let cancelled = false

    async function init() {
      setStatus('initialising')
      try {
        const fs = await createWorker({ root: '/' })
        const tools = createOpfsTools(fs)

        agentRef.current = new Agent({
          systemPrompt:
            'You are a helpful file management assistant with access to an Origin Private File System stored in the browser. Use the available tools to fulfil every file operation request. All paths are absolute and start with "/".',
          tools: [...tools],
          printer: false, // we handle output ourselves
          ...(options?.model ? { model: options.model } : {}),
        })

        if (!cancelled) setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          setError(String(err))
          setStatus('error')
        }
      }
    }

    void init()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const invoke = useCallback(async (prompt: string) => {
    if (!agentRef.current || status !== 'ready') return
    setStatus('busy')
    setLines([])

    try {
      // stream() yields AgentStreamEvents; extract text deltas for display
      for await (const event of agentRef.current.stream(prompt)) {
        if (
          event instanceof ModelStreamUpdateEvent &&
          event.event.type === 'modelContentBlockDeltaEvent' &&
          event.event.delta.type === 'textDelta'
        ) {
          setLines((prev) => {
            const last = prev[prev.length - 1] ?? ''
            const chunk: string = event.event.type === 'modelContentBlockDeltaEvent' &&
              event.event.delta.type === 'textDelta'
              ? event.event.delta.text
              : ''
            // Split on newlines so each line is its own array entry
            const [head, ...rest] = (last + chunk).split('\n')
            return [...prev.slice(0, -1), head, ...rest]
          })
        }
      }
    } catch (err) {
      setError(String(err))
      setStatus('error')
      return
    }

    setStatus('ready')
  }, [status])

  const clearLines = useCallback(() => setLines([]), [])

  return { status, lines, error, invoke, clearLines, agentRef }
}
