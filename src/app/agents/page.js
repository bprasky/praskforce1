'use client'
import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { generateAgentPrompt, RUNNABLE_TASKS } from '@/lib/agent-prompts'
import { Play, Copy, CheckCircle, ClipboardPaste, ChevronRight, Zap, Clock, ArrowRight, ExternalLink } from 'lucide-react'

export default function AgentsPage() {
  const [selectedTask, setSelectedTask] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [resultText, setResultText] = useState('')
  const [llcInput, setLlcInput] = useState('')

  function handleGenerate(taskId) {
    const context = {}
    if (taskId === 'SCAN-SUNBIZ-001' && llcInput) context.llcName = llcInput
    const p = generateAgentPrompt(taskId, context)
    setPrompt(p)
    setSelectedTask(taskId)
    setCopied(false)
    setShowResults(false)
    setResultText('')
  }

  function handleCopy() {
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-lg font-bold text-gray-900">Run Agents</h1>
          <p className="text-xs text-gray-500">Generate Chrome agent prompts → paste into Claude-in-Chrome → paste results back</p>
        </header>

        <div className="p-6">
          {/* Workflow explanation */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-6 text-xs text-gray-600">
              <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">1</span> Pick a task below</div>
              <ArrowRight size={12} className="text-gray-300" />
              <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">2</span> Copy the generated prompt</div>
              <ArrowRight size={12} className="text-gray-300" />
              <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">3</span> Paste into Claude-in-Chrome</div>
              <ArrowRight size={12} className="text-gray-300" />
              <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">4</span> Paste results back here</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Task list */}
            <div className="col-span-1">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Available Tasks</div>
              <div className="space-y-2">
                {RUNNABLE_TASKS.map(task => (
                  <button
                    key={task.id}
                    onClick={() => {
                      if (task.id === 'SCAN-SUNBIZ-001') {
                        setSelectedTask('SCAN-SUNBIZ-001-input')
                        setPrompt('')
                      } else {
                        handleGenerate(task.id)
                      }
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedTask === task.id
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{task.name}</span>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                    <p className="text-[10px] text-gray-500 mb-2">{task.desc}</p>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-gray-400 flex items-center gap-1"><Clock size={10} /> {task.time}</span>
                      {task.requires && <span className="text-amber-600">Requires: {task.requires}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {task.systems.map(s => (
                        <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{s}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              {/* Recommended first run */}
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-amber-800 mb-1">Recommended First Run</div>
                <ol className="text-[10px] text-amber-700 space-y-1 list-decimal list-inside">
                  <li><strong>Extract StoneProfits Quotes</strong> — baseline of your current deals</li>
                  <li><strong>Outlook Cross-Reference</strong> — match quotes to email activity</li>
                  <li><strong>Permit Portal Scan</strong> — check your 15 pipeline properties</li>
                </ol>
              </div>
            </div>

            {/* Prompt + results */}
            <div className="col-span-2">
              {/* LLC input for Sunbiz */}
              {selectedTask === 'SCAN-SUNBIZ-001-input' && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                  <div className="text-sm font-medium text-gray-900 mb-2">Sunbiz LLC Lookup</div>
                  <div className="flex gap-2">
                    <input
                      value={llcInput}
                      onChange={e => setLlcInput(e.target.value)}
                      placeholder="Enter LLC name to search (e.g. 5681 INVESTMENTS LLC)"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
                      onKeyDown={e => e.key === 'Enter' && llcInput && handleGenerate('SCAN-SUNBIZ-001')}
                    />
                    <button onClick={() => handleGenerate('SCAN-SUNBIZ-001')} disabled={!llcInput} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                      Generate Prompt
                    </button>
                  </div>
                </div>
              )}

              {/* Generated prompt */}
              {prompt && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                    <div className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <Zap size={12} className="text-amber-500" />
                      Agent Prompt — {RUNNABLE_TASKS.find(t => t.id === selectedTask)?.name}
                    </div>
                    <button
                      onClick={handleCopy}
                      className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                        copied ? 'bg-green-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600'
                      }`}
                    >
                      {copied ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy Prompt</>}
                    </button>
                  </div>
                  <pre className="p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">{prompt}</pre>
                </div>
              )}

              {/* Next step hint */}
              {prompt && !showResults && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="text-xs text-blue-800">
                    <span className="font-semibold">Next:</span> Open Claude-in-Chrome, paste the prompt, and let the agent run. When it's done, click below to paste the results back.
                  </div>
                  <button onClick={() => setShowResults(true)} className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1.5">
                    <ClipboardPaste size={12} /> Paste Agent Results
                  </button>
                </div>
              )}

              {/* Results paste-back */}
              {showResults && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1.5">
                    <ClipboardPaste size={14} /> Paste Agent Output
                  </div>
                  <textarea
                    value={resultText}
                    onChange={e => setResultText(e.target.value)}
                    rows={12}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400 leading-relaxed mb-3"
                    placeholder="Paste the Chrome agent's output here (JSON or text)..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // TODO: Parse results and store in Supabase / localStorage
                        alert('Results saved. In the next version, this data will be parsed and stored in your pipeline automatically.')
                      }}
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 flex items-center gap-1.5"
                    >
                      <Zap size={12} /> Process & Store Results
                    </button>
                    <button onClick={() => setShowResults(false)} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">Cancel</button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!prompt && selectedTask !== 'SCAN-SUNBIZ-001-input' && (
                <div className="text-center py-16">
                  <Play size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500 mb-1">Select a task to generate an agent prompt</p>
                  <p className="text-xs text-gray-400">Start with "Extract StoneProfits Quotes" to build your baseline</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
