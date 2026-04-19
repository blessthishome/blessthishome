import { supabase } from './supabase-config.js'

const msg = document.getElementById('volunteerMessage')
const volunteerStateLabel = document.getElementById('volunteerStateLabel')

function setMsg(t){
  if (msg) msg.textContent = t
}

function setVolunteerStateLabel(t){
  if (volunteerStateLabel) volunteerStateLabel.textContent = t
}

function setVolunteerUiLocked(isLocked){
  const ids = ['saveAvailabilityBtn', 'availabilityText']
  ids.forEach((id) => {
    const node = document.getElementById(id)
    if (node) node.disabled = isLocked
  })
}

function updateVolunteerAuthButtons(isSignedIn){
  const signinBtn = document.getElementById('volunteerSigninBtn')
  const loginBtn = document.getElementById('volunteerLoginBtn')
  const logoutBtn = document.getElementById('volunteerLogoutBtn')
  const signinCardBtn = document.getElementById('volunteerSigninCardBtn')
  const magicCardBtn = document.getElementById('volunteerMagicCardBtn')
  const emailField = document.getElementById('volunteerEmail')
  const passwordField = document.getElementById('volunteerPassword')

  if (signinBtn) signinBtn.style.display = isSignedIn ? 'none' : 'inline-flex'
  if (loginBtn) loginBtn.style.display = isSignedIn ? 'none' : 'inline-flex'
  if (logoutBtn) logoutBtn.style.display = isSignedIn ? 'inline-flex' : 'none'
  if (signinCardBtn) signinCardBtn.style.display = isSignedIn ? 'none' : 'inline-flex'
  if (magicCardBtn) magicCardBtn.style.display = isSignedIn ? 'none' : 'inline-flex'

  if (emailField) emailField.disabled = isSignedIn
  if (passwordField) passwordField.disabled = isSignedIn
}

async function getCurrentUser(){
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    setMsg(error.message)
    return null
  }
  return data?.session?.user || null
}

async function applyVolunteerAuthState(){
  const user = await getCurrentUser()

  if (!user) {
    updateVolunteerAuthButtons(false)
    setVolunteerUiLocked(true)
    setMsg('Signed out.')
    setVolunteerStateLabel('')
    return
  }

  updateVolunteerAuthButtons(true)
  setVolunteerUiLocked(false)
  setMsg('Signed in.')
  setVolunteerStateLabel(`Signed in as ${user.email}`)
  await loadOpenNeeds()
await loadTodayDeliveries()
}

async function signInVolunteerWithPassword(){
  const email = document.getElementById('volunteerEmail').value.trim()
  const password = document.getElementById('volunteerPassword').value

  if (!email || !password) {
    setMsg('Enter email and password')
    return
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  setMsg(error ? error.message : 'Signed in successfully.')
}

async function login(){
  const email = document.getElementById('volunteerEmail').value.trim()

  if (!email) {
    setMsg('Enter email')
    return
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  })

  setMsg(error ? error.message : 'Magic link sent. Check your email.')
}

async function logout(){
  await supabase.auth.signOut()
  setMsg('Signed out.')
  setVolunteerStateLabel('')
  updateVolunteerAuthButtons(false)
  setVolunteerUiLocked(true)
}

async function findVolunteerConstituentByEmail(email){
  const { data, error } = await supabase
    .from('constituents')
    .select('id')
    .eq('email', email)
    .eq('constituent_type', 'volunteer')
    .maybeSingle()

  if (error) {
    setMsg(error.message)
    return null
  }

  return data?.id || null
}

async function ensureVolunteerConstituent(user){
  const existingId = await findVolunteerConstituentByEmail(user.email)
  if (existingId) return existingId

  const inserted = await supabase
    .from('constituents')
    .insert({
      constituent_type: 'volunteer',
      email: user.email
    })
    .select('id')
    .single()

  if (inserted.error) {
    setMsg(inserted.error.message)
    return null
  }

  return inserted.data.id
}

async function saveAvailability(){
  const text = document.getElementById('availabilityText').value.trim()
  const user = await getCurrentUser()

  if (!user) {
    setMsg('You must be signed in')
    return
  }

  const constituentId = await ensureVolunteerConstituent(user)
  if (!constituentId) return

  const { data: existing, error: checkError } = await supabase
    .from('volunteer_profiles')
    .select('constituent_id')
    .eq('constituent_id', constituentId)
    .maybeSingle()

  if (checkError) {
    setMsg(checkError.message)
    return
  }

  if (existing?.constituent_id) {
    const { error } = await supabase
      .from('volunteer_profiles')
      .update({
        availability: text
      })
      .eq('constituent_id', constituentId)

    if (error) {
      setMsg(error.message)
      return
    }
  } else {
    const { error } = await supabase
      .from('volunteer_profiles')
      .insert({
        constituent_id: constituentId,
        availability: text
      })

    if (error) {
      setMsg(error.message)
      return
    }
  }

  setMsg('Availability saved')
}

