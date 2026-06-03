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
const searchResultsBox = el('searchResultsBox')
const recipientSearchResultsBox = el('recipientSearchResultsBox')
const crmAudienceHint = el('crmAudienceHint')
const auditLogHint = el('auditLogHint')
let cachedAuditLogRows = []
let cachedInventoryRows = []
let cachedDistributionRows = []
let cachedDonorRows = []
let visibleInventoryRows = []
let visibleDistributionRows = []
let visibleDonorRows = []

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

function setAuditLogHint(msg){
  if (auditLogHint) auditLogHint.textContent = msg
}

function hideSearchResults(){
  if (!searchResultsBox) return
  searchResultsBox.style.display = 'none'
  searchResultsBox.innerHTML = ''
}

function hideRecipientSearchResults(){
  if (!recipientSearchResultsBox) return
  recipientSearchResultsBox.style.display = 'none'
  recipientSearchResultsBox.innerHTML = ''
}

function updateConstituentSaveButtonLabel(){
  const btn = el('saveConstituentBtn')
  const currentId = safeText(el('currentConstituentId')?.value).trim()

  if (!btn) return
  btn.textContent = currentId ? 'Update Constituent' : 'Save Constituent'
}

function escapeHtml(value){
  return safeText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function clearConstituentEditor(){
  if (el('currentConstituentId')) el('currentConstituentId').value = ''
  if (el('constituentType')) el('constituentType').value = 'donor'
  if (el('constituentOrg')) el('constituentOrg').value = ''
  if (el('constituentFirstName')) el('constituentFirstName').value = ''
  if (el('constituentLastName')) el('constituentLastName').value = ''
  if (el('constituentEmail')) el('constituentEmail').value = ''
  if (el('constituentPhone')) el('constituentPhone').value = ''
  if (el('constituentNotes')) el('constituentNotes').value = ''
  updateConstituentSaveButtonLabel()
}

function renderConstituentSearchResults(rows){
  if (!searchResultsBox) return

  if (!rows.length) {
    searchResultsBox.style.display = 'block'
    searchResultsBox.innerHTML = 'No matching constituents found.'
    return
  }

  searchResultsBox.style.display = 'block'
  searchResultsBox.innerHTML = rows.map(row => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    const displayName = fullName || row.organization_name || row.email || 'Unnamed Constituent'
    const meta = [
      row.constituent_type,
      row.email,
      row.primary_phone
    ].filter(Boolean).join(' • ')

    return `
      <button
        type="button"
        class="btn"
        data-constituent-id="${row.id}"
        style="display:block;width:100%;text-align:left;margin-bottom:8px;"
      >
        <strong>${safeText(displayName)}</strong>
        <div class="hint">${safeText(meta)}</div>
      </button>
    `
  }).join('')

  searchResultsBox.querySelectorAll('[data-constituent-id]').forEach(node => {
    node.addEventListener('click', async () => {
      const id = node.getAttribute('data-constituent-id')
      await loadConstituentIntoEditor(id)
      hideSearchResults()
    })
  })
}

function renderRecipientSearchResults(rows){
  if (!recipientSearchResultsBox) return

  if (!rows.length) {
    recipientSearchResultsBox.style.display = 'block'
    recipientSearchResultsBox.innerHTML = 'No matching recipients found.'
    return
  }

  recipientSearchResultsBox.style.display = 'block'
  recipientSearchResultsBox.innerHTML = rows.map(row => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    const displayName = fullName || row.organization_name || row.email || 'Unnamed Recipient'
    const meta = [
      row.email,
      row.primary_phone
    ].filter(Boolean).join(' • ')

    return `
      <button
        type="button"
        class="btn"
        data-recipient-id="${row.id}"
        data-recipient-name="${safeText(displayName)}"
        data-recipient-email="${safeText(row.email || '')}"
        style="display:block;width:100%;text-align:left;margin-bottom:8px;"
      >
        <strong>${safeText(displayName)}</strong>
        <div class="hint">${safeText(meta)}</div>
      </button>
    `
  }).join('')

  recipientSearchResultsBox.querySelectorAll('[data-recipient-id]').forEach(node => {
    node.addEventListener('click', () => {
      if (el('recipientName')) el('recipientName').value = node.getAttribute('data-recipient-name') || ''
      if (el('recipientEmail')) el('recipientEmail').value = node.getAttribute('data-recipient-email') || ''
      hideRecipientSearchResults()
    })
  })
}

