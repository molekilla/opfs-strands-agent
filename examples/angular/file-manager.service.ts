/**
 * FileAgentService — Angular 21 injectable service
 *
 * Wraps the OPFS-backed Strands Agent in an Angular service that uses signals
 * for reactive state. Inject it into any standalone component.
 *
 * Setup
 * ─────
 * npm install @strands-agents/sdk opfs-worker zod
 *
 * The service is provided in the root injector; no module configuration needed.
 * AWS credentials for the default Bedrock provider must be available, or pass
 * a custom model via the `initialize()` method.
 */

import {
  Injectable,
  signal,
  computed,
  OnDestroy,
} from '@angular/core'
import { Agent, type AgentConfig, ModelStreamUpdateEvent } from '@strands-agents/sdk'
import { createWorker } from 'opfs-worker'
import { createOpfsTools } from '../../src/tools/opfs-tools.ts'

export type AgentStatus = 'idle' | 'initialising' | 'ready' | 'busy' | 'error'

@Injectable({ providedIn: 'root' })
export class FileAgentService implements OnDestroy {
  // ── reactive state ─────────────────────────────────────────────────────────

  private readonly _status  = signal<AgentStatus>('idle')
  private readonly _lines   = signal<string[]>([])
  private readonly _error   = signal<string | null>(null)

  /** Current lifecycle status. */
  readonly status  = this._status.asReadonly()
  /** Output lines from the latest invocation. */
  readonly lines   = this._lines.asReadonly()
  /** Error message (non-null when status === 'error'). */
  readonly error   = this._error.asReadonly()
  /** True while the agent is processing a request. */
  readonly isBusy  = computed(() => this._status() === 'busy')
  /** True once the agent is fully initialised and idle. */
  readonly isReady = computed(() => this._status() === 'ready')

  private agent: Agent | null = null

  // ── initialisation ─────────────────────────────────────────────────────────

  /**
   * Initialise the OPFS worker and build the Strands Agent.
   * Call once, e.g. in the root component's constructor or ngOnInit.
   *
   * @param model Optional custom model (BedrockModel instance or model ID string).
   */
  async initialize(model?: AgentConfig['model']): Promise<void> {
    if (this._status() !== 'idle') return
    this._status.set('initialising')
    this._error.set(null)

    try {
      const fs    = await createWorker({ root: '/' })
      const tools = createOpfsTools(fs)

      this.agent = new Agent({
        systemPrompt:
          'You are a helpful file management assistant with access to an Origin Private File System stored in the browser. Use the available tools to fulfil every file operation request. All paths are absolute and start with "/".',
        tools: [...tools],
        printer: false,
        ...(model ? { model } : {}),
      })

      this._status.set('ready')
    } catch (err) {
      this._error.set(String(err))
      this._status.set('error')
    }
  }

  // ── invocation ─────────────────────────────────────────────────────────────

  /**
   * Send a natural-language prompt to the agent.
   * The `lines` signal is updated incrementally as the model streams its reply.
   */
  async invoke(prompt: string): Promise<void> {
    if (!this.agent || this._status() !== 'ready') return
    this._status.set('busy')
    this._lines.set([])

    try {
      for await (const event of this.agent.stream(prompt)) {
        if (
          event instanceof ModelStreamUpdateEvent &&
          event.event.type === 'modelContentBlockDeltaEvent' &&
          event.event.delta.type === 'textDelta'
        ) {
          const chunk: string = event.event.delta.text
          this._lines.update((prev) => {
            const last = prev[prev.length - 1] ?? ''
            const [head, ...rest] = (last + chunk).split('\n')
            return [...prev.slice(0, -1), head, ...rest]
          })
        }
      }
    } catch (err) {
      this._error.set(String(err))
      this._status.set('error')
      return
    }

    this._status.set('ready')
  }

  /** Clear the output buffer. */
  clearLines(): void {
    this._lines.set([])
  }

  // ── cleanup ────────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.agent = null
  }
}
