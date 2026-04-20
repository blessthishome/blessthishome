import { supabase } from './supabase-config.js'

const el = (id) => document.getElementById(id)

const statusMessage = el('statusMessage')
const authMessage = el('authMessage')
const authStateLabel = el('authStateLabel')

const inventoryStatusHint = el('inventoryStatusHint')
const distributionStatusHint = el('distributionStatusHint')
const constituentStatusHint = el('constituentStatusHint')
const reportsStatusHint = el('reportsStatusHint')
const deliveryBatchStatusHint = el('deliveryBatchStatusHint')
const deliveryItemStatusHint = el('deliveryItemStatusHint')

function setInventoryHint(msg){
  if (inventoryStatusHint) inventoryStatusHint.textContent = msg
}

function setDistributionHint(msg){
  if (distributionStatusHint) distributionStatusHint.textContent = msg
}

function setConstituentHint(msg){
  if (constituentStatusHint) constituentStatusHint.textContent = msg
}

function setReportsHint(msg){
  if (reportsStatusHint) reportsStatusHint.textContent = msg
}

function setStatus(msg){
  if (statusMessage) statusMessage.textContent = msg
}

function setAuth(msg){
  if (authMessage) authMessage.textContent = msg
}

function setAuthStateLabel(msg){
  if (authStateLabel) authStateLabel.textContent = msg
}

function setDeliveryBatchHint(msg){
  if (deliveryBatchStatusHint) deliveryBatchStatusHint.textContent = msg
}

function setDeliveryItemHint(msg){
  if (deliveryItemStatusHint) deliveryItemStatusHint.textContent = msg
}

function safeText(value){
  return value == null ? '' : String(value)
}

function money(value){
  return value == null || value === '' ? '' : `$${Number(value).toFixed(2)}`
}

function setAdminUiLocked(isLocked){
  const protectedIds = [
    'inventorySku',
    'inventoryName',
    'inventoryCategory',
    'inventoryQty',
    'inventoryThreshold',
    'inventoryLocation',
    'inventoryDescription',
    'saveInventoryBtn',
    'recipientName',
    'recipientEmail',
    'distributionItemName',
    'distributionQty',
    'distributionDestination',
    'distributionNotes',
    'logDistributionBtn',
    'constituentType',
    'constituentOrg',
    'constituentFirstName',
    'constituentLastName',
    'constituentEmail',
    'constituentPhone',
    'constituentNotes',
    'saveConstituentBtn',
    'exportInventoryBtn',
    'exportDistributionBtn',
    'exportDonorBtn',
    'exportAllBtn',
    'refreshBtn',
    'quickAddCouchBtn',
    'quickAddBedBtn',
    'quickAddTableBtn',
    'quickAddChairBtn',
    'searchInput',
    'filterType',
'deliveryBatchName',
'deliveryRecipientName',
'deliveryScheduledDate',
'deliveryTeamLeadName',
'deliveryTeamLeadPhone',
'deliveryDestinationLabel',
'deliveryColorTag',
'deliveryNotes',
'currentDeliveryBatchId',
'completeDeliveryBtn',
'deleteDeliveryBtn',
'saveDeliveryBatchBtn',
'deliveryBatchSelect',
'deliveryItemSku',
'deliveryItemDescription',
'deliveryItemPieceCount',
'addDeliveryItemBtn',
'inventoryPieceCount'
  ]

  protectedIds.forEach((id) => {
    const node = el(id)
    if (node) node.disabled = isLocked
  })
}

