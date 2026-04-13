'use client'
import { useState, useEffect } from 'react'
import {
  isVaultSetup, isVaultUnlocked, setupVault, unlockVault, lockVault,
  getCredentials, addCredential, updateCredential, deleteCredential, getRecommendedLogins
} from '@/lib/vault'
import { DEMO_PROPERTIES } from '@/lib/supabase'
import { Lock, Unlock, Plus, Trash2, Eye, EyeOff, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, Zap, Pencil, X } from 'lucide-react'

const KNOWN_SERVICES = [
  { id: 'stoneprofits', name: 'StoneProfits', url: 'https://arca.stoneprofits.com' },
  { id: 'outlook', name: 'Outlook', url: 'https://outlook.office.com' },
  { id: 'trello', name: 'Trello', url: 'https://trello.com' },
  { id: 'whatsapp', name: 'WhatsApp Web', url: 'https://web.whatsapp.com' },
  { id: 'arcaww', name: 'arcaww.com (Admin)', url: 'https://www.arcaww.com' },
]

export default function CredentialsTab({ config }) {
  const [vaultReady, setVaultReady] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [masterPw, setMasterPw] = useState('')
  const [error, setError] = useState(null)
  const [creds, setCreds] = useState([])
  const [showPasswords, setShowPasswords] = useState({})
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editCred, setEditCred] = useState({})
  const [newCred, setNewCred] = useState({ portal_id: '', label: '', url: '', username: '', password: '', notes: '' })
  const [recommendations, setRecommendations] = useState([])

  useEffect(() => {
    setVaultReady(isVaultSetup())
    setUnlocked(isVaultUnlocked())
  }, [])

  useEffect(() => {
    if (unlocked) {
      loadCreds()
    }
  }, [unlocked])

  async function loadCreds() {
    try {
      const c = await getCredentials()
      setCreds(c)
      const recs = getRecommendedLogins(DEMO_PROPERTIES, config.portals || [], c)
      setRecommendations(recs)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleSetup() {
    if (masterPw.length < 8) { setError('Master password must be at least 8 characters'); return }
    try {
      await setupVault(masterPw)
      setVaultReady(true)
      setUnlocked(true)
      setMasterPw('')
      setError(null)
    } catch (e) { setError(e.message) }
  }

  async function handleUnlock() {
    try {
      await unlockVault(masterPw)
      setUnlocked(true)
      setMasterPw('')
      setError(null)
    } catch (e) { setError('Wrong master password') }
  }

  function handleLock() {
    lockVault()
    setUnlocked(false)
    setCreds([])
    setRecommendations([])
  }

  async function handleAdd() {
    if (!newCred.portal_id || !newCred.username || !newCred.password) {
      setError('Portal, username, and password are required')
      return
    }
    const portal = (config.portals || []).find(p => p.id === newCred.portal_id)
    const updated = await addCredential({
      ...newCred,
      label: portal?.name || newCred.label,
      url: portal?.url || newCred.url,
    })
    setCreds(updated)
    setNewCred({ portal_id: '', label: '', url: '', username: '', password: '', notes: '' })
    setAdding(false)
    setError(null)
    const recs = getRecommendedLogins(DEMO_PROPERTIES, config.portals || [], updated)
    setRecommendations(recs)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this credential?')) return
    const updated = await deleteCredential(id)
    setCreds(updated)
    const recs = getRecommendedLogins(DEMO_PROPERTIES, config.portals || [], updated)
    setRecommendations(recs)
  }

  function startEdit(cred) {
    setEditingId(cred.id)
    setEditCred({ label: cred.label || '', url: cred.url || '', username: cred.username || '', password: cred.password || '', notes: cred.notes || '' })
  }

  async function handleSaveEdit() {
    if (!editingId) return
    const updated = await updateCredential(editingId, editCred)
    setCreds(updated)
    setEditingId(null)
    setEditCred({})
    setError(null)
  }

  const portalsNeedingLogin = (config.portals || []).filter(p => p.enabled && p.login_required)
  const portalsWithCreds = portalsNeedingLogin.filter(p => creds.some(c => c.portal_id === p.id))
  const portalsMissingCreds = portalsNeedingLogin.filter(p => !creds.some(c => c.portal_id === p.id))

  // ── Not set up yet ──
  if (!vaultReady) {
    return (
      <div>
        <div className="text-sm font-semibold text-gray-900 mb-1">Set Up Credential Vault</div>
        <p className="text-xs text-gray-500 mb-4">Create a master password to encrypt your portal logins. This password is never stored — it derives the encryption key in your browser. If you forget it, credentials must be re-entered.</p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-amber-600 mt-0.5" />
            <div className="text-xs text-amber-800">
              <div className="font-semibold mb-1">How it works</div>
              <ul className="space-y-1">
                <li>Your master password derives a 256-bit AES encryption key via PBKDF2 (600,000 iterations)</li>
                <li>All credentials are encrypted with AES-256-GCM before storage</li>
                <li>Encrypted data is stored locally in your browser — never sent anywhere</li>
                <li>Credentials are decrypted in memory only when the vault is unlocked</li>
                <li>When the Chrome agent needs a login, it reads from the decrypted in-memory store</li>
              </ul>
            </div>
          </div>
        </div>

        {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

        <div className="flex gap-2">
          <input
            type="password"
            value={masterPw}
            onChange={e => setMasterPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSetup()}
            placeholder="Create master password (min 8 chars)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          <button onClick={handleSetup} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 flex items-center gap-1.5">
            <ShieldCheck size={14} /> Create Vault
          </button>
        </div>
      </div>
    )
  }

  // ── Locked ──
  if (!unlocked) {
    return (
      <div>
        <div className="text-sm font-semibold text-gray-900 mb-1">Unlock Credential Vault</div>
        <p className="text-xs text-gray-500 mb-4">Enter your master password to access stored portal logins.</p>

        {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

        <div className="flex gap-2">
          <input
            type="password"
            value={masterPw}
            onChange={e => setMasterPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            placeholder="Master password"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          <button onClick={handleUnlock} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 flex items-center gap-1.5">
            <Unlock size={14} /> Unlock
          </button>
        </div>
      </div>
    )
  }

  // ── Unlocked ──
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={16} className="text-green-500" /> Vault Unlocked
          </div>
          <p className="text-xs text-gray-500">{creds.length} credentials stored · {portalsWithCreds.length}/{portalsNeedingLogin.length} portals configured</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAdding(true)} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 flex items-center gap-1.5">
            <Plus size={12} /> Add Login
          </button>
          <button onClick={handleLock} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center gap-1.5">
            <Lock size={12} /> Lock
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">Recommended Logins</span>
          </div>
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-amber-900">{rec.portal.name}</div>
                  <div className="text-[10px] text-amber-700">{rec.reason}</div>
                </div>
                <button
                  onClick={() => {
                    setNewCred({ ...newCred, portal_id: rec.portal.id, url: rec.portal.url })
                    setAdding(true)
                  }}
                  className="text-[10px] font-medium text-amber-600 hover:text-amber-800 px-2 py-1 rounded bg-amber-100"
                >
                  Add Login →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing credentials warning */}
      {portalsMissingCreds.length > 0 && recommendations.length === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-red-500" />
            <span className="text-xs font-medium text-red-700">{portalsMissingCreds.length} portal(s) enabled but missing credentials — scans will fail</span>
          </div>
        </div>
      )}

      {/* Add credential form */}
      {adding && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <div className="text-xs font-semibold text-gray-700 mb-3">New Credential</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <span className="text-[10px] font-medium text-gray-500">System</span>
              <select
                value={newCred.portal_id}
                onChange={e => {
                  const val = e.target.value
                  const portal = (config.portals || []).find(p => p.id === val)
                  const service = KNOWN_SERVICES.find(s => s.id === val)
                  setNewCred({
                    ...newCred,
                    portal_id: val,
                    url: portal?.url || service?.url || newCred.url,
                    label: portal?.name || service?.name || '',
                  })
                }}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400"
              >
                <option value="">Select system...</option>
                <optgroup label="Scan Portals">
                  {(config.portals || []).filter(p => p.login_required).map(p => (
                    <option key={p.id} value={p.id} disabled={creds.some(c => c.portal_id === p.id)}>
                      {p.name} {creds.some(c => c.portal_id === p.id) ? '(configured)' : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Business Systems">
                  {KNOWN_SERVICES.map(s => (
                    <option key={s.id} value={s.id} disabled={creds.some(c => c.portal_id === s.id)}>
                      {s.name} {creds.some(c => c.portal_id === s.id) ? '(configured)' : ''}
                    </option>
                  ))}
                </optgroup>
                <option value="custom">Custom / Other</option>
              </select>
            </div>
            <div>
              {(newCred.portal_id === 'custom' || (!newCred.portal_id)) ? (
                <>
                  <span className="text-[10px] font-medium text-gray-500">Credential Name <span className="text-red-400">*</span></span>
                  <input value={newCred.label} onChange={e => setNewCred({ ...newCred, label: e.target.value })} placeholder="e.g. StoneProfits, Outlook, vendor portal..." className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400" />
                </>
              ) : (
                <>
                  <span className="text-[10px] font-medium text-gray-500">URL</span>
                  <input value={newCred.url} onChange={e => setNewCred({ ...newCred, url: e.target.value })} placeholder="https://..." className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400" />
                </>
              )}
            </div>
          </div>
          {newCred.portal_id === 'custom' && (
            <div className="mb-3">
              <span className="text-[10px] font-medium text-gray-500">URL</span>
              <input value={newCred.url} onChange={e => setNewCred({ ...newCred, url: e.target.value })} placeholder="https://..." className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <span className="text-[10px] font-medium text-gray-500">Username / Email</span>
              <input value={newCred.username} onChange={e => setNewCred({ ...newCred, username: e.target.value })} placeholder="username" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400" />
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500">Password</span>
              <input type="password" value={newCred.password} onChange={e => setNewCred({ ...newCred, password: e.target.value })} placeholder="••••••••" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400" />
            </div>
          </div>
          <div className="mb-3">
            <span className="text-[10px] font-medium text-gray-500">Notes (optional)</span>
            <input value={newCred.notes} onChange={e => setNewCred({ ...newCred, notes: e.target.value })} placeholder="Any notes about this login" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Save Credential</button>
            <button onClick={() => { setAdding(false); setError(null) }} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      )}

      {/* Credential list */}
      <div className="space-y-2">
        {creds.map(cred => {
          const portal = (config.portals || []).find(p => p.id === cred.portal_id)
          const service = KNOWN_SERVICES.find(s => s.id === cred.portal_id)
          const displayName = cred.label || portal?.name || service?.name || cred.portal_id
          const show = showPasswords[cred.id]
          const isEditing = editingId === cred.id

          if (isEditing) {
            return (
              <div key={cred.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="text-xs font-semibold text-amber-700 mb-3">Editing: {displayName}</div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <span className="text-[10px] font-medium text-gray-500">Name</span>
                    <input value={editCred.label} onChange={e => setEditCred({ ...editCred, label: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400 bg-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500">URL</span>
                    <input value={editCred.url} onChange={e => setEditCred({ ...editCred, url: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-amber-400 bg-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <span className="text-[10px] font-medium text-gray-500">Username / Email</span>
                    <input value={editCred.username} onChange={e => setEditCred({ ...editCred, username: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400 bg-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500">Password</span>
                    <input type="password" value={editCred.password} onChange={e => setEditCred({ ...editCred, password: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400 bg-white" />
                  </div>
                </div>
                <div className="mb-3">
                  <span className="text-[10px] font-medium text-gray-500">Notes</span>
                  <input value={editCred.notes} onChange={e => setEditCred({ ...editCred, notes: e.target.value })} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-amber-400 bg-white" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveEdit} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">Cancel</button>
                </div>
              </div>
            )
          }

          return (
            <div key={cred.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={14} className="text-green-500" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{displayName}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="font-mono">{cred.username}</span>
                    <span className="text-gray-300">·</span>
                    <button
                      onClick={() => setShowPasswords({ ...showPasswords, [cred.id]: !show })}
                      className="text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      {show ? <><EyeOff size={10} /> <span className="font-mono">{cred.password}</span></> : <><Eye size={10} /> ••••••••</>}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(cred)} className="p-1.5 text-gray-300 hover:text-amber-500 rounded-lg hover:bg-amber-50"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(cred.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })}

        {creds.length === 0 && !adding && (
          <div className="text-center py-8 text-xs text-gray-400">
            No credentials stored yet. Click "Add Login" or follow the recommendations above.
          </div>
        )}
      </div>

      {/* Portal coverage summary */}
      <div className="mt-6 border-t border-gray-200 pt-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Portal Coverage</div>
        <div className="grid grid-cols-2 gap-2">
          {portalsNeedingLogin.map(portal => {
            const hasCred = creds.some(c => c.portal_id === portal.id)
            return (
              <div key={portal.id} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${hasCred ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {hasCred ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                <span className="font-medium">{portal.name}</span>
                <span className="text-[10px] ml-auto">{hasCred ? 'Ready' : 'Missing'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
