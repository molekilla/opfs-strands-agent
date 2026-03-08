/**
 * Vanilla JS entry point — OPFS Strands Agent
 *
 * Pure ESM JavaScript (no framework). Uses the Strands Agent SDK and
 * opfs-worker to give the browser a natural-language file system assistant.
 *
 * To swap the model provider, import and instantiate a different model:
 *
 *   // OpenAI
 *   import { OpenAIModel } from '@strands-agents/sdk/openai'
 *   const model = new OpenAIModel() // reads OPENAI_API_KEY
 *
 *   // Custom Bedrock model
 *   import { BedrockModel } from '@strands-agents/sdk'
 *   const model = new BedrockModel({ modelId: 'anthropic.claude-…', region: 'us-east-1' })
 *
 * Then pass `model` to `new Agent({ model, … })` below.
 */

import { Agent } from '@strands-agents/sdk'
import { createWorker } from 'opfs-worker'
import { createOpfsTools } from '../../src/tools/opfs-tools.ts'

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const statusEl  = /** @type {HTMLSpanElement}      */ (document.getElementById('status'))
const errorEl   = /** @type {HTMLDivElement}        */ (document.getElementById('error-banner'))
const outputEl  = /** @type {HTMLPreElement}        */ (document.getElementById('output'))
const promptEl  = /** @type {HTMLTextAreaElement}   */ (document.getElementById('prompt'))
const runBtn    = /** @type {HTMLButtonElement}     */ (document.getElementById('run-btn'))
const clearBtn  = /** @type {HTMLButtonElement}     */ (document.getElementById('clear-btn'))

// ─── state ────────────────────────────────────────────────────────────────────

/** @type {Agent | null} */
let agent = null

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Update the status badge text and CSS class.
 * @param {'idle'|'initialising'|'ready'|'busy'|'error'} s
 */
function setStatus(s) {
  statusEl.textContent = s
  statusEl.className = s
}

/**
 * Append a text chunk to the output <pre>, splitting on newlines.
 * @param {string} chunk
 */
function appendChunk(chunk) {
  const lines = outputEl.textContent.split('\n')
  const [head, ...rest] = (lines[lines.length - 1] + chunk).split('\n')
  outputEl.textContent =
    lines.slice(0, -1).join('\n') + (lines.length > 1 ? '\n' : '') + head + (rest.length ? '\n' + rest.join('\n') : '')
  outputEl.scrollTop = outputEl.scrollHeight
}

/**
 * Show an error message in the error banner.
 * @param {string} message
 */
function showError(message) {
  errorEl.textContent = message
  errorEl.style.display = 'block'
  setStatus('error')
}

function setReady() {
  setStatus('ready')
  promptEl.disabled = false
  runBtn.disabled = false
  runBtn.classList.add('active')
}

function setBusy() {
  setStatus('busy')
  promptEl.disabled = true
  runBtn.disabled = true
  runBtn.classList.remove('active')
}

// ─── initialisation ───────────────────────────────────────────────────────────

async function init() {
  setStatus('initialising')
  outputEl.textContent = 'Initialising OPFS worker…'

  try {
    const fs    = await createWorker({ root: '/' })
    const tools = createOpfsTools(fs)

    agent = new Agent({
      systemPrompt:
        'You are a helpful file management assistant with access to an Origin Private File System stored in the browser. Use the available tools to fulfil every file operation request. All paths are absolute and start with "/".',
      tools: [...tools],
      printer: false,
    })

    outputEl.textContent = 'Agent ready. Type a command below.'
    setReady()
  } catch (err) {
    showError(String(err))
  }
}

// ─── invocation ───────────────────────────────────────────────────────────────

async function runPrompt() {
  const prompt = promptEl.value.trim()
  if (!prompt || !agent) return

  setBusy()
  outputEl.textContent = ''
  promptEl.value = ''
  errorEl.style.display = 'none'

  try {
    for await (const event of agent.stream(prompt)) {
      if (
        event.type === 'contentBlockDelta' &&
        event.delta?.type === 'text_delta'
      ) {
        appendChunk(event.delta.text ?? '')
      }
    }
  } catch (err) {
    showError(String(err))
    return
  }

  setReady()
}

// ─── event listeners ──────────────────────────────────────────────────────────

runBtn.addEventListener('click', () => { void runPrompt() })

promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void runPrompt()
  }
})

clearBtn.addEventListener('click', () => {
  outputEl.textContent = ''
})

// ─── boot ─────────────────────────────────────────────────────────────────────

void init()
