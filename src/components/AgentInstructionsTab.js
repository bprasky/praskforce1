'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, Upload, AlertTriangle, Zap, RefreshCw, Settings } from 'lucide-react'
import AIConfigChat, { getRefinedPrompt } from '@/components/AIConfigChat'

const INSTRUCTIONS_KEY = 'pf1_agent_instructions'
const COMPILED_KEY = 'pf1_compiled_prompt'

function getInstructions() {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(INSTRUCTIONS_KEY) || '[]') } catch { return [] }
}

function saveInstructions(docs) {
  localStorage.setItem(INSTRUCTIONS_KEY, JSON.stringify(docs))
}

// Get the compiled system prompt — this is what gets sent on API calls
export function getCompiledPrompt() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(COMPILED_KEY) || ''
}

function saveCompiledPrompt(prompt) {
  localStorage.setItem(COMPILED_KEY, prompt)
}

function parseMetadata(text) {
  const meta = {}
  const idMatch = text.match(/Task ID[:\s]*([A-Z]+-\d+)/i)
  if (idMatch) meta.task_id = idMatch[1]
  const catMatch = text.match(/Category[:\s]*([A-Za-z\s\-]+?)(?:\n|$|\*)/i)
  if (catMatch) meta.category = catMatch[1].trim().replace(/\*/g, '')
  const sysMatch = text.match(/Systems[:\s]*([^\n]+)/i)
  if (sysMatch) meta.systems = sysMatch[1].replace(/\*/g, '').trim()
  const chainFromMatch = text.match(/Chains From[:\s]*([^\n]+)/i)
  if (chainFromMatch) meta.chains_from = chainFromMatch[1].replace(/\*/g, '').trim()
  const chainToMatch = text.match(/Chains To[:\s]*([^\n]+)/i)
  if (chainToMatch) meta.chains_to = chainToMatch[1].replace(/\*/g, '').trim()
  const titleMatch = text.match(/^#\s*\*{0,3}TASK:\s*(.+?)[\s*]*$/m) || text.match(/^TASK:\s*(.+?)$/m)
  if (titleMatch) meta.title = titleMatch[1].replace(/\*/g, '').trim()
  const credHints = []
  if (meta.systems) {
    if (/stoneprofits/i.test(meta.systems)) credHints.push('StoneProfits')
    if (/outlook/i.test(meta.systems)) credHints.push('Outlook')
    if (/trello/i.test(meta.systems)) credHints.push('Trello')
    if (/arcaww\.com/i.test(meta.systems)) credHints.push('arcaww.com')
  }
  meta.required_credentials = credHints
  return meta
}

// ── COMPILE ENGINE ──
// Runs ONCE when instructions change. Extracts rules, triggers, and step summaries
// into a condensed prompt (~1-2K tokens) instead of sending all raw docs (~20K+).

function compileInstructions(docs) {
  if (docs.length === 0) return ''

  const rules = docs.filter(d => !d.task_id)
  const tasks = docs.filter(d => d.task_id)

  let prompt = `=== ABSOLUTE RULES ===\n`

  rules.forEach(doc => {
    const lines = doc.content.split('\n')
    const keyLines = lines.filter(l =>
      /^RULE\s/i.test(l.trim()) ||
      /^[A-Z\s]{10,}:?\s*$/.test(l.trim()) ||
      /^\d+[\.\)]\s/.test(l.trim()) ||
      /^[-•]\s/.test(l.trim()) ||
      /always|never|must|required|mandatory/i.test(l)
    )
    if (keyLines.length > 0) {
      prompt += `\n[${doc.name}]\n${keyLines.join('\n')}\n`
    } else {
      prompt += `\n[${doc.name}]\n${doc.content.slice(0, 500)}\n`
    }
  })

  if (tasks.length > 0) {
    prompt += `\n=== TASK PLAYBOOKS ===\n`
    tasks.forEach(doc => {
      prompt += `\n[${doc.task_id || doc.name}]`
      if (doc.category) prompt += ` | ${doc.category}`
      if (doc.systems) prompt += ` | Systems: ${doc.systems}`
      if (doc.chains_to) prompt += ` | Chains to: ${doc.chains_to}`
      prompt += '\n'

      const triggerMatch = doc.content.match(/Trigger(?:s|ed by)?[:\s]*([^\n]+)/i)
      if (triggerMatch) prompt += `  Triggers: ${triggerMatch[1].trim()}\n`

      const steps = doc.content.match(/^\s*\d+[\.\)]\s.+$/gm)
      if (steps) {
        steps.slice(0, 5).forEach(s => { prompt += `  ${s.trim()}\n` })
        if (steps.length > 5) prompt += `  ... (+${steps.length - 5} more steps)\n`
      }
    })
  }

  return prompt.trim()
}

