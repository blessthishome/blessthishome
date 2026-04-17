import { supabase } from './supabase-config.js'

const el = (id) => document.getElementById(id)

const statusMessage = el('statusMessage')
const authMessage = el('authMessage')

function setStatus(msg){
  if (statusMessage) statusMessage.textContent = msg
}

function setAuth(msg){
  if (authMessage) authMessage.textContent = msg
}

function safeText(value){
  return value == null ? '' : String(value)
}

function money(value){
  return value == null || value === '' ? '' : `$${Number(value).toFixed(2)}`
}

async function getCurrentSessionUser(){
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    setStatus(error.message)
    return null
  }
  return data?.session?.user || null
}

async function getCurrentProfile(){
  const user = await getCurrentSessionUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single()

  if (error) {
    setStatus(error.message)
    return null
  }

  return { user, profile: data }
}

// AUTH
async function sendMagicLink(){
  const email = safeText(el('staffEmail')?.value).trim()
  if (!email) {
    setAuth('Enter email')
    return
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  })

  setAuth(error ? error.message : 'Check your email')
}

async function logout(){
  await supabase.auth.signOut()
  setAuth('Logged out')
  setStatus('Signed out')
}

// DASHBOARD
async function loadSummary(){
  const { data, error } = await supabase.rpc('dashboard_summary')
  if (error) {
    setStatus(error.message)
    return
  }

  el('statConstituents').textContent = data.constituents ?? 0
  el('statDonors').textContent = data.donors ?? 0
  el('statVolunteers').textContent = data.volunteers ?? 0
  el('statRecipients').textContent = data.recipients ?? 0
  el('statInventory').textContent = data.inventory_items ?? 0
  el('statLowStock').textContent = data.low_stock_items ?? 0
  el('statDonationTotal').textContent = money(data.financial_donations_total || 0)
}

// INVENTORY TABLE
async function loadInventory(){
  const { data, error } = await supabase
    .from('v_inventory_status')
    .select('*')

  if (error) {
    setStatus(error.message)
    return []
  }

  const tbody = document.querySelector('#inventoryTable tbody')
  if (tbody) {
    tbody.innerHTML = data.map(row => `
      <tr>
        <td>${safeText(row.item_name)}</td>
        <td>${safeText(row.category_name)}</td>
        <td class="${Number(row.quantity_on_hand) <= Number(row.reorder_threshold || 0) ? 'lowStock' : ''}">
          ${safeText(row.quantity_on_hand)}
        </td>
        <td>${safeText(row.storage_location)}</td>
      </tr>
    `).join('')
  }

  return data
}

// DISTRIBUTION TABLE
async function loadDistribution(){
  const { data, error } = await supabase
    .from('v_distribution_log')
    .select('*')

  if (error) {
    setStatus(error.message)
    return []
  }

  const tbody = document.querySelector('#distributionTable tbody')
  if (tbody) {
    tbody.innerHTML = data.map(row => `
      <tr>
        <td>${row.distributed_at ? new Date(row.distributed_at).toLocaleDateString() : ''}</td>
        <td>${safeText(row.recipient_name)}</td>
        <td>${safeText(row.item_name)}</td>
        <td>${safeText(row.quantity)}</td>
      </tr>
    `).join('')
  }

  return data
}

// DONOR TABLE
async function loadDonors(){
  const { data, error } = await supabase
    .from('v_donor_log')
    .select('*')

  if (error) {
    setStatus(error.message)
    return []
  }

  const tbody = document.querySelector('#donorTable tbody')
  if (tbody) {
    tbody.innerHTML = data.map(row => `
      <tr>
        <td>${row.donated_at ? new Date(row.donated_at).toLocaleDateString() : ''}</td>
        <td>${row.anonymous ? 'Anonymous' : safeText(row.donor_name)}</td>
        <td>${safeText(row.donation_kind)}</td>
        <td>${money(row.amount)}</td>
      </tr>
    `).join('')
  }

  return data
}

