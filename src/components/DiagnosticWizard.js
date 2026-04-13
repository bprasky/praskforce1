'use client'
import { useState, useEffect, useRef } from 'react'
import { getConfig } from '@/lib/config'
import { Zap, Send, Loader2, CheckCircle, X } from 'lucide-react'

const REFINED_KEY = 'pf1_refined_prompt'
const DIAGNOSTIC_KEY = 'pf1_diagnostic_state'

export function getRefinedPrompt() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(REFINED_KEY) || ''
}

function saveDiagnosticState(state) {
  localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(state))
}

function loadDiagnosticState() {
  try { return JSON.parse(localStorage.getItem(DIAGNOSTIC_KEY) || 'null') } catch { return null }
}

const SYSTEM_PROMPT = `You are the setup wizard for PraskForce1, a property lead intelligence and sales automation platform for luxury building materials sales.

The user has imported their existing agent instruction files. Your job is to:
1. Analyze what's relevant to PraskForce1's capabilities
2. Ask targeted questions to understand their preferences
3. Produce a refined, actionable system configuration

PraskForce1 can do:
- PIPELINE: Track luxury property sales, monitor building permits, resolve LLC ownership, score leads
- ACCOUNTS: Map entity networks across LLCs, connections, known projects
- TASKS: Parse meeting notes into action items, map to playbooks, execute via Chrome agent
- OUTREACH: AI-draft personalized emails using property intel + owner background + product targeting
- CRM: Chrome agent navigates StoneProfits to create quotes, update contacts, manage holds
- EMAIL: Chrome agent navigates Outlook to send emails, search inbox, log outreach
- RESEARCH: Deep research on property owners, contractors, architects via web + Sunbiz + permit portals

PraskForce1 CANNOT do (yet):
- Direct API integrations (all browser-based via Chrome agent)
- Automated scheduling without human approval
- Auto-send emails without review

Ask ONE question at a time. Be specific and give options when possible. After 5-8 questions, produce the final configuration.

When you have enough info, output a JSON block wrapped in \`\`\`json ... \`\`\` with this structure:
{
  "refined_prompt": "The condensed system prompt for all API calls",
  "task_mappings": [
    {"trigger": "phrase or pattern", "task_type": "QUOTE|EMAIL|FOLLOW_UP|etc", "auto_fields": {"field": "value"}, "description": "what this does"}
  ],
  "preferences": {
    "tone": "formal|professional_casual|casual",
    "auto_send": false,
    "follow_up_days": [3, 7, 14],
    "always_rules": ["rule 1", "rule 2"],
    "never_rules": ["rule 1", "rule 2"],
    "email_from": "address",
    "signature": "text"
  },
  "discarded": ["instruction name — reason it was excluded"]
}`

export default function DiagnosticWizard({ instructions, onComplete, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const chatRef = useRef(null)

  // Load saved state or start fresh
  useEffect(() => {
    const saved = loadDiagnosticState()
    if (saved?.messages?.length > 0) {
      setMessages(saved.messages)
      setComplete(saved.complete || false)
    } else {
      startDiagnostic()
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  async function callAI(msgs) {
    const config = getConfig()
    if (!config.ai?.api_key) throw new Error('Add your Claude API key in Settings → AI & Outreach')

    // Build instruction summary for first message
    const instructionSummary = instructions.map(doc =>
      `[${doc.name}]${doc.task_id ? ` (${doc.task_id})` : ''}${doc.systems ? ` Systems: ${doc.systems}` : ''}\n${doc.content.slice(0, 800)}`
    ).join('\n\n---\n\n')

    const systemMsg = SYSTEM_PROMPT + `\n\n=== IMPORTED INSTRUCTIONS (${instructions.length} docs) ===\n\n${instructionSummary}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ai.api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.ai.model || 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemMsg,
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
      }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.content?.[0]?.text || ''
  }

  async function startDiagnostic() {
    setLoading(true)
    try {
      const firstMsg = { role: 'user', content: `I just imported ${instructions.length} instruction files into PraskForce1. Analyze them and help me configure which ones are actionable in the app. Start by telling me what you see and ask your first question.` }
      const response = await callAI([firstMsg])
      const newMsgs = [firstMsg, { role: 'assistant', content: response }]
      setMessages(newMsgs)
      saveDiagnosticState({ messages: newMsgs, complete: false })
    } catch (e) {
      setMessages([{ role: 'assistant', content: `Setup error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)

    try {
      const response = await callAI(newMsgs)
      const withResponse = [...newMsgs, { role: 'assistant', content: response }]
      setMessages(withResponse)

      // Check if the response contains the final JSON config
      const jsonMatch = response.match(/```json\s*([\s\S]*?)```/)
      if (jsonMatch) {
        try {
          const config = JSON.parse(jsonMatch[1])
          localStorage.setItem(REFINED_KEY, config.refined_prompt || '')
          saveDiagnosticState({ messages: withResponse, complete: true, config })
          setComplete(true)
          if (onComplete) onComplete(config)
        } catch (e) {
          // JSON parse failed, continue conversation
        }
      } else {
        saveDiagnosticState({ messages: withResponse, complete: false })
      }
    } catch (e) {
      setMessages([...newMsgs, { role: 'assistant', content: `Error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleRestart() {
    setMessages([])
    setComplete(false)
    localStorage.removeItem(DIAGNOSTIC_KEY)
    startDiagnostic()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col" style={{ height: '600px' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Zap size={16} />
          <div>
            <div className="text-sm font-semibold">PraskForce1 Setup Wizard</div>
            <div className="text-[10px] text-amber-100">Analyzing {instructions.length} instruction files</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {complete && (
            <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle size={10} /> Configuration saved
            </span>
          )}
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={16} /></button>
        </div>
      </div>

      {/* Chat */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.filter(m => m.role !== 'user' || m.content !== messages[0]?.content).map((msg, i) => {
          if (i === 0 && msg.role === 'user') return null // hide the initial system prompt
          return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {msg.content.split('\n').map((line, j) => {
                  // Don't render the JSON block in chat
                  if (line.includes('```json') || line.includes('```')) return null
                  if (line.startsWith('{') || line.startsWith('}') || line.startsWith('"')) return null
                  return <p key={j} className={j > 0 ? 'mt-2' : ''}>{line}</p>
                })}
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Analyzing...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3">
        {complete ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-xs text-green-600 font-medium flex items-center gap-1.5">
              <CheckCircle size={14} /> Configuration applied. Your instructions are now mapped to app actions.
            </div>
            <button onClick={handleRestart} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">Start Over</button>
            <button onClick={onClose} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Done</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Answer the question..."
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
              disabled={loading}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
              <Send size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
