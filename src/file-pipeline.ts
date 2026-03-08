/**
 * FilePipeline — multi-step agent workflows via OPFS files
 *
 * Implements the pipeline pattern described in:
 *   "Files Are All You Need" (LlamaIndex)
 *   https://www.llamaindex.ai/blog/files-are-all-you-need
 *
 *   "How to Build Agents with Filesystems and Bash" (Vercel)
 *   https://vercel.com/blog/how-to-build-agents-with-filesystems-and-bash
 *
 *   "Why Everyone is Talking About Filesystems" (madalitso.me)
 *   https://madalitso.me/notes/why-everyone-is-talking-about-filesystems/
 *
 * ─── Philosophy ──────────────────────────────────────────────────────────────
 * Each pipeline step is a function that receives the OPFS filesystem and the
 * shared pipeline context (metadata + previous outputs).  Steps communicate
 * exclusively through files — the output of step N is a file that step N+1
 * reads.  This makes every intermediate result:
 *
 *   • Inspectable   — open any file to see what the previous step produced
 *   • Resumable     — re-run from step N without re-running steps 0…N-1
 *   • Composable    — plug steps from different pipelines together
 *   • Debuggable    — failures leave all intermediate files on disk
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *   const pipeline = new FilePipeline(fs, agent)
 *
 *   pipeline
 *     .step('ingest',   async (ctx) => { … ctx.write('raw/doc.txt', text) })
 *     .step('summarise',async (ctx) => {
 *       const text = await ctx.read('raw/doc.txt')
 *       const summary = await ctx.invoke(`Summarise: ${text}`)
 *       await ctx.write('summaries/doc.txt', summary)
 *     })
 *     .step('index',    async (ctx) => { … })
 *
 *   const result = await pipeline.run()
 *   console.log(result.stepResults)
 */

import type { OPFSFileSystem } from 'opfs-worker'
import type { Agent } from '@strands-agents/sdk'

// ─── types ────────────────────────────────────────────────────────────────────

export interface PipelineStepContext {
  /** The pipeline-scoped OPFS root (e.g. '/pipeline/run-abc123'). */
  pipelineRoot: string
  /** Metadata passed in when the pipeline was started. */
  meta: Record<string, unknown>
  /** Results returned by earlier steps, keyed by step name. */
  previousResults: Record<string, string>
  /**
   * Write a file relative to `pipelineRoot`.
   * Path should NOT start with a slash — it is joined to pipelineRoot.
   */
  write: (relativePath: string, content: string) => Promise<void>
  /**
   * Read a file relative to `pipelineRoot`.
   */
  read: (relativePath: string) => Promise<string>
  /**
   * Send a natural-language prompt to the agent and return the full response.
   */
  invoke: (prompt: string) => Promise<string>
}

export interface PipelineStep {
  name: string
  run: (ctx: PipelineStepContext) => Promise<string>
}

export interface PipelineRunResult {
  pipelineRoot: string
  steps: string[]
  stepResults: Record<string, string>
  durationMs: number
  ok: boolean
  error?: string
}

// ─── class ────────────────────────────────────────────────────────────────────

export class FilePipeline {
  private readonly steps: PipelineStep[] = []

  /**
   * @param fs     An initialised OPFSFileSystem from opfs-worker
   * @param agent  A Strands Agent to invoke from pipeline steps
   * @param root   Base OPFS directory for all pipeline runs (default: '/pipelines')
   */
  constructor(
    private readonly fs: OPFSFileSystem,
    private readonly agent: Agent,
    private readonly root = '/pipelines',
  ) {}

  /**
   * Register a named pipeline step.
   *
   * @param name  Unique name for this step (used as the subdirectory name)
   * @param run   Async function that receives a PipelineStepContext and returns
   *              a summary string describing what the step did.
   */
  step(
    name: string,
    run: (ctx: PipelineStepContext) => Promise<string>,
  ): this {
    this.steps.push({ name, run })
    return this
  }

  /**
   * Execute all registered steps in order.
   *
   * Each step runs inside its own subdirectory under `<root>/<runId>/`.
   * Failures in one step abort the pipeline but leave all files on disk.
   *
   * @param meta  Optional metadata to make available to every step via ctx.meta
   */
  async run(meta: Record<string, unknown> = {}): Promise<PipelineRunResult> {
    const runId = `run-${Date.now()}`
    const pipelineRoot = `${this.root}/${runId}`
    const startMs = Date.now()

    await this.fs.mkdir(pipelineRoot, { recursive: true })

    const stepResults: Record<string, string> = {}

    const makeContext = (stepName: string): PipelineStepContext => {
      const stepDir = `${pipelineRoot}/${stepName}`
      return {
        pipelineRoot,
        meta,
        previousResults: { ...stepResults },
        write: async (relativePath, content) => {
          await this.fs.mkdir(stepDir, { recursive: true })
          await this.fs.writeFile(`${stepDir}/${relativePath}`, content)
        },
        read: async (relativePath) => {
          return this.fs.readFile(`${pipelineRoot}/${relativePath}`, 'utf-8')
        },
        invoke: async (prompt) => {
          const result = await this.agent.invoke(prompt)
          return String(result)
        },
      }
    }

    for (const step of this.steps) {
      try {
        const summary = await step.run(makeContext(step.name))
        stepResults[step.name] = summary

        // Write step manifest so the run is fully reconstructible from files
        const manifest = {
          step: step.name,
          completedAt: new Date().toISOString(),
          summary,
        }
        await this.fs.writeFile(
          `${pipelineRoot}/${step.name}/_step.json`,
          JSON.stringify(manifest, null, 2),
        )
      } catch (err) {
        return {
          pipelineRoot,
          steps: this.steps.map((s) => s.name),
          stepResults,
          durationMs: Date.now() - startMs,
          ok: false,
          error: `Step "${step.name}" failed: ${String(err)}`,
        }
      }
    }

    // Write top-level run manifest
    await this.fs.writeFile(
      `${pipelineRoot}/_run.json`,
      JSON.stringify(
        {
          runId,
          steps: this.steps.map((s) => s.name),
          stepResults,
          meta,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startMs,
        },
        null,
        2,
      ),
    )

    return {
      pipelineRoot,
      steps: this.steps.map((s) => s.name),
      stepResults,
      durationMs: Date.now() - startMs,
      ok: true,
    }
  }
}