async function ensureCategoryId(categoryName){
  const trimmed = safeText(categoryName).trim()
  if (!trimmed) return null

  const existing = await supabase
    .from('inventory_categories')
    .select('id')
    .eq('name', trimmed)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data?.id) return existing.data.id

  const created = await supabase
    .from('inventory_categories')
    .insert({ name: trimmed })
    .select('id')
    .single()

  if (created.error) throw created.error
  return created.data.id
}

async function findInventoryBySkuOrName(sku, itemName){
  const skuTrim = safeText(sku).trim()
  const nameTrim = safeText(itemName).trim()

  if (skuTrim) {
    const bySku = await supabase
      .from('inventory_items')
      .select('id')
      .eq('sku', skuTrim)
      .maybeSingle()

    if (bySku.error) throw bySku.error
    if (bySku.data?.id) return bySku.data.id
  }

  if (nameTrim) {
    const byName = await supabase
      .from('inventory_items')
      .select('id')
      .eq('item_name', nameTrim)
      .maybeSingle()

    if (byName.error) throw byName.error
    if (byName.data?.id) return byName.data.id
  }

  return null
}

// FULL INVENTORY SAVE
function quickAddItem(itemName, categoryName){
  if (el('inventoryName')) el('inventoryName').value = itemName
  if (el('inventoryCategory')) el('inventoryCategory').value = categoryName
  if (el('inventoryQty')) el('inventoryQty').value = '1'
  if (el('inventoryThreshold')) el('inventoryThreshold').value = '1'
}

async function saveInventory(){
  try {
    const sessionData = await getCurrentProfile()
    if (!sessionData) {
      setStatus('You must be signed in')
      return
    }

    const sku = safeText(el('inventorySku')?.value).trim()
    const itemName = safeText(el('inventoryName')?.value).trim()
    const categoryName = safeText(el('inventoryCategory')?.value).trim()
    const qty = Number(el('inventoryQty')?.value || 0)
    const threshold = Number(el('inventoryThreshold')?.value || 0)
    const location = safeText(el('inventoryLocation')?.value).trim()
    const description = safeText(el('inventoryDescription')?.value).trim()

    if (!itemName) {
      setStatus('Item name is required')
      return
    }

    const categoryId = await ensureCategoryId(categoryName)
    const existingId = await findInventoryBySkuOrName(sku, itemName)

    if (existingId) {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          sku: sku || null,
          item_name: itemName,
          category_id: categoryId,
          quantity_on_hand: qty,
          reorder_threshold: threshold,
          storage_location: location || null,
          description: description || null
        })
        .eq('id', existingId)

      if (error) {
        setStatus(error.message)
        return
      }

      setStatus('Inventory item updated')
    } else {
      const { error } = await supabase
        .from('inventory_items')
        .insert({
          sku: sku || null,
          item_name: itemName,
          category_id: categoryId,
          quantity_on_hand: qty,
          reorder_threshold: threshold,
          storage_location: location || null,
          description: description || null
        })

      if (error) {
        setStatus(error.message)
        return
      }

      setStatus('Inventory item saved')
    }

    await refresh()
  } catch (err) {
    setStatus(err.message || 'Inventory save failed')
  }
}

async function findRecipientByEmailOrName(email, fullName){
  const emailTrim = safeText(email).trim()
  const nameTrim = safeText(fullName).trim()

  if (emailTrim) {
    const byEmail = await supabase
      .from('constituents')
      .select('id')
      .eq('email', emailTrim)
      .maybeSingle()

    if (byEmail.error) throw byEmail.error
    if (byEmail.data?.id) return byEmail.data.id
  }

  if (nameTrim) {
    const parts = nameTrim.split(/\s+/)
    const firstName = parts[0] || null
    const lastName = parts.slice(1).join(' ') || null

    const byName = await supabase
      .from('constituents')
      .select('id')
      .eq('first_name', firstName)
      .eq('last_name', lastName)
      .maybeSingle()

    if (byName.error) throw byName.error
    if (byName.data?.id) return byName.data.id
  }

  return null
}

