import { supabase } from './supabase-config.js'

const msg = document.getElementById('volunteerMessage')

function setMsg(t){
  if (msg) msg.textContent = t
}

async function getCurrentUser(){
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    setMsg(error.message)
    return null
  }
  return data?.session?.user || null
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

  setMsg(error ? error.message : 'Check email')
}

async function logout(){
  await supabase.auth.signOut()
  setMsg('Logged out')
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

  // 🔍 CHECK IF PROFILE EXISTS
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
    // 🔁 UPDATE EXISTING PROFILE
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
    // ➕ CREATE PROFILE
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

document.getElementById('volunteerLoginBtn').onclick = login
document.getElementById('volunteerLogoutBtn').onclick = logout
document.getElementById('saveAvailabilityBtn').onclick = saveAvailability

loadOpenNeeds()