function updateAdminAuthButtons(isSignedIn){
  const signinBtn = el('signinBtn')
  const loginBtn = el('loginBtn')
  const logoutBtn = el('logoutBtn')
  const signinCardBtn = el('signinCardBtn')
  const magicCardBtn = el('magicCardBtn')
  const staffEmail = el('staffEmail')
  const staffPassword = el('staffPassword')

  if (signinBtn) signinBtn.style.display = isSignedIn ? 'none' : 'inline-flex'
  if (loginBtn) loginBtn.style.display = isSignedIn ? 'none' : 'inline-flex'
  if (logoutBtn) logoutBtn.style.display = isSignedIn ? 'inline-flex' : 'none'
  if (signinCardBtn) signinCardBtn.style.display = isSignedIn ? 'none' : 'inline-flex'
  if (magicCardBtn) magicCardBtn.style.display = isSignedIn ? 'none' : 'inline-flex'

  if (staffEmail) staffEmail.disabled = isSignedIn
  if (staffPassword) staffPassword.disabled = isSignedIn
}

function updateDeliverySaveButtonLabel(){
  const btn = el('saveDeliveryBatchBtn')
  const currentId = safeText(el('currentDeliveryBatchId')?.value).trim()

  if (!btn) return
  btn.textContent = currentId ? 'Update Delivery' : 'Save Delivery'
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

async function applyAdminAuthState(){
  const current = await getCurrentProfile()

  if (!current) {
    updateAdminAuthButtons(false)
    setAdminUiLocked(true)
    setAuth('Signed out.')
    setAuthStateLabel('')
    return
  }

  updateAdminAuthButtons(true)
  setAdminUiLocked(false)
  setAuth('Signed in.')
  setAuthStateLabel(`Signed in as ${current.user.email}`)
  await refresh()
}

async function signInWithPassword(){
  const email = safeText(el('staffEmail')?.value).trim()
  const password = safeText(el('staffPassword')?.value)

  if (!email || !password) {
    setAuth('Enter email and password')
    return
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  setAuth(error ? error.message : 'Signed in successfully.')
}

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

  setAuth(error ? error.message : 'Magic link sent. Check your email.')
}

async function logout(){
  await supabase.auth.signOut()
  setAuth('Signed out.')
  setAuthStateLabel('')
  setStatus('Signed out')
  updateAdminAuthButtons(false)
  setAdminUiLocked(true)
}

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
  .eq('is_deleted', false)
  .maybeSingle()

    if (bySku.error) throw bySku.error
    if (bySku.data?.id) return bySku.data.id
  }

  if (nameTrim) {
    const byName = await supabase
  .from('inventory_items')
  .select('id')
  .eq('item_name', nameTrim)
  .eq('is_deleted', false)
  .maybeSingle()

    if (byName.error) throw byName.error
    if (byName.data?.id) return byName.data.id
  }

  return null
}

function quickAddItem(itemName, categoryName){
  if (el('inventoryName')) el('inventoryName').value = itemName
  if (el('inventoryCategory')) el('inventoryCategory').value = categoryName
  if (el('inventoryPieceCount')) el('inventoryPieceCount').value = '1'
  if (el('inventoryQty')) el('inventoryQty').value = '1'
  if (el('inventoryThreshold')) el('inventoryThreshold').value = '1'
}

async function saveInventory(){
  try {
    const sessionData = await getCurrentProfile()
    if (!sessionData) {
      setStatus('You must be signed in')
      setInventoryHint('You must be signed in')
      return
    }

    const sku = safeText(el('inventorySku')?.value).trim()
    const itemName = safeText(el('inventoryName')?.value).trim()
    const categoryName = safeText(el('inventoryCategory')?.value).trim()
    const pieceCount = Number(el('inventoryPieceCount')?.value || 1)
    const qty = Number(el('inventoryQty')?.value || 0)
    const threshold = Number(el('inventoryThreshold')?.value || 0)
    const location = safeText(el('inventoryLocation')?.value).trim()
    const description = safeText(el('inventoryDescription')?.value).trim()

    if (!itemName) {
      setStatus('Item name is required')
      setInventoryHint('Item name is required')
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
          piece_count: pieceCount,
          quantity_on_hand: qty,
          reorder_threshold: threshold,
          storage_location: location || null,
          description: description || null
        })
        .eq('id', existingId)

      if (error) {
        setStatus(error.message)
        setInventoryHint(error.message)
        return
      }

      setStatus('Inventory item updated')
      setInventoryHint('Inventory item updated')
    } else {
      const { error } = await supabase
        .from('inventory_items')
        .insert({
          sku: sku || null,
          item_name: itemName,
          category_id: categoryId,
          piece_count: pieceCount,
          quantity_on_hand: qty,
          reorder_threshold: threshold,
          storage_location: location || null,
          description: description || null
        })

      if (error) {
        setStatus(error.message)
        setInventoryHint(error.message)
        return
      }

      setStatus('Inventory item saved')
      setInventoryHint('Inventory item saved')
    }

    await refresh()
  } catch (err) {
    setStatus(err.message || 'Inventory save failed')
    setInventoryHint(err.message || 'Inventory save failed')
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
  .eq('is_deleted', false)
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
  .eq('is_deleted', false)
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
  .eq('is_deleted', false)
  .maybeSingle()

  if (error) throw error
  return data?.id || null
}

