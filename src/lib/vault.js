// PraskForce1 — Encrypted Credential Vault
// AES-256-GCM encryption using Web Crypto API
// Master password → PBKDF2 key derivation → encrypt/decrypt credentials
// Everything stays local — never touches a server

const VAULT_KEY = 'pf1_vault'
const SALT_KEY = 'pf1_vault_salt'
const VAULT_CHECK_KEY = 'pf1_vault_check' // stores encrypted known string to verify master password

// ── Crypto Helpers ──

async function deriveMasterKey(password, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encrypt(key, data) {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  )
  // Store as base64: iv + ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decrypt(key, b64) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const iv = raw.slice(0, 12)
  const ciphertext = raw.slice(12)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(new TextDecoder().decode(decrypted))
}

// ── Vault Manager ──

let _masterKey = null // in-memory only, never persisted

export function isVaultSetup() {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem(SALT_KEY)
}

export function isVaultUnlocked() {
  return _masterKey !== null
}

export async function setupVault(masterPassword) {
  // First-time setup — create salt and store encrypted check value
  const salt = crypto.getRandomValues(new Uint8Array(32))
  localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)))

  const key = await deriveMasterKey(masterPassword, salt)
  _masterKey = key

  // Store encrypted check string so we can verify the password later
  const check = await encrypt(key, { check: 'PRASKFORCE1_VAULT_OK' })
  localStorage.setItem(VAULT_CHECK_KEY, check)

  // Initialize empty credential store
  await saveCredentials([])

  return true
}

export async function unlockVault(masterPassword) {
  const saltB64 = localStorage.getItem(SALT_KEY)
  if (!saltB64) throw new Error('Vault not set up')

  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
  const key = await deriveMasterKey(masterPassword, salt)

  // Verify password by decrypting check value
  const checkB64 = localStorage.getItem(VAULT_CHECK_KEY)
  try {
    const result = await decrypt(key, checkB64)
    if (result.check !== 'PRASKFORCE1_VAULT_OK') throw new Error()
  } catch {
    throw new Error('Wrong master password')
  }

  _masterKey = key
  return true
}

export function lockVault() {
  _masterKey = null
}

export async function getCredentials() {
  if (!_masterKey) throw new Error('Vault is locked')
  const data = localStorage.getItem(VAULT_KEY)
  if (!data) return []
  try {
    return await decrypt(_masterKey, data)
  } catch {
    return []
  }
}

export async function saveCredentials(creds) {
  if (!_masterKey) throw new Error('Vault is locked')
  const encrypted = await encrypt(_masterKey, creds)
  localStorage.setItem(VAULT_KEY, encrypted)
}

export async function addCredential(cred) {
  const creds = await getCredentials()
  creds.push({
    id: `cred_${Date.now()}`,
    created_at: new Date().toISOString(),
    ...cred,
  })
  await saveCredentials(creds)
  return creds
}

export async function updateCredential(id, updates) {
  const creds = await getCredentials()
  const idx = creds.findIndex(c => c.id === id)
  if (idx >= 0) {
    creds[idx] = { ...creds[idx], ...updates, updated_at: new Date().toISOString() }
    await saveCredentials(creds)
  }
  return creds
}

export async function deleteCredential(id) {
  const creds = await getCredentials()
  const filtered = creds.filter(c => c.id !== id)
  await saveCredentials(filtered)
  return filtered
}

export async function getCredentialForPortal(portalId) {
  const creds = await getCredentials()
  return creds.find(c => c.portal_id === portalId) || null
}

// ── Recommended Logins Engine ──
// Based on pipeline data, tells you which portals you NEED credentials for

export function getRecommendedLogins(properties, portals, credentials) {
  const recommendations = []

  // Which municipalities are in the pipeline?
  const municipalities = [...new Set(properties.map(p => p.municipality).filter(Boolean))]

  // Which portals cover those municipalities?
  const neededPortals = portals.filter(p => {
    if (!p.enabled || !p.login_required) return false
    if (p.municipality && municipalities.includes(p.municipality)) return true
    if (!p.municipality) return true // universal portals like Sunbiz
    return false
  })

  // Which of those are missing credentials?
  neededPortals.forEach(portal => {
    const hasCred = credentials.some(c => c.portal_id === portal.id)
    if (!hasCred) {
      const affectedProperties = properties.filter(p =>
        portal.municipality ? p.municipality === portal.municipality : true
      )
      recommendations.push({
        portal,
        reason: portal.municipality
          ? `${affectedProperties.length} properties in ${portal.municipality} need this portal to check permits`
          : `Required for LLC resolution and property data across all ${properties.length} properties`,
        priority: affectedProperties.length > 3 ? 'high' : 'medium',
        affected_count: affectedProperties.length,
      })
    }
  })

  return recommendations.sort((a, b) => b.affected_count - a.affected_count)
}

// ── Export for Chrome Agent ──
// When the agent needs a credential, it calls this
// Credential is decrypted in memory and passed — never written to disk

export async function getCredentialForAgent(portalId) {
  const cred = await getCredentialForPortal(portalId)
  if (!cred) return { error: 'NO_CREDENTIAL', message: `No login stored for portal ${portalId}. Add it in Settings → Credentials.` }
  return {
    username: cred.username,
    password: cred.password,
    url: cred.url,
    notes: cred.notes,
  }
}