// ── Process files ──
function processFiles(files, existingDocs, onComplete, setError) {
  const fileList = Array.from(files).filter(f => /\.(md|txt|doc|json)$/i.test(f.name))
  if (fileList.length === 0) { setError('No .md, .txt, or .json files found'); return }

  // JSON bulk
  if (fileList.length === 1 && fileList[0].name.endsWith('.json')) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result)
        if (!Array.isArray(imported)) throw new Error('Expected array')
        const newDocs = imported.map(d => ({
          id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: d.name || 'Untitled',
          task_id: d.task_id || parseMetadata(d.content || '').task_id || null,
          category: d.category || null, systems: d.systems || null,
          required_credentials: d.required_credentials || [],
          content: d.content || '', created_at: new Date().toISOString(),
        }))
        const updated = [...existingDocs, ...newDocs]
        saveInstructions(updated)
        saveCompiledPrompt(compileInstructions(updated))
        onComplete(updated, newDocs.length)
      } catch (err) { setError('Invalid JSON: ' + err.message) }
    }
    reader.readAsText(fileList[0])
    return
  }

  // Multi-file
  let count = 0
  const newDocs = []
  fileList.forEach(file => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target.result
      const meta = parseMetadata(content)
      newDocs.push({
        id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: meta.title || file.name.replace(/\.(md|txt|docx?)$/i, ''),
        task_id: meta.task_id || null, category: meta.category || null,
        systems: meta.systems || null, chains_from: meta.chains_from || null,
        chains_to: meta.chains_to || null,
        required_credentials: meta.required_credentials || [],
        content, created_at: new Date().toISOString(),
      })
      count++
      if (count === fileList.length) {
        const updated = [...existingDocs, ...newDocs]
        saveInstructions(updated)
        saveCompiledPrompt(compileInstructions(updated))
        onComplete(updated, newDocs.length)
      }
    }
    reader.readAsText(file)
  })
}