async function loadOpenNeeds(){
  const user = await getCurrentUser()
  if (!user) return

  const { data, error } = await supabase
    .from('inventory_items')
    .select('item_name, quantity_on_hand')
    .lte('quantity_on_hand', 3)
    .order('item_name')

  if (error) {
    setMsg(error.message)
    return
  }

  const list = document.getElementById('openNeedsList')
  if (!list) return

  if (!data || !data.length) {
    list.innerHTML = '<li>No urgent needs right now</li>'
    return
  }

  list.innerHTML = data.map(row => `
    <li>${row.item_name} is low. On hand: ${row.quantity_on_hand}</li>
  `).join('')
}

async function toggleDeliveryItemChecked(itemId, checked){
  const { error } = await supabase
    .from('delivery_batch_items')
    .update({ is_checked: checked })
    .eq('id', itemId)

  if (error) {
    setMsg(error.message)
  }
}

async function loadTodayDeliveries(){
  const user = await getCurrentUser()
  if (!user) return

  const container = document.getElementById('todayDeliveriesList')
  if (!container) return

  const today = new Date().toISOString().slice(0, 10)

  const { data: batches, error: batchError } = await supabase
    .from('delivery_batches')
    .select('id, batch_name, recipient_name, scheduled_date, color_tag, destination_label')
    .eq('scheduled_date', today)
    .order('recipient_name', { ascending: true })

  if (batchError) {
    setMsg(batchError.message)
    return
  }

  if (!batches || !batches.length) {
    container.innerHTML = 'No deliveries scheduled for today.'
    return
  }

  const batchIds = batches.map(row => row.id)

  const { data: items, error: itemError } = await supabase
    .from('delivery_batch_items')
    .select('id, delivery_batch_id, item_number, description, piece_count, is_checked')
    .in('delivery_batch_id', batchIds)
    .order('created_at', { ascending: true })

  if (itemError) {
    setMsg(itemError.message)
    return
  }

  const safeItems = Array.isArray(items) ? items : []

  setMsg(`Loaded ${batches.length} deliveries for today`)

  container.innerHTML = batches.map(batch => {
    const batchItems = safeItems.filter(item => item.delivery_batch_id === batch.id)

    const itemsHtml = batchItems.length
      ? batchItems.map(item => `
        <label style="
          display:grid;
          grid-template-columns:28px 1fr;
          gap:10px;
          margin-bottom:12px;
          width:100%;
        ">
          <input
            type="checkbox"
            data-delivery-item-id="${item.id}"
            ${item.is_checked ? 'checked' : ''}
          />
          <span style="
            min-width:0;
            overflow-wrap:break-word;
            word-break:break-word;
          ">
            <strong>${item.item_number || ''}</strong>
            ${item.description ? ` — ${item.description}` : ''}
            ${item.piece_count ? ` (${item.piece_count} pieces)` : ''}
          </span>
        </label>
      `).join('')
      : '<div>No pull items loaded.</div>'

    return `
      <details style="margin-bottom:14px;">
        <summary style="font-weight:700; cursor:pointer;">
          ${batch.recipient_name || batch.batch_name}
          ${batch.color_tag ? ` • ${batch.color_tag}` : ''}
          ${batch.destination_label ? ` • ${batch.destination_label}` : ''}
        </summary>
        <div style="margin-top:10px;">
          ${itemsHtml}
        </div>
      </details>
    `
  }).join('')

  container.querySelectorAll('input[type="checkbox"][data-delivery-item-id]').forEach(box => {
    box.addEventListener('change', async (e) => {
      const id = e.target.getAttribute('data-delivery-item-id')
      await toggleDeliveryItemChecked(id, e.target.checked)
    })
  })
}



if (document.getElementById('volunteerSigninBtn')) document.getElementById('volunteerSigninBtn').onclick = signInVolunteerWithPassword
if (document.getElementById('volunteerSigninCardBtn')) document.getElementById('volunteerSigninCardBtn').onclick = signInVolunteerWithPassword
if (document.getElementById('volunteerLoginBtn')) document.getElementById('volunteerLoginBtn').onclick = login
if (document.getElementById('volunteerMagicCardBtn')) document.getElementById('volunteerMagicCardBtn').onclick = login
if (document.getElementById('volunteerLogoutBtn')) document.getElementById('volunteerLogoutBtn').onclick = logout
if (document.getElementById('saveAvailabilityBtn')) document.getElementById('saveAvailabilityBtn').onclick = saveAvailability

supabase.auth.onAuthStateChange(() => {
  applyVolunteerAuthState()
})

setVolunteerUiLocked(true)
updateVolunteerAuthButtons(false)
applyVolunteerAuthState()