async function distribute(){
  try {
    const sessionData = await getCurrentProfile()
    if (!sessionData) {
      setStatus('You must be signed in')
      setDistributionHint('You must be signed in')
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
      setDistributionHint('Recipient name is required')
      return
    }

    if (!itemName) {
      setStatus('Inventory item name is required')
      setDistributionHint('Inventory item name is required')
      return
    }

    if (!qty || qty < 1) {
      setStatus('Quantity must be at least 1')
      setDistributionHint('Quantity must be at least 1')
      return
    }

    const { error } = await supabase.rpc('create_distribution_transaction', {
      p_recipient_name: recipientName,
      p_recipient_email: recipientEmail || null,
      p_item_name: itemName,
      p_quantity: qty,
      p_destination_label: destination || null,
      p_notes: notes || null,
      p_created_by: sessionData.user.id
    })

    if (error) {
      setStatus(error.message)
      setDistributionHint(error.message)
      return
    }

    setStatus('Distribution logged')
    setDistributionHint('Distribution logged')

    if (el('recipientName')) el('recipientName').value = ''
    if (el('recipientEmail')) el('recipientEmail').value = ''
    if (el('distributionItemName')) el('distributionItemName').value = ''
    if (el('distributionQty')) el('distributionQty').value = ''
    if (el('distributionDestination')) el('distributionDestination').value = ''
    if (el('distributionNotes')) el('distributionNotes').value = ''

    await refresh()
  } catch (err) {
    setStatus(err.message || 'Distribution failed')
    setDistributionHint(err.message || 'Distribution failed')
  }
}