// ── COMPONENT ──
export default function AgentInstructionsTab() {
  const [docs, setDocs] = useState([])
  const [adding, setAdding] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [docName, setDocName] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [compiled, setCompiled] = useState('')
  const [importCount, setImportCount] = useState(null)
  const [showWizard, setShowWizard] = useState(false)
  const [hasRefined, setHasRefined] = useState(false)

  useEffect(() => {
    setDocs(getInstructions())
    setCompiled(getCompiledPrompt())
    setHasRefined(!!getRefinedPrompt())
  }, [])

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragging(true) }, [])
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setDragging(false) }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer?.files?.length > 0) {
      processFiles(e.dataTransfer.files, docs, (updated, n) => {
        setDocs(updated)
        setCompiled(compileInstructions(updated))
        setImportCount(n)
        setError(null)
        setTimeout(() => setImportCount(null), 3000)
      }, setError)
    }
  }, [docs])

  function handleFileInput(e) {
    processFiles(e.target.files, docs, (updated, n) => {
      setDocs(updated)
      setCompiled(compileInstructions(updated))
      setImportCount(n)
      setError(null)
      setTimeout(() => setImportCount(null), 3000)
    }, setError)
    e.target.value = '' // reset so same files can be re-selected
  }

  function handlePasteAdd() {
    if (!pasteText.trim()) { setError('Paste instruction content'); return }
    const meta = parseMetadata(pasteText)
    const doc = {
      id: `inst_${Date.now()}`, name: docName || meta.title || meta.task_id || 'Untitled',
      task_id: meta.task_id || null, category: meta.category || null,
      systems: meta.systems || null, chains_from: meta.chains_from || null,
      chains_to: meta.chains_to || null, required_credentials: meta.required_credentials || [],
      content: pasteText, created_at: new Date().toISOString(),
    }
    const updated = [...docs, doc]
    setDocs(updated)
    saveInstructions(updated)
    const c = compileInstructions(updated)
    saveCompiledPrompt(c)
    setCompiled(c)
    setPasteText(''); setDocName(''); setAdding(false); setError(null)
  }

  function handleDelete(id) {
    if (!confirm('Delete this instruction set?')) return
    const updated = docs.filter(d => d.id !== id)
    setDocs(updated)
    saveInstructions(updated)
    const c = compileInstructions(updated)
    saveCompiledPrompt(c)
    setCompiled(c)
  }

  function handleRecompile() {
    const c = compileInstructions(docs)
    saveCompiledPrompt(c)
    setCompiled(c)
  }

  const taskDocs = docs.filter(d => d.task_id)
  const ruleDocs = docs.filter(d => !d.task_id)
  const compiledTokens = Math.round((compiled?.length || 0) / 4)
  const rawTokens = Math.round(docs.reduce((s, d) => s + (d.content?.length || 0), 0) / 4)

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 bg-amber-500/10 border-4 border-dashed border-amber-500 rounded-xl z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl shadow-2xl px-10 py-8 text-center">
            <Upload size={40} className="mx-auto text-amber-500 mb-3" />
            <p className="text-lg font-semibold text-amber-800">Drop files to import</p>
            <p className="text-sm text-amber-600">.md · .txt · .json</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-gray-900">Agent Instructions</div>
          <p className="text-xs text-gray-500">
            {docs.length} loaded
            {docs.length > 0 && <> · <span className="text-amber-600 font-medium">~{compiledTokens.toLocaleString()} tokens compiled</span> (saved {rawTokens > 0 ? Math.round((1 - compiledTokens / rawTokens) * 100) : 0}% vs raw)</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center gap-1.5 cursor-pointer">
            <Upload size={12} /> Import Files
            <input type="file" accept=".md,.txt,.doc,.json" multiple className="hidden" onChange={handleFileInput} />
          </label>
          <button onClick={() => setAdding(!adding)} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 flex items-center gap-1.5">
            <Plus size={12} /> Paste
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</div>}
      {importCount && <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg p-2 mb-3">✓ Imported {importCount} instruction sets and recompiled prompt</div>}

      {/* AI Config button */}
      {docs.length > 0 && !showWizard && (
        <div className={`border rounded-lg p-4 mb-4 ${hasRefined ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-xs font-semibold ${hasRefined ? 'text-green-800' : 'text-amber-800'} flex items-center gap-1.5`}>
                {hasRefined ? <><Zap size={12} /> AI Config Active</> : <><Settings size={12} /> Configure with AI</>}
              </div>
              <p className={`text-[10px] mt-0.5 ${hasRefined ? 'text-green-700' : 'text-amber-700'}`}>
                {hasRefined
                  ? 'Instructions are live. Open chat to update, create, or delete docs in plain English.'
                  : `${docs.length} files imported. Open AI chat to clean up, merge, and configure.`}
              </p>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${hasRefined ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
            >
              <Zap size={12} /> {hasRefined ? 'Open Chat' : 'Start'}
            </button>
          </div>
        </div>
      )}

      {/* AI Config Chat */}
      {showWizard && (
        <div className="mb-4">
          <AIConfigChat
            instructions={docs}
            onInstructionsChanged={(change) => {
              let updated = [...docs]
              if (change.type === 'create' && change.doc) {
                updated.push(change.doc)
              } else if (change.type === 'update') {
                const idx = updated.findIndex(d => d.name === change.name)
                if (idx >= 0) updated[idx] = { ...updated[idx], content: change.content, updated_at: new Date().toISOString() }
              } else if (change.type === 'delete') {
                updated = updated.filter(d => d.name !== change.name)
              }
              setDocs(updated)
              saveInstructions(updated)
              const c = compileInstructions(updated)
              saveCompiledPrompt(c)
              setCompiled(c)
              setHasRefined(true)
            }}
            onClose={() => setShowWizard(false)}
          />
        </div>
      )}

      {/* Drop zone when empty */}
      {docs.length === 0 && !adding && (
        <label className="block mb-4 cursor-pointer">
          <div className={`border-2 border-dashed rounded-lg p-10 text-center transition-all ${dragging ? 'border-amber-500 bg-amber-50 scale-[1.01]' : 'border-amber-300 bg-amber-50/50 hover:border-amber-400'}`}>
            <Upload size={36} className="mx-auto text-amber-400 mb-3" />
            <p className="text-sm font-medium text-amber-800 mb-1">Drag and drop your instruction files here</p>
            <p className="text-xs text-amber-600">Select multiple .md or .txt files, or a .json bulk export</p>
            <p className="text-[10px] text-amber-500 mt-3">Google Docs → File → Download → Plain Text (.txt) → drag here</p>
          </div>
          <input type="file" accept=".md,.txt,.doc,.json" multiple className="hidden" onChange={handleFileInput} />
        </label>
      )}

      {/* Paste input */}
      {adding && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <div className="text-xs font-semibold text-gray-700 mb-3">Paste Instruction</div>
          <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Name (auto-detected if blank)" className="mb-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400" />
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8} className="mb-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400 leading-relaxed" placeholder="Paste your full task document..." />
          <div className="flex gap-2">
            <button onClick={handlePasteAdd} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Import</button>
            <button onClick={() => { setAdding(false); setError(null) }} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      )}

      {/* Compiled prompt */}
      {docs.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-700 flex items-center gap-1.5"><Zap size={12} className="text-amber-500" /> Compiled System Prompt</div>
            <button onClick={handleRecompile} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-medium hover:bg-amber-200 flex items-center gap-1">
              <RefreshCw size={10} /> Recompile
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mb-2">Condensed from {rawTokens.toLocaleString()} → {compiledTokens.toLocaleString()} tokens. Sent as system context on every API call.</p>
          <details>
            <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">Preview</summary>
            <pre className="mt-2 text-[10px] text-gray-600 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-white border border-gray-200 rounded p-2">{compiled || 'Empty'}</pre>
          </details>
        </div>
      )}

      {/* Task Playbooks */}
      {taskDocs.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Zap size={12} /> Task Playbooks ({taskDocs.length})</div>
          <div className="space-y-2">
            {taskDocs.map(doc => <DocCard key={doc.id} doc={doc} expanded={expandedId === doc.id} onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)} onDelete={() => handleDelete(doc.id)} />)}
          </div>
        </div>
      )}

      {/* Rules */}
      {ruleDocs.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileText size={12} /> Rules & Configuration ({ruleDocs.length})</div>
          <div className="space-y-2">
            {ruleDocs.map(doc => <DocCard key={doc.id} doc={doc} expanded={expandedId === doc.id} onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)} onDelete={() => handleDelete(doc.id)} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function DocCard({ doc, expanded, onToggle, onDelete }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div onClick={onToggle} className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <div>
            <div className="text-sm font-medium text-gray-900">{doc.name}</div>
            <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
              {doc.task_id && <span className="font-mono text-amber-600">{doc.task_id}</span>}
              {doc.category && <><span className="text-gray-300">·</span><span>{doc.category}</span></>}
              {doc.required_credentials?.length > 0 && doc.required_credentials.map(c => (
                <span key={c} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{c}</span>
              ))}
              <span className="text-[10px] text-gray-400">~{Math.round((doc.content?.length || 0) / 4)} tokens</span>
            </div>
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {doc.systems && <div className="text-xs text-gray-500 mb-2"><span className="font-medium text-gray-600">Systems:</span> {doc.systems}</div>}
          {doc.chains_from && <div className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-600">Chains from:</span> {doc.chains_from}</div>}
          {doc.chains_to && <div className="text-xs text-gray-500 mb-3"><span className="font-medium text-gray-600">Chains to:</span> {doc.chains_to}</div>}
          <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-3">{doc.content.slice(0, 3000)}{doc.content.length > 3000 ? '\n\n... [truncated — full content stored]' : ''}</pre>
        </div>
      )}
    </div>
  )
}