async function ensureRecipient(fullName, email){
  const existingId = await findRecipientByEmailOrName(email, fullName)
  if (existingId) return existingId

  const parts = safeText(fullName).trim().split(/\s+/)
  const firstName = parts[0] || null
  const lastName = parts.slice(1).join(' ') || null

  const inserted = await supabase
    .from('constituents')
    .insert({
      constituent_type: 'recipient',
      first_name: firstName,
      last_name: lastName,
      email: safeText(email).trim() || null
    })
    .select('id')
    .single()

  if (inserted.error) throw inserted.error
  return inserted.data.id
}

async function findInventoryItemByName(itemName){
  const trimmed = safeText(itemName).trim()
  if (!trimmed) return null

  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, item_name')
    .eq('item_name', trimmed)
    .maybeSingle()

  if (error) throw error
  return data?.id || null
}

// FULL DISTRIBUTION LOGGING
async function distribute(){
  try {
    const sessionData = await getCurrentProfile()
    if (!sessionData) {
      setStatus('You must be signed in')
      return
    }

    const recipientName = safeText(el('recipientName')?.value).trim()
    const recipientEmail = safeText(el('recipientEmail')?.value).trim()
    const itemName = safeText(el('distributionItemName')?.value).trim()
    const qty = Number(el('distributionQty')?.value || 0)
    const destination = safeText(el('distributionDestination')?.value).trim()
    const notes = safeText(el('distributionNotes')?.value).trim()

    if (!recipientName) {
      setStatus('Recipient name is required')
      return
    }

    if (!itemName) {
      setStatus('Inventory item name is required')
      return
    }

    if (!qty || qty < 1) {
      setStatus('Quantity must be at least 1')
      return
    }

    const recipientId = await ensureRecipient(recipientName, recipientEmail)
    const inventoryItemId = await findInventoryItemByName(itemName)

    if (!inventoryItemId) {
      setStatus('Item not found')
      return
    }

    const eventInsert = await supabase
      .from('distribution_events')
      .insert({
        recipient_constituent_id: recipientId,
        destination_label: destination || null,
        notes: notes || null,
        created_by: sessionData.user.id
      })
      .select('id')
      .single()

    if (eventInsert.error) {
      setStatus(eventInsert.error.message)
      return
    }

    const itemInsert = await supabase
      .from('distribution_event_items')
      .insert({
        distribution_event_id: eventInsert.data.id,
        inventory_item_id: inventoryItemId,
        quantity: qty
      })

    if (itemInsert.error) {
      setStatus(itemInsert.error.message)
      return
    }

    setStatus('Distribution logged')
    await refresh()
  } catch (err) {
    setStatus(err.message || 'Distribution failed')
  }
}

// CONSTITUENT QUICK ADD
async function saveConstituent(){
  const email = safeText(el('constituentEmail')?.value).trim()

  if (!email) {
    setStatus('Email required')
    return
  }

  const payload = {
    constituent_type: safeText(el('constituentType')?.value).trim(),
    organization_name: safeText(el('constituentOrg')?.value).trim() || null,
    first_name: safeText(el('constituentFirstName')?.value).trim() || null,
    last_name: safeText(el('constituentLastName')?.value).trim() || null,
    email: email,
    primary_phone: safeText(el('constituentPhone')?.value).trim() || null,
    notes: safeText(el('constituentNotes')?.value).trim() || null
  }

  // 🔍 CHECK IF EXISTS
  const { data: existing, error: lookupError } = await supabase
    .from('constituents')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (lookupError) {
    setStatus(lookupError.message)
    return
  }

  if (existing?.id) {
    // 🔁 UPDATE
    const { error } = await supabase
      .from('constituents')
      .update(payload)
      .eq('id', existing.id)

    if (error) {
      setStatus(error.message)
      return
    }

    setStatus('Updated existing constituent')
  } else {
    // ➕ INSERT
    const { error } = await supabase
      .from('constituents')
      .insert(payload)

    if (error) {
      setStatus(error.message)
      return
    }

    setStatus('New constituent added')
  }

  await refresh()
}

function exportRows(filename, headers, rows){
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      row.map(value => {
        const str = safeText(value).replace(/"/g, '""')
        return `"${str}"`
      }).join(',')
    )
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
}