async function searchConstituents(term, typeFilter = ''){
  const trimmed = safeText(term).trim()
  if (!trimmed) {
    hideSearchResults()
    return
  }

  let query = supabase
    .from('constituents')
    .select('id, constituent_type, organization_name, first_name, last_name, email, primary_phone')
    .eq('is_deleted', false)
    .order('last_name', { ascending: true })
    .limit(12)

  if (typeFilter) {
    query = query.eq('constituent_type', typeFilter)
  }

  const { data, error } = await query.or(
    `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,organization_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%,primary_phone.ilike.%${trimmed}%`
  )

  if (error) {
    setStatus(error.message)
    return
  }

  renderConstituentSearchResults(data || [])
}

async function searchRecipients(term){
  const trimmed = safeText(term).trim()
  if (!trimmed) {
    hideRecipientSearchResults()
    return
  }

  const { data, error } = await supabase
    .from('constituents')
    .select('id, organization_name, first_name, last_name, email, primary_phone')
    .eq('is_deleted', false)
    .eq('constituent_type', 'recipient')
    .or(
      `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,organization_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`
    )
    .order('last_name', { ascending: true })
    .limit(10)

  if (error) {
    setStatus(error.message)
    return
  }

  renderRecipientSearchResults(data || [])
}

async function loadConstituentIntoEditor(constituentId){
  const { data, error } = await supabase
    .from('constituents')
    .select('id, constituent_type, organization_name, first_name, last_name, email, primary_phone, notes')
    .eq('id', constituentId)
    .eq('is_deleted', false)
    .single()

  if (error) {
    setStatus(error.message)
    setConstituentHint(error.message)
    return
  }

  if (el('currentConstituentId')) el('currentConstituentId').value = data.id || ''
  if (el('constituentType')) el('constituentType').value = data.constituent_type || 'other'
  if (el('constituentOrg')) el('constituentOrg').value = data.organization_name || ''
  if (el('constituentFirstName')) el('constituentFirstName').value = data.first_name || ''
  if (el('constituentLastName')) el('constituentLastName').value = data.last_name || ''
  if (el('constituentEmail')) el('constituentEmail').value = data.email || ''
  if (el('constituentPhone')) el('constituentPhone').value = data.primary_phone || ''
  if (el('constituentNotes')) el('constituentNotes').value = data.notes || ''

  updateConstituentSaveButtonLabel()
  setConstituentHint('Constituent loaded')
}

function safeText(value){
  return value == null ? '' : String(value)
}

let distributionDraftItems = []

function renderDistributionDraftItems(){
  const box = el('distributionDraftList')
  if (!box) return

  if (!distributionDraftItems.length){
    box.innerHTML = 'No items added yet.'
    return
  }

  box.innerHTML = distributionDraftItems.map((item,index)=>`
    <div style="
      border:1px solid rgba(255,255,255,.15);
      padding:10px;
      margin-bottom:10px;
      border-radius:8px;
    ">
      <strong>${safeText(item.item_name)}</strong>
      <div>Qty: ${item.quantity}</div>

      <button
        type="button"
        class="btn"
        onclick="removeDistributionDraftItem(${index})"
        style="margin-top:8px;"
      >
        Remove
      </button>
    </div>
  `).join('')
}

window.removeDistributionDraftItem = function(index){
  distributionDraftItems.splice(index,1)
  renderDistributionDraftItems()
}

