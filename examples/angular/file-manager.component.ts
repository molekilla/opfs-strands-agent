/**
 * FileManagerComponent — Angular 21 standalone component
 *
 * Chat-style UI for the OPFS-backed Strands Agent.
 * Uses Angular 21 signals, the new @if / @for control-flow syntax, and
 * injects FileAgentService for all agent interactions.
 *
 * Usage
 * ─────
 * 1. Add to your application routes or bootstrap it directly:
 *
 *    // main.ts
 *    import { bootstrapApplication } from '@angular/platform-browser'
 *    import { FileManagerComponent }  from './examples/angular/file-manager.component'
 *    bootstrapApplication(FileManagerComponent)
 *
 * 2. Or import into another standalone component:
 *
 *    @Component({
 *      imports: [FileManagerComponent],
 *      template: '<app-file-manager />'
 *    })
 *    export class AppComponent {}
 */

import {
  Component,
  OnInit,
  inject,
  signal,
  ElementRef,
  viewChild,
  afterEveryRender,
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FileAgentService } from './file-manager.service.ts'

@Component({
  selector: 'app-file-manager',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './file-manager.component.html',
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      background: #0f1117;
      color: #e2e8f0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      padding: 2rem 1rem;
      gap: 1.5rem;
      box-sizing: border-box;
    }

    h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: #94a3b8;
      font-size: 0.9rem;
      margin-top: 0.4rem;
    }

    .status-badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 999px;
      color: #fff;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    .status-idle          { background: #64748b; }
    .status-initialising  { background: #f59e0b; }
    .status-ready         { background: #22c55e; }
    .status-busy          { background: #6366f1; }
    .status-error         { background: #ef4444; }

    .error-banner {
      width: 100%;
      max-width: 760px;
      background: #450a0a;
      border: 1px solid #ef4444;
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      color: #fca5a5;
      font-size: 0.85rem;
    }

    .output-card {
      width: 100%;
      max-width: 760px;
      background: #1e2130;
      border: 1px solid #2d3148;
      border-radius: 0.75rem;
      overflow: hidden;
    }

    .output-header {
      background: #252840;
      padding: 0.6rem 1rem;
      font-size: 0.78rem;
      color: #6366f1;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-bottom: 1px solid #2d3148;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .clear-btn {
      background: none;
      border: 1px solid #4b5180;
      border-radius: 0.25rem;
      color: #94a3b8;
      cursor: pointer;
      font-size: 0.72rem;
      padding: 2px 8px;
    }

    pre.output {
      margin: 0;
      padding: 1rem;
      white-space: pre-wrap;
      font-family: 'Cascadia Code', 'Fira Code', 'Courier New', monospace;
      font-size: 0.82rem;
      line-height: 1.7;
      color: #a5f3fc;
      min-height: 200px;
      max-height: 50vh;
      overflow-y: auto;
    }

    .input-row {
      width: 100%;
      max-width: 760px;
      display: flex;
      gap: 0.5rem;
    }

    textarea {
      flex: 1;
      background: #1e2130;
      border: 1px solid #2d3148;
      border-radius: 0.5rem;
      color: #e2e8f0;
      font-family: inherit;
      font-size: 0.9rem;
      padding: 0.6rem 0.9rem;
      resize: vertical;
      outline: none;
    }

    .run-btn {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none;
      border-radius: 0.5rem;
      color: #fff;
      font-weight: 600;
      font-size: 0.9rem;
      padding: 0 1.25rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .run-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .hint {
      color: #475569;
      font-size: 0.78rem;
      margin: 0;
    }

    kbd {
      background: #1e2130;
      padding: 1px 5px;
      border-radius: 3px;
    }
  `],
})
export class FileManagerComponent implements OnInit {
  protected readonly agent = inject(FileAgentService)

  protected prompt = signal('')

  private readonly outputEl = viewChild<ElementRef<HTMLPreElement>>('outputEl')

  // Auto-scroll whenever lines change
  constructor() {
    afterEveryRender(() => {
      // reading this signal registers the dependency
      void this.agent.lines()
      const el = this.outputEl()?.nativeElement
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  async ngOnInit(): Promise<void> {
    await this.agent.initialize()
  }

  async run(): Promise<void> {
    const p = this.prompt().trim()
    if (!p || !this.agent.isReady()) return
    this.prompt.set('')
    await this.agent.invoke(p)
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void this.run()
    }
  }
}