async function saveConstituent(){
  const email = safeText(el('constituentEmail')?.value).trim()

  if (!email) {
    setStatus('Email required')
    setConstituentHint('Email required')
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

  const { data: existing, error: lookupError } = await supabase
  .from('constituents')
  .select('id')
  .eq('email', email)
  .eq('is_deleted', false)
  .maybeSingle()

  if (lookupError) {
    setStatus(lookupError.message)
    setConstituentHint(lookupError.message)
    return
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('constituents')
      .update(payload)
      .eq('id', existing.id)

    if (error) {
      setStatus(error.message)
      setConstituentHint(error.message)
      return
    }

    setStatus('Updated existing constituent')
    setConstituentHint('Updated existing constituent')
  } else {
    const { error } = await supabase
      .from('constituents')
      .insert(payload)

    if (error) {
      setStatus(error.message)
      setConstituentHint(error.message)
      return
    }

    setStatus('New constituent added')
    setConstituentHint('New constituent added')
  }

  await refresh()
}

async function loadDeliveryBatches(){
  const { data, error } = await supabase
  .from('delivery_batches')
  .select('id, batch_name, recipient_name, scheduled_date, status')
  .eq('is_deleted', false)
  .eq('status', 'open')
  .order('scheduled_date', { ascending: true })

  if (error) {
    setDeliveryBatchHint(error.message)
    return []
  }

  const select = el('deliveryBatchSelect')
  if (select) {
    select.innerHTML = `
      <option value="">Select delivery</option>
      ${data.map(row => `
        <option value="${row.id}">
          ${safeText(row.batch_name)}${row.recipient_name ? ` — ${safeText(row.recipient_name)}` : ''}${row.scheduled_date ? ` — ${safeText(row.scheduled_date)}` : ''}
        </option>
      `).join('')}
    `
  }

  return data
}

async function loadDeliveryBatchIntoForm(batchId){
  if (!batchId) {
    if (el('currentDeliveryBatchId')) el('currentDeliveryBatchId').value = ''
    if (el('deliveryBatchName')) el('deliveryBatchName').value = ''
    if (el('deliveryRecipientName')) el('deliveryRecipientName').value = ''
    if (el('deliveryScheduledDate')) el('deliveryScheduledDate').value = ''
    if (el('deliveryTeamLeadName')) el('deliveryTeamLeadName').value = ''
    if (el('deliveryTeamLeadPhone')) el('deliveryTeamLeadPhone').value = ''
    if (el('deliveryDestinationLabel')) el('deliveryDestinationLabel').value = ''
    if (el('deliveryColorTag')) el('deliveryColorTag').value = ''
    if (el('deliveryNotes')) el('deliveryNotes').value = ''
    await loadDeliveryBatchItems('')

updateDeliverySaveButtonLabel()

    return
  }

  const { data, error } = await supabase
  .from('delivery_batches')
  .select('id, batch_name, recipient_name, scheduled_date, team_lead_name, team_lead_phone, destination_label, color_tag, notes')
  .eq('id', batchId)
  .eq('is_deleted', false)
  .single()

  if (error) {
    setDeliveryBatchHint(error.message)

    return
  }

  if (el('currentDeliveryBatchId')) el('currentDeliveryBatchId').value = data.id || ''
  if (el('deliveryBatchName')) el('deliveryBatchName').value = data.batch_name || ''
  if (el('deliveryRecipientName')) el('deliveryRecipientName').value = data.recipient_name || ''
  if (el('deliveryScheduledDate')) el('deliveryScheduledDate').value = data.scheduled_date || ''
  if (el('deliveryTeamLeadName')) el('deliveryTeamLeadName').value = data.team_lead_name || ''
  if (el('deliveryTeamLeadPhone')) el('deliveryTeamLeadPhone').value = data.team_lead_phone || ''
  if (el('deliveryDestinationLabel')) el('deliveryDestinationLabel').value = data.destination_label || ''
  if (el('deliveryColorTag')) el('deliveryColorTag').value = data.color_tag || ''
  if (el('deliveryNotes')) el('deliveryNotes').value = data.notes || ''

  await loadDeliveryBatchItems(batchId)

  setDeliveryBatchHint('Delivery loaded')

updateDeliverySaveButtonLabel()
}

async function saveDeliveryBatch(){
  try {
    const current = await getCurrentProfile()
    if (!current) {
      setDeliveryBatchHint('You must be signed in')
      return
    }

    const currentBatchId = safeText(el('currentDeliveryBatchId')?.value).trim()
    const batch_name = safeText(el('deliveryBatchName')?.value).trim()
    const recipient_name = safeText(el('deliveryRecipientName')?.value).trim()
    const scheduled_date = safeText(el('deliveryScheduledDate')?.value).trim()
    const team_lead_name = safeText(el('deliveryTeamLeadName')?.value).trim()
    const team_lead_phone = safeText(el('deliveryTeamLeadPhone')?.value).trim()
    const destination_label = safeText(el('deliveryDestinationLabel')?.value).trim()
    const color_tag = safeText(el('deliveryColorTag')?.value).trim()
    const notes = safeText(el('deliveryNotes')?.value).trim()

    if (!batch_name) {
      setDeliveryBatchHint('Delivery name is required')
      return
    }

    const payload = {
      batch_name,
      recipient_name: recipient_name || null,
      scheduled_date: scheduled_date || null,
      team_lead_name: team_lead_name || null,
      team_lead_phone: team_lead_phone || null,
      destination_label: destination_label || null,
      color_tag: color_tag || null,
      notes: notes || null
    }

    let result

    if (currentBatchId) {
      result = await supabase
        .from('delivery_batches')
        .update(payload)
        .eq('id', currentBatchId)
        .select('id')
        .single()
    } else {
      result = await supabase
        .from('delivery_batches')
        .insert({
          ...payload,
          status: 'open'
        })
        .select('id')
        .single()
    }

    if (result.error) {
      setDeliveryBatchHint(result.error.message)
      return
    }

    if (el('currentDeliveryBatchId')) el('currentDeliveryBatchId').value = result.data.id
    if (el('deliveryBatchSelect')) el('deliveryBatchSelect').value = result.data.id

    updateDeliverySaveButtonLabel()

    setDeliveryBatchHint(currentBatchId ? 'Delivery updated' : 'Delivery saved')

    await loadDeliveryBatches()
    await loadDeliveryBatchItems(result.data.id)
  } catch (err) {
    setDeliveryBatchHint(err.message || 'Delivery save failed')
  }
}

async function completeDeliveryBatch(){
  try {
    const current = await getCurrentProfile()
    if (!current) {
      setDeliveryBatchHint('You must be signed in')
      return
    }

    const batchId = safeText(el('currentDeliveryBatchId')?.value || el('deliveryBatchSelect')?.value).trim()

    if (!batchId) {
      setDeliveryBatchHint('Select a delivery first')
      return
    }

    const { error } = await supabase
      .from('delivery_batches')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', batchId)

    if (error) {
      setDeliveryBatchHint(error.message)
      return
    }

    setDeliveryBatchHint('Delivery marked complete')

    if (el('currentDeliveryBatchId')) el('currentDeliveryBatchId').value = ''
    if (el('deliveryBatchSelect')) el('deliveryBatchSelect').value = ''

    updateDeliverySaveButtonLabel()

    await loadDeliveryBatches()
    await loadDeliveryBatchIntoForm('')
  } catch (err) {
    setDeliveryBatchHint(err.message || 'Failed to complete delivery')
  }
}

async function deleteDeliveryBatch(){
  try {
    const current = await getCurrentProfile()
    if (!current) {
      setDeliveryBatchHint('You must be signed in')
      return
    }

    const batchId = safeText(
      el('currentDeliveryBatchId')?.value ||
      el('deliveryBatchSelect')?.value
    ).trim()

    if (!batchId) {
      setDeliveryBatchHint('Select a delivery first')
      return
    }

    const confirmDelete = window.confirm(
      'Delete this delivery and all of its pull items?'
    )

    if (!confirmDelete) return

    const { error } = await supabase
  .from('delivery_batches')
  .update({
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: current.user.id
  })
  .eq('id', batchId)

    if (error) {
      setDeliveryBatchHint(error.message)
      return
    }

    setDeliveryBatchHint('Delivery deleted')

    if (el('currentDeliveryBatchId')) el('currentDeliveryBatchId').value = ''
    if (el('deliveryBatchSelect')) el('deliveryBatchSelect').value = ''

    updateDeliverySaveButtonLabel()

    await loadDeliveryBatches()
    await loadDeliveryBatchIntoForm('')

  } catch (err) {
    setDeliveryBatchHint(err.message || 'Failed to delete delivery')
  }
}
async function addItemToDeliveryBatch(){
  try {
    const current = await getCurrentProfile()
    if (!current) {
      setDeliveryItemHint('You must be signed in')
      return
    }

    const delivery_batch_id = safeText(el('deliveryBatchSelect')?.value).trim()
    const item_number = safeText(el('deliveryItemSku')?.value).trim()
    const description = safeText(el('deliveryItemDescription')?.value).trim()
    const piece_count = Number(el('deliveryItemPieceCount')?.value || 1)

    if (!delivery_batch_id) {
      setDeliveryItemHint('Select a delivery first')
      return
    }

    if (!item_number) {
      setDeliveryItemHint('Item SKU / number is required')
      return
    }

    const inventoryLookup = await supabase
  .from('inventory_items')
  .select('id, item_name, sku, piece_count')
  .eq('sku', item_number)
  .eq('is_deleted', false)
  .maybeSingle()

    if (inventoryLookup.error) {
      setDeliveryItemHint(inventoryLookup.error.message)
      return
    }

    const inventory_item_id = inventoryLookup.data?.id || null
    const finalDescription = description || inventoryLookup.data?.item_name || null
    const finalPieceCount = piece_count || inventoryLookup.data?.piece_count || 1

    const { error } = await supabase
      .from('delivery_batch_items')
      .insert({
        delivery_batch_id,
        inventory_item_id,
        item_number,
        piece_count: finalPieceCount,
        description: finalDescription,
        is_checked: false
      })

    if (error) {
      setDeliveryItemHint(error.message)
      return
    }

    setDeliveryItemHint('Item added to delivery')
    await loadDeliveryBatchItems(delivery_batch_id)
  } catch (err) {
    setDeliveryItemHint(err.message || 'Failed to add item')
  }
}

async function loadDeliveryBatchItems(batchId){
  const tbody = document.querySelector('#deliveryItemsTable tbody')
  if (!tbody) return []

  if (!batchId) {
    tbody.innerHTML = ''
    return []
  }

  const { data, error } = await supabase
    .from('delivery_batch_items')
    .select('id, item_number, description, piece_count, is_checked')
    .eq('delivery_batch_id', batchId)
    .order('created_at', { ascending: true })

  if (error) {
    setDeliveryItemHint(error.message)
    return []
  }

  tbody.innerHTML = data.map(row => `
    <tr>
      <td>${safeText(row.item_number)}</td>
      <td>${safeText(row.description)}</td>
      <td>${safeText(row.piece_count)}</td>
      <td>${row.is_checked ? 'Yes' : 'No'}</td>
    </tr>
  `).join('')

  return data
}

function toCsvCell(value){
  const str = safeText(value).replace(/"/g, '""')
  return `"${str}"`
}

function buildCsvSection(title, headers, rows){
  const sectionLines = []

  sectionLines.push(title)
  sectionLines.push(headers.map(toCsvCell).join(','))

  rows.forEach(row => {
    sectionLines.push(row.map(toCsvCell).join(','))
  })

  sectionLines.push('')
  sectionLines.push('')

  return sectionLines.join('\n')
}

function downloadTextFile(filename, content, mimeType = 'text/csv;charset=utf-8;'){
  const blob = new Blob([content], { type: mimeType })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

async function loadExecutiveSummary(){
  const { data, error } = await supabase
    .from('v_executive_summary')
    .select('*')
    .single()

  if (error) {
    setStatus(error.message)
    return null
  }

  return data
}

function exportRows(filename, headers, rows){
  const csv = [
    headers.map(toCsvCell).join(','),
    ...rows.map(row => row.map(toCsvCell).join(','))
  ].join('\n')

  downloadTextFile(filename, csv)
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
  try {
    const summary = await loadExecutiveSummary()
    const inventoryRows = await loadInventory()
    const distributionRows = await loadDistribution()
    const donorRows = await loadDonors()

    const sections = []

    if (summary) {
      sections.push(
        buildCsvSection(
          'Executive Summary',
          [
            'Inventory Records',
            'Inventory Value',
            'Total Distributions',
            'Distribution Value',
            'Cash Donations',
            'Active Ready Volunteers',
            'Open Deliveries',
            'Completed Deliveries'
          ],
          [[
            summary.inventory_records,
            summary.inventory_value,
            summary.total_distributions,
            summary.distribution_value,
            summary.cash_donations,
            summary.active_ready_volunteers,
            summary.open_deliveries,
            summary.completed_deliveries
          ]]
        )
      )
    }

    sections.push(
      buildCsvSection(
        'Inventory',
        ['Item', 'Category', 'On Hand', 'Location'],
        inventoryRows.map(row => [
          row.item_name,
          row.category_name,
          row.quantity_on_hand,
          row.storage_location
        ])
      )
    )

    sections.push(
      buildCsvSection(
        'Distribution Log',
        ['Date', 'Recipient', 'Item', 'Quantity', 'Destination', 'Notes'],
        distributionRows.map(row => [
          row.distributed_at,
          row.recipient_name,
          row.item_name,
          row.quantity,
          row.destination_label,
          row.notes
        ])
      )
    )

    sections.push(
      buildCsvSection(
        'Donor Log',
        ['Date', 'Donor', 'Type', 'Amount'],
        donorRows.map(row => [
          row.donated_at,
          row.donor_name,
          row.donation_kind,
          row.amount
        ])
      )
    )

    const fullCsv = sections.join('\n')
    downloadTextFile('full-operations-bundle.csv', fullCsv)

    setStatus('Full operations bundle exported')
    setReportsHint('Full operations bundle exported')
  } catch (err) {
    setStatus(err.message || 'Full operations export failed')
    setReportsHint(err.message || 'Full operations export failed')
  }
}

async function refresh(){
  const current = await getCurrentProfile()
  if (!current) return

  await loadSummary()
  await loadInventory()
  await loadDistribution()
  await loadDonors()
  await loadDeliveryBatches()

  const selectedBatchId = safeText(el('deliveryBatchSelect')?.value).trim()
  if (selectedBatchId) {
    await loadDeliveryBatchItems(selectedBatchId)
  }

  setReportsHint('Dashboard refreshed')
}

if (el('signinBtn')) el('signinBtn').onclick = signInWithPassword
if (el('signinCardBtn')) el('signinCardBtn').onclick = signInWithPassword
if (el('loginBtn')) el('loginBtn').onclick = sendMagicLink
if (el('magicCardBtn')) el('magicCardBtn').onclick = sendMagicLink
if (el('logoutBtn')) el('logoutBtn').onclick = logout
if (el('saveInventoryBtn')) el('saveInventoryBtn').onclick = saveInventory
if (el('logDistributionBtn')) el('logDistributionBtn').onclick = distribute
if (el('saveConstituentBtn')) el('saveConstituentBtn').onclick = saveConstituent
if (el('exportInventoryBtn')) el('exportInventoryBtn').onclick = exportInventory
if (el('exportDistributionBtn')) el('exportDistributionBtn').onclick = exportDistribution
if (el('exportDonorBtn')) el('exportDonorBtn').onclick = exportDonors
if (el('exportAllBtn')) el('exportAllBtn').onclick = exportAll
if (el('refreshBtn')) el('refreshBtn').onclick = refresh
if (el('quickAddCouchBtn')) el('quickAddCouchBtn').onclick = () => quickAddItem('Couch', 'Living Room')
if (el('quickAddBedBtn')) el('quickAddBedBtn').onclick = () => quickAddItem('Bed', 'Bedroom')
if (el('quickAddTableBtn')) el('quickAddTableBtn').onclick = () => quickAddItem('Kitchen Table', 'Kitchen')
if (el('quickAddChairBtn')) el('quickAddChairBtn').onclick = () => quickAddItem('Chair', 'Living Room')
if (el('saveDeliveryBatchBtn')) el('saveDeliveryBatchBtn').onclick = saveDeliveryBatch
if (el('addDeliveryItemBtn')) el('addDeliveryItemBtn').onclick = addItemToDeliveryBatch
if (el('deliveryBatchSelect')) el('deliveryBatchSelect').onchange = (e) => loadDeliveryBatchIntoForm(e.target.value)
if (el('completeDeliveryBtn')) el('completeDeliveryBtn').onclick = completeDeliveryBatch
if (el('deleteDeliveryBtn')) el('deleteDeliveryBtn').onclick = deleteDeliveryBatch

supabase.auth.onAuthStateChange(() => {
  applyAdminAuthState()
})

setAdminUiLocked(true)
updateAdminAuthButtons(false)
applyAdminAuthState()