async function addDistributionDraftItem(){

  const itemName =
    safeText(el('distributionItemName')?.value).trim()

  const qty =
    Number(el('distributionQty')?.value || 0)

  if (!itemName){
    setDistributionHint('Enter inventory item')
    return
  }

  if (!qty || qty < 1){
    setDistributionHint('Quantity must be at least 1')
    return
  }

  const itemId =
    await findInventoryItemByName(itemName)

  if (!itemId){
    setDistributionHint('Item not found')
    return
  }

  distributionDraftItems.push({
    inventory_item_id: itemId,
    item_name: itemName,
    quantity: qty
  })

  if (el('distributionItemName'))
    el('distributionItemName').value=''

  if (el('distributionQty'))
    el('distributionQty').value=''

  renderDistributionDraftItems()

  setDistributionHint('Item added to event')
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
'inventoryPieceCount',
'crmAudienceType',
'crmAudienceSearch',
'exportCrmAudienceBtn',
'inventoryTableSearch',
'distributionTableSearch',
'donorTableSearch',
'quickAddInventorySelect',
    'auditLogSearch',
'auditLogActionFilter'
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
  const { data, error } = await supabase
    .from('v_executive_summary')
    .select('*')
    .single()

  if (error) {
    setStatus(error.message)
    return
  }

  if (el('statInventoryValue')) {
    el('statInventoryValue').textContent = money(data.inventory_value || 0)
  }

  if (el('statDistributionValue')) {
    el('statDistributionValue').textContent = money(data.distribution_value || 0)
  }

  if (el('statDonationTotal')) {
    el('statDonationTotal').textContent = money(data.cash_donations || 0)
  }

  if (el('statInventory')) {
    el('statInventory').textContent = data.inventory_records ?? 0
  }

  if (el('statOpenDeliveries')) {
    el('statOpenDeliveries').textContent = data.open_deliveries ?? 0
  }

  if (el('statCompletedDeliveries')) {
    el('statCompletedDeliveries').textContent = data.completed_deliveries ?? 0
  }

  if (el('statReadyVolunteers')) {
    el('statReadyVolunteers').textContent = data.active_ready_volunteers ?? 0
  }
}

async function loadInventory(){
  const { data, error } = await supabase
    .from('v_inventory_status')
    .select('*')

  if (error) {
    setStatus(error.message)
    return []
  }

  cachedInventoryRows = data || []
  renderInventoryTable(cachedInventoryRows)

  return cachedInventoryRows
}

function renderInventoryTable(rows){
  visibleInventoryRows = rows
  const tbody = document.querySelector('#inventoryTable tbody')
  if (!tbody) return

  tbody.innerHTML = rows.map(row => {
    const low = Number(row.quantity_on_hand) <= Number(row.reorder_threshold || 0)

    return `
      <tr>
        <td>${escapeHtml(row.item_number || row.sku || '')}</td>
        <td><strong>${escapeHtml(row.item_name)}</strong></td>
        <td>${escapeHtml(row.category_name)}</td>
        <td class="${low ? 'lowStock' : ''}">${escapeHtml(row.quantity_on_hand)}</td>
        <td>${money(row.estimated_unit_value || 0)}</td>
        <td><strong>${money(row.total_estimated_value || 0)}</strong></td>
        <td>${escapeHtml(row.storage_location)}</td>
        <td>
          <span class="badge ${low ? 'badgeDanger' : ''}">
            ${low ? 'Low Stock' : 'Ready'}
          </span>
        </td>
      </tr>
    `
  }).join('')
}

function filterInventoryTable(){
  const term = safeText(el('inventoryTableSearch')?.value).trim().toLowerCase()

  if (!term) {
    renderInventoryTable(cachedInventoryRows)
    return
  }

  const filtered = cachedInventoryRows.filter(row => {
    return [
      row.sku,
      row.item_name,
      row.category_name,
      row.storage_location
    ].some(value => safeText(value).toLowerCase().includes(term))
  })

  renderInventoryTable(filtered)
}