async function exportInventory(){
  const rows = await loadInventory()
  exportRows(
    'inventory.csv',
    ['Item', 'Category', 'On Hand', 'Location'],
    rows.map(row => [row.item_name, row.category_name, row.quantity_on_hand, row.storage_location])
  )
}

async function exportDistribution(){
  const rows = await loadDistribution()
  exportRows(
    'distribution-log.csv',
    ['Date', 'Recipient', 'Item', 'Quantity', 'Destination', 'Notes'],
    rows.map(row => [row.distributed_at, row.recipient_name, row.item_name, row.quantity, row.destination_label, row.notes])
  )
}

async function exportDonors(){
  const rows = await loadDonors()
  exportRows(
    'donor-log.csv',
    ['Date', 'Donor', 'Type', 'Amount'],
    rows.map(row => [row.donated_at, row.donor_name, row.donation_kind, row.amount])
  )
}

async function exportAll(){
  const inventoryRows = await loadInventory()
  const distributionRows = await loadDistribution()
  const donorRows = await loadDonors()

  exportRows(
    'inventory.csv',
    ['Item', 'Category', 'On Hand', 'Location'],
    inventoryRows.map(row => [row.item_name, row.category_name, row.quantity_on_hand, row.storage_location])
  )

  exportRows(
    'distribution-log.csv',
    ['Date', 'Recipient', 'Item', 'Quantity', 'Destination', 'Notes'],
    distributionRows.map(row => [row.distributed_at, row.recipient_name, row.item_name, row.quantity, row.destination_label, row.notes])
  )

  exportRows(
    'donor-log.csv',
    ['Date', 'Donor', 'Type', 'Amount'],
    donorRows.map(row => [row.donated_at, row.donor_name, row.donation_kind, row.amount])
  )

  setStatus('Reports exported')
}

// REFRESH
async function refresh(){
  await loadSummary()
  await loadInventory()
  await loadDistribution()
  await loadDonors()
}

async function invitePortalUser(){
  const full_name = safeText(el('inviteFullName')?.value).trim()
  const email = safeText(el('inviteEmail')?.value).trim()
  const role = safeText(el('inviteRole')?.value).trim()

  if (!email || !role) {
    setStatus('Invite email and role are required')
    return
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    setStatus('You must be signed in')
    return
  }

  const response = await fetch('https://yuokztriptlugbmdoszb.supabase.co/functions/v1/invite-portal-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      full_name,
      email,
      role
    })
  })

  const result = await response.json()

  if (!response.ok) {
    setStatus(result.error || 'Invite failed')
    return
  }

  setStatus(`Invite sent to ${email}`)
}

// EVENTS
if (el('loginBtn')) el('loginBtn').onclick = sendMagicLink
if (el('logoutBtn')) el('logoutBtn').onclick = logout
if (el('saveInventoryBtn')) el('saveInventoryBtn').onclick = saveInventory
if (el('logDistributionBtn')) el('logDistributionBtn').onclick = distribute
if (el('saveConstituentBtn')) el('saveConstituentBtn').onclick = saveConstituent
if (el('exportInventoryBtn')) el('exportInventoryBtn').onclick = exportInventory
if (el('exportDistributionBtn')) el('exportDistributionBtn').onclick = exportDistribution
if (el('exportDonorBtn')) el('exportDonorBtn').onclick = exportDonors
if (el('exportAllBtn')) el('exportAllBtn').onclick = exportAll
if (el('refreshBtn')) el('refreshBtn').onclick = refresh
if (el('inviteUserBtn')) el('inviteUserBtn').onclick = invitePortalUser
if (el('quickAddCouchBtn')) el('quickAddCouchBtn').onclick = () => quickAddItem('Couch', 'Living Room')
if (el('quickAddBedBtn')) el('quickAddBedBtn').onclick = () => quickAddItem('Bed', 'Bedroom')
if (el('quickAddTableBtn')) el('quickAddTableBtn').onclick = () => quickAddItem('Kitchen Table', 'Kitchen')
if (el('quickAddChairBtn')) el('quickAddChairBtn').onclick = () => quickAddItem('Chair', 'Living Room')
refresh()