async function loadDistribution(){
  const { data, error } = await supabase
    .from('v_distribution_log')
    .select('*')

  if (error) {
    setStatus(error.message)
    return []
  }

  cachedDistributionRows = data || []
  renderDistributionTable(cachedDistributionRows)

  return cachedDistributionRows
}

function renderDistributionTable(rows){
  visibleDistributionRows = rows

  const tbody = document.querySelector('#distributionTable tbody')
  if (!tbody) return

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.distributed_at ? new Date(row.distributed_at).toLocaleDateString() : ''}</td>
      <td>${escapeHtml(row.recipient_name)}</td>
      <td>${escapeHtml(row.item_name)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${money(row.estimated_unit_value || 0)}</td>
      <td><strong>${money(row.total_estimated_value || 0)}</strong></td>
    </tr>
  `).join('')
}

function filterDistributionTable(){
  const term = safeText(el('distributionTableSearch')?.value).trim().toLowerCase()

  if (!term) {
    renderDistributionTable(cachedDistributionRows)
    return
  }

  const filtered = cachedDistributionRows.filter(row => {
    return [
      row.distributed_at ? new Date(row.distributed_at).toLocaleDateString() : '',
      row.recipient_name,
      row.item_name,
      row.quantity,
      row.destination_label,
      row.notes
    ].some(value => safeText(value).toLowerCase().includes(term))
  })

  renderDistributionTable(filtered)
}

async function loadDonors(){
  const { data, error } = await supabase
    .from('v_donor_log')
    .select('*')

  if (error) {
    setStatus(error.message)
    return []
  }

  cachedDonorRows = data || []
  renderDonorTable(cachedDonorRows)

  return cachedDonorRows
}

function renderDonorTable(rows){
  visibleDonorRows = rows

  const tbody = document.querySelector('#donorTable tbody')
  if (!tbody) return

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.donated_at ? new Date(row.donated_at).toLocaleDateString() : ''}</td>
      <td>${row.anonymous ? 'Anonymous' : escapeHtml(row.donor_name)}</td>
      <td>${escapeHtml(row.donation_kind)}</td>
      <td>${money(row.amount)}</td>
    </tr>
  `).join('')
}

function filterDonorTable(){
  const term = safeText(el('donorTableSearch')?.value).trim().toLowerCase()

  if (!term) {
    renderDonorTable(cachedDonorRows)
    return
  }

  const filtered = cachedDonorRows.filter(row => {
    return [
      row.donated_at ? new Date(row.donated_at).toLocaleDateString() : '',
      row.donor_name,
      row.donation_kind,
      row.amount,
      row.email,
      row.primary_phone
    ].some(value => safeText(value).toLowerCase().includes(term))
  })

  renderDonorTable(filtered)
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

    const sessionData =
      await getCurrentProfile()

    if (!sessionData){
      setDistributionHint('You must be signed in')
      return
    }

    const recipientName =
      safeText(el('recipientName')?.value).trim()

    const recipientEmail =
      safeText(el('recipientEmail')?.value).trim()

    const destination =
      safeText(el('distributionDestination')?.value).trim()

    const notes =
      safeText(el('distributionNotes')?.value).trim()

    if (!recipientName){
      setDistributionHint('Recipient required')
      return
    }

    if (!distributionDraftItems.length){
      setDistributionHint('Add at least one item')
      return
    }

    for (const item of distributionDraftItems){

      const { error } =
        await supabase.rpc(
          'create_distribution_transaction',
          {
            p_recipient_name: recipientName,
            p_recipient_email: recipientEmail || null,
            p_item_name: item.item_name,
            p_quantity: item.quantity,
            p_destination_label: destination || null,
            p_notes: notes || null,
            p_created_by: sessionData.user.id
          }
        )

      if (error){
        setDistributionHint(error.message)
        return
      }

    }

    distributionDraftItems=[]

    renderDistributionDraftItems()

    if (el('recipientName'))
      el('recipientName').value=''

    if (el('recipientEmail'))
      el('recipientEmail').value=''

    if (el('distributionDestination'))
      el('distributionDestination').value=''

    if (el('distributionNotes'))
      el('distributionNotes').value=''

    setDistributionHint(
      'Multi item distribution saved'
    )

    await refresh()

  }

  catch(err){

    setDistributionHint(
      err.message || 'Distribution failed'
    )

  }

}

async function saveConstituent(){
  const currentConstituentId = safeText(el('currentConstituentId')?.value).trim()
  const email = safeText(el('constituentEmail')?.value).trim()

  if (!email && !safeText(el('constituentFirstName')?.value).trim() && !safeText(el('constituentOrg')?.value).trim()) {
    setStatus('Enter at least an email, first name, or organization')
    setConstituentHint('Enter at least an email, first name, or organization')
    return
  }

  const payload = {
    constituent_type: safeText(el('constituentType')?.value).trim(),
    organization_name: safeText(el('constituentOrg')?.value).trim() || null,
    first_name: safeText(el('constituentFirstName')?.value).trim() || null,
    last_name: safeText(el('constituentLastName')?.value).trim() || null,
    email: email || null,
    primary_phone: safeText(el('constituentPhone')?.value).trim() || null,
    notes: safeText(el('constituentNotes')?.value).trim() || null
  }

  if (currentConstituentId) {
    const { error } = await supabase
      .from('constituents')
      .update(payload)
      .eq('id', currentConstituentId)

    if (error) {
      setStatus(error.message)
      setConstituentHint(error.message)
      return
    }

    setStatus('Constituent updated')
    setConstituentHint('Constituent updated')
    await refresh()
    return
  }

  if (email) {
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

      if (el('currentConstituentId')) el('currentConstituentId').value = existing.id
      updateConstituentSaveButtonLabel()

      setStatus('Updated existing constituent')
      setConstituentHint('Updated existing constituent')
      await refresh()
      return
    }
  }

  const { data: inserted, error } = await supabase
    .from('constituents')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    setStatus(error.message)
    setConstituentHint(error.message)
    return
  }

  if (el('currentConstituentId')) el('currentConstituentId').value = inserted.id
  updateConstituentSaveButtonLabel()

  setStatus('New constituent added')
  setConstituentHint('New constituent added')

  await refresh()
}

function applyQuickAddTemplate(){
  const value = safeText(el('quickAddInventorySelect')?.value).trim()
  if (!value) return

  const [itemName, categoryName] = value.split('|')

  quickAddItem(itemName, categoryName)

  if (el('quickAddInventorySelect')) {
    el('quickAddInventorySelect').value = ''
  }
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
  const rows = visibleInventoryRows.length ? visibleInventoryRows : await loadInventory()

  exportRows(
    'inventory-valuation-visible.csv',
    ['Item Number', 'Item', 'Category', 'On Hand', 'Unit Value', 'Total Value', 'Location', 'Valuation Source'],
    rows.map(row => [
      row.item_number || row.sku || '',
      row.item_name,
      row.category_name,
      row.quantity_on_hand,
      row.estimated_unit_value,
      row.total_estimated_value,
      row.storage_location,
      row.valuation_source
    ])
  )
}

async function exportDistribution(){
  const rows = visibleDistributionRows.length ? visibleDistributionRows : await loadDistribution()

  exportRows(
    'distribution-visible.csv',
    ['Date', 'Recipient', 'Item', 'Quantity', 'Unit Value', 'Total Value', 'Destination', 'Notes'],
    rows.map(row => [
  row.distributed_at,
  row.recipient_name,
  row.item_name,
  row.quantity,
  row.estimated_unit_value,
  row.total_estimated_value,
  row.destination_label,
  row.notes
])
  )
}

async function exportDonors(){
  const rows = visibleDonorRows.length ? visibleDonorRows : await loadDonors()

  exportRows(
    'donor-visible.csv',
    ['Date', 'Donor', 'Type', 'Amount', 'Email', 'Phone'],
    rows.map(row => [
      row.donated_at,
      row.donor_name,
      row.donation_kind,
      row.amount,
      row.email,
      row.primary_phone
    ])
  )
}

async function exportDonationsQuickBooks(){
  const rows = visibleDonorRows.length ? visibleDonorRows : await loadDonors()

  exportRows(
    'quickbooks-donations.csv',
    [
      'Date',
      'Donor',
      'Donation Type',
      'Amount',
      'Status',
      'Frequency',
      'Email',
      'Phone',
      'External ID',
      'Receipt Generated'
    ],
    rows.map(row => [
      row.donated_at,
      row.donor_name,
      row.donation_kind,
      row.amount,
      row.status,
      row.frequency,
      row.email,
      row.primary_phone,
      row.external_id,
      row.receipt_generated
    ])
  )

  setReportsHint('QuickBooks donations export created')
}

async function exportInventoryValuation(){
  const rows = visibleInventoryRows.length ? visibleInventoryRows : await loadInventory()

  exportRows(
    'quickbooks-inventory-valuation.csv',
    [
      'Item Number',
      'Item',
      'Category',
      'Quantity On Hand',
      'Unit Value',
      'Total Value',
      'Location',
      'Valuation Source',
      'Valuation Note'
    ],
    rows.map(row => [
      row.item_number || row.sku || '',
      row.item_name,
      row.category_name,
      row.quantity_on_hand,
      row.estimated_unit_value,
      row.total_estimated_value,
      row.storage_location,
      row.valuation_source,
      row.valuation_note
    ])
  )

  setReportsHint('Inventory valuation export created')
}

async function exportDistributionValue(){
  const rows = visibleDistributionRows.length ? visibleDistributionRows : await loadDistribution()

  exportRows(
    'quickbooks-distribution-value.csv',
    [
      'Date',
      'Recipient',
      'Item Number',
      'Item',
      'Quantity',
      'Unit Value',
      'Total Value',
      'Destination',
      'Notes'
    ],
    rows.map(row => [
      row.distributed_at,
      row.recipient_name,
      row.item_number || row.sku || '',
      row.item_name,
      row.quantity,
      row.estimated_unit_value,
      row.total_estimated_value,
      row.destination_label,
      row.notes
    ])
  )

  setReportsHint('Distribution value export created')
}

function setCrmAudienceHint(msg){
  if (crmAudienceHint) crmAudienceHint.textContent = msg
}

async function exportCrmAudience(){
  const type = safeText(el('crmAudienceType')?.value).trim()
  const search = safeText(el('crmAudienceSearch')?.value).trim()

  let query = supabase
    .from('constituents')
    .select('constituent_type, organization_name, first_name, last_name, email, primary_phone, city, state, tags, notes')
    .eq('is_deleted', false)
    .order('last_name', { ascending: true })

  if (type) {
    query = query.eq('constituent_type', type)
  }

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,organization_name.ilike.%${search}%,email.ilike.%${search}%,primary_phone.ilike.%${search}%`
    )
  }

  const { data, error } = await query

  if (error) {
    setCrmAudienceHint(error.message)
    return
  }

  exportRows(
    `crm-audience-${type || 'all'}.csv`,
    ['Type', 'Organization', 'First Name', 'Last Name', 'Email', 'Phone', 'City', 'State', 'Tags', 'Notes'],
    (data || []).map(row => [
      row.constituent_type,
      row.organization_name,
      row.first_name,
      row.last_name,
      row.email,
      row.primary_phone,
      row.city,
      row.state,
      Array.isArray(row.tags) ? row.tags.join(', ') : '',
      row.notes
    ])
  )

  setCrmAudienceHint(`Exported ${(data || []).length} audience records`)
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

async function loadAuditLogs(){
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, table_name, record_id, action_type, changed_by, changed_at')
    .order('changed_at', { ascending: false })
    .limit(100)

  if (error) {
    setAuditLogHint(error.message)
    return []
  }

  cachedAuditLogRows = data || []
  renderAuditLogTable(cachedAuditLogRows)
  setAuditLogHint(`Loaded ${cachedAuditLogRows.length} recent audit events`)
  return cachedAuditLogRows
}

function renderAuditLogTable(rows){
  const tbody = document.querySelector('#auditLogTable tbody')
  if (!tbody) return

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.changed_at ? new Date(row.changed_at).toLocaleString() : ''}</td>
      <td><span class="badge">${escapeHtml(row.action_type)}</span></td>
      <td>${escapeHtml(row.table_name)}</td>
      <td>${escapeHtml(row.record_id)}</td>
      <td>${escapeHtml(row.changed_by)}</td>
    </tr>
  `).join('')
}

function filterAuditLogs(){
  const term = safeText(el('auditLogSearch')?.value).trim().toLowerCase()
  const action = safeText(el('auditLogActionFilter')?.value).trim()

  const filtered = cachedAuditLogRows.filter(row => {
    const matchesAction = !action || row.action_type === action

    const matchesSearch = !term || [
      row.table_name,
      row.record_id,
      row.action_type,
      row.changed_by,
      row.changed_at
    ].some(value => safeText(value).toLowerCase().includes(term))

    return matchesAction && matchesSearch
  })

  renderAuditLogTable(filtered)
  setAuditLogHint(`Showing ${filtered.length} audit events`)
}

async function refresh(){
  const current = await getCurrentProfile()
  if (!current) return

  await loadSummary()
  await loadInventory()
  await loadDistribution()
  await loadDonors()
  await loadDeliveryBatches()
  await loadAuditLogs()
  
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
if (el('addDistributionItemBtn'))
el('addDistributionItemBtn').onclick =
addDistributionDraftItem
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
if (el('distributionTableSearch')) el('distributionTableSearch').addEventListener('input', filterDistributionTable)
if (el('donorTableSearch')) el('donorTableSearch').addEventListener('input', filterDonorTable)
if (el('quickAddInventorySelect')) el('quickAddInventorySelect').addEventListener('change', applyQuickAddTemplate)
if (el('exportDonationsQuickBooksBtn')) el('exportDonationsQuickBooksBtn').onclick = exportDonationsQuickBooks
if (el('exportInventoryValuationBtn')) el('exportInventoryValuationBtn').onclick = exportInventoryValuation
if (el('exportDistributionValueBtn')) el('exportDistributionValueBtn').onclick = exportDistributionValue
if (el('auditLogSearch')) el('auditLogSearch').addEventListener('input', filterAuditLogs)
if (el('auditLogActionFilter')) el('auditLogActionFilter').addEventListener('change', filterAuditLogs)

if (el('searchInput')) {
  el('searchInput').addEventListener('input', async (e) => {
    const typeFilter = safeText(el('filterType')?.value).trim()
    await searchConstituents(e.target.value, typeFilter)
  })
}

if (el('filterType')) {
  el('filterType').addEventListener('change', async () => {
    const term = safeText(el('searchInput')?.value).trim()
    const typeFilter = safeText(el('filterType')?.value).trim()
    if (!term) {
      hideSearchResults()
      return
    }
    await searchConstituents(term, typeFilter)
  })
}

if (el('inventoryTableSearch')) el('inventoryTableSearch').addEventListener('input', filterInventoryTable)
if (el('exportCrmAudienceBtn')) el('exportCrmAudienceBtn').onclick = exportCrmAudience

if (el('recipientName')) {
  el('recipientName').addEventListener('input', async (e) => {
    await searchRecipients(e.target.value)
  })
}

document.addEventListener('click', (e) => {
  if (!searchResultsBox?.contains(e.target) && e.target !== el('searchInput')) {
    hideSearchResults()
  }

  if (!recipientSearchResultsBox?.contains(e.target) && e.target !== el('recipientName')) {
    hideRecipientSearchResults()
  }
})

supabase.auth.onAuthStateChange(() => {
  applyAdminAuthState()
})

setAdminUiLocked(true)
updateAdminAuthButtons(false)
updateConstituentSaveButtonLabel()
applyAdminAuthState()
