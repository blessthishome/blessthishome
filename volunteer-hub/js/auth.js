(() => {
  "use strict";

  const config = window.BTH_CONFIG;
  const configHelpers = window.BTHConfig;

  if (!config || !configHelpers) {
    throw new Error(
      "Volunteer Hub configuration was not loaded before auth.js."
    );
  }

  /* =======================================================
     SHARED APPLICATION STATE
     ======================================================= */

  const state = window.BTH_STATE =
    window.BTH_STATE || {
      supabase: null,
      session: null,
      user: null,
      profile: null,
      role: "volunteer",
      demoMode: true,
      ready: false
    };

  /* =======================================================
     ELEMENT HELPERS
     ======================================================= */

  const byId = (id) => document.getElementById(id);

  function requireElement(id) {
    const element = byId(id);

    if (!element) {
      throw new Error(`Required page element #${id} was not found.`);
    }

    return element;
  }

  /* =======================================================
     GENERAL HELPERS
     ======================================================= */

  function generateId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return [
      Date.now().toString(36),
      Math.random().toString(36).slice(2),
      Math.random().toString(36).slice(2)
    ].join("-");
  }

  function normalizeEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function cleanName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function makeDisplayName(firstName, lastName) {
    const first = cleanName(firstName);
    const last = cleanName(lastName);

    if (!first) {
      return "";
    }

    return last
      ? `${first} ${last.charAt(0).toUpperCase()}.`
      : first;
  }

  function setFeedback(element, message, type = "") {
    if (!element) {
      return;
    }

    element.textContent = message || "";

    element.classList.toggle(
      "is-error",
      type === "error"
    );

    element.classList.toggle(
      "is-success",
      type === "success"
    );
  }

  function clearFeedback(element) {
    setFeedback(element, "");
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePassword(password) {
    return String(password || "").length >= 8;
  }

  function validateName(name) {
    return cleanName(name).length >= 1;
  }

  function getRoleLabel(role) {
    return configHelpers.getRoleLabel(role);
  }

  function hasAdministrativeAccess(role = state.role) {
    return configHelpers.hasAdministrativeAccess(role);
  }

  /* =======================================================
     LOCAL-STORAGE HELPERS
     ======================================================= */

  function readJsonStorage(key, fallback) {
    try {
      const storedValue = localStorage.getItem(key);

      if (!storedValue) {
        return fallback;
      }

      return JSON.parse(storedValue);
    } catch (error) {
      console.error(
        `Unable to read local storage key "${key}":`,
        error
      );

      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(value)
      );
    } catch (error) {
      throw new Error(
        "The browser could not save this information locally."
      );
    }
  }

  function readDemoAccounts() {
    const accounts = readJsonStorage(
      config.storageKeys.accounts,
      []
    );

    return Array.isArray(accounts)
      ? accounts
      : [];
  }

  function saveDemoAccounts(accounts) {
    writeJsonStorage(
      config.storageKeys.accounts,
      accounts
    );
  }

  function readDemoSession() {
    return readJsonStorage(
      config.storageKeys.session,
      null
    );
  }

  function saveDemoSession(accountId) {
    writeJsonStorage(
      config.storageKeys.session,
      {
        accountId,
        signedInAt: new Date().toISOString()
      }
    );
  }

  function clearDemoSession() {
    localStorage.removeItem(
      config.storageKeys.session
    );
  }

  /*
   * Passwords are stored only for local demo testing.
   * This storage path is never used when Supabase is connected.
   */
  function prepareDemoAccountForStorage(profile, password) {
    return {
      ...profile,
      demo_password: String(password)
    };
  }

  function removePrivateDemoFields(account) {
    if (!account) {
      return null;
    }

    const {
      demo_password: ignoredPassword,
      ...safeProfile
    } = account;

    return safeProfile;
  }

  /* =======================================================
     SUPABASE CLIENT
     ======================================================= */

  function hasSupabaseConfiguration() {
    const url = String(config.supabaseUrl || "");
    const key = String(config.supabaseAnonKey || "");

    return (
      url &&
      key &&
      !url.includes("YOUR_") &&
      !key.includes("YOUR_")
    );
  }

  function initializeClient() {
    state.demoMode =
      config.demoMode === true ||
      !hasSupabaseConfiguration();

    if (state.demoMode) {
      state.supabase = null;
      return;
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      throw new Error(
        "The Supabase library could not be loaded."
      );
    }

    state.supabase = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }

  /* =======================================================
     DEMO ACCOUNT OPERATIONS
     ======================================================= */

  async function createDemoAccount({
    firstName,
    lastName,
    email,
    password
  }) {
    const normalizedEmail = normalizeEmail(email);
    const accounts = readDemoAccounts();

    const duplicate = accounts.some(
      (account) =>
        normalizeEmail(account.email) ===
        normalizedEmail
    );

    if (duplicate) {
      throw new Error(
        "An account already exists for that email address."
      );
    }

    const now = new Date().toISOString();
    const role = configHelpers.normalizeRole(
      config.demoRole
    );

    const profile = {
      id: generateId(),
      auth_user_id: generateId(),
      first_name: cleanName(firstName),
      last_name: cleanName(lastName),
      display_name: makeDisplayName(
        firstName,
        lastName
      ),
      email: normalizedEmail,
      phone: "",
      role,
      account_status: "active",
      preferred_contact_method: "email",
      created_at: now,
      updated_at: now
    };

    accounts.push(
      prepareDemoAccountForStorage(
        profile,
        password
      )
    );

    saveDemoAccounts(accounts);
    saveDemoSession(profile.id);

    return profile;
  }

  async function signInDemoAccount(
    email,
    password
  ) {
    const normalizedEmail = normalizeEmail(email);
    const accounts = readDemoAccounts();

    const account = accounts.find(
      (candidate) =>
        normalizeEmail(candidate.email) ===
        normalizedEmail
    );

    if (!account) {
      throw new Error(
        "No account exists for that email on this device."
      );
    }

    if (
      String(account.demo_password || "") !==
      String(password || "")
    ) {
      throw new Error(
        "The email address or password is incorrect."
      );
    }

    if (account.account_status !== "active") {
      throw new Error(
        "This account is not currently active."
      );
    }

    saveDemoSession(account.id);

    return removePrivateDemoFields(account);
  }

  async function loadDemoProfileById(accountId) {
    const account = readDemoAccounts().find(
      (candidate) => candidate.id === accountId
    );

    return removePrivateDemoFields(account);
  }

  async function updateDemoProfile(profileId, changes) {
    const accounts = readDemoAccounts();
    const accountIndex = accounts.findIndex(
      (account) => account.id === profileId
    );

    if (accountIndex === -1) {
      throw new Error(
        "The local account could not be found."
      );
    }

    const existing = accounts[accountIndex];

    const firstName =
      changes.first_name !== undefined
        ? cleanName(changes.first_name)
        : existing.first_name;

    const lastName =
      changes.last_name !== undefined
        ? cleanName(changes.last_name)
        : existing.last_name;

    const updated = {
      ...existing,
      ...changes,
      first_name: firstName,
      last_name: lastName,
      display_name: makeDisplayName(
        firstName,
        lastName
      ),
      role: configHelpers.normalizeRole(
        existing.role
      ),
      updated_at: new Date().toISOString()
    };

    accounts[accountIndex] = updated;
    saveDemoAccounts(accounts);

    return removePrivateDemoFields(updated);
  }

  /* =======================================================
     PROFILE OPERATIONS
     ======================================================= */

  async function loadSupabaseProfile(user) {
    if (!user?.id) {
      return null;
    }

    const { data, error } = await state.supabase
      .from("volunteer_hub_profiles")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }

    /*
     * This fallback supports a fresh account if the database
     * trigger has not created its profile yet.
     */
    const metadata = user.user_metadata || {};
    const firstName = cleanName(
      metadata.first_name
    );
    const lastName = cleanName(
      metadata.last_name
    );

    const newProfile = {
      auth_user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      display_name: makeDisplayName(
        firstName,
        lastName
      ),
      email: normalizeEmail(user.email),
      phone: "",
      role: "volunteer",
      account_status: "active",
      preferred_contact_method: "email"
    };

    const {
      data: insertedProfile,
      error: insertError
    } = await state.supabase
      .from("volunteer_hub_profiles")
      .insert(newProfile)
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    return insertedProfile;
  }

  async function loadProfile(user = state.user) {
    if (state.demoMode) {
      if (!user?.profile_id) {
        return null;
      }

      return loadDemoProfileById(
        user.profile_id
      );
    }

    return loadSupabaseProfile(user);
  }

  async function updateProfile(changes) {
    if (!state.profile?.id) {
      throw new Error(
        "No signed-in profile is available."
      );
    }

    const allowedChanges = {
      first_name: cleanName(
        changes.first_name ??
          state.profile.first_name
      ),
      last_name: cleanName(
        changes.last_name ??
          state.profile.last_name
      ),
      phone: String(
        changes.phone ??
          state.profile.phone ??
          ""
      ).trim(),
      preferred_contact_method:
        String(
          changes.preferred_contact_method ??
            state.profile
              .preferred_contact_method ??
            "email"
        )
    };

    allowedChanges.display_name =
      makeDisplayName(
        allowedChanges.first_name,
        allowedChanges.last_name
      );

    if (!validateName(allowedChanges.first_name)) {
      throw new Error(
        "Enter a first name."
      );
    }

    if (!validateName(allowedChanges.last_name)) {
      throw new Error(
        "Enter a last name."
      );
    }

    if (state.demoMode) {
      state.profile = await updateDemoProfile(
        state.profile.id,
        allowedChanges
      );

      applyAuthenticatedState(
        state.profile
      );

      return state.profile;
    }

    const { data, error } = await state.supabase
      .from("volunteer_hub_profiles")
      .update({
        ...allowedChanges,
        updated_at: new Date().toISOString()
      })
      .eq("id", state.profile.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    state.profile = data;
    applyAuthenticatedState(data);

    return data;
  }

  /* =======================================================
     ACCOUNT CREATION AND SIGN-IN
     ======================================================= */

  async function createAccount({
    firstName,
    lastName,
    email,
    password
  }) {
    if (state.demoMode) {
      return createDemoAccount({
        firstName,
        lastName,
        email,
        password
      });
    }

    const { data, error } =
      await state.supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          data: {
            first_name: cleanName(firstName),
            last_name: cleanName(lastName),
            display_name: makeDisplayName(
              firstName,
              lastName
            )
          }
        }
      });

    if (error) {
      throw error;
    }

    return data;
  }

  async function signIn(email, password) {
    if (state.demoMode) {
      const profile =
        await signInDemoAccount(
          email,
          password
        );

      return {
        id: profile.auth_user_id,
        email: profile.email,
        profile_id: profile.id
      };
    }

    const { data, error } =
      await state.supabase.auth
        .signInWithPassword({
          email: normalizeEmail(email),
          password
        });

    if (error) {
      throw error;
    }

    return data.user;
  }

  async function sendPasswordReset(email) {
    const normalizedEmail =
      normalizeEmail(email);

    if (!validateEmail(normalizedEmail)) {
      throw new Error(
        "Enter a valid email address first."
      );
    }

    if (state.demoMode) {
      throw new Error(
        "Password reset email is unavailable during local testing."
      );
    }

    const redirectTo =
      `${window.location.origin}` +
      `${window.location.pathname}`;

    const { error } =
      await state.supabase.auth
        .resetPasswordForEmail(
          normalizedEmail,
          { redirectTo }
        );

    if (error) {
      throw error;
    }
  }

  /* =======================================================
     SESSION STATE
     ======================================================= */

  function resetState() {
    state.session = null;
    state.user = null;
    state.profile = null;
    state.role = "volunteer";
  }

  function applyAuthenticatedState(profile) {
    if (!profile) {
      resetState();
      return;
    }

    state.profile = profile;
    state.role = configHelpers.normalizeRole(
      profile.role
    );

    state.user = {
      id: profile.auth_user_id,
      email: profile.email,
      profile_id: profile.id
    };
  }

  async function restoreSession() {
    if (state.demoMode) {
      const demoSession = readDemoSession();

      if (!demoSession?.accountId) {
        return false;
      }

      const profile =
        await loadDemoProfileById(
          demoSession.accountId
        );

      if (
        !profile ||
        profile.account_status !== "active"
      ) {
        clearDemoSession();
        resetState();
        return false;
      }

      applyAuthenticatedState(profile);
      return true;
    }

    const { data, error } =
      await state.supabase.auth.getSession();

    if (error) {
      throw error;
    }

    state.session = data.session;

    if (!state.session?.user) {
      resetState();
      return false;
    }

    state.user = state.session.user;
    state.profile = await loadProfile(
      state.user
    );

    if (!state.profile) {
      resetState();
      return false;
    }

    state.role = configHelpers.normalizeRole(
      state.profile.role
    );

    return true;
  }

  async function signOut() {
    if (state.demoMode) {
      clearDemoSession();
    } else if (state.supabase) {
      const { error } =
        await state.supabase.auth.signOut();

      if (error) {
        throw error;
      }
    }

    resetState();

    document.body.classList.remove(
      "menu-open"
    );

    byId("appShell")?.classList.add(
      "is-hidden"
    );

    byId("authShell")?.classList.remove(
      "is-hidden"
    );

    byId("signInForm")?.reset();
    byId("createAccountForm")?.reset();

    clearFeedback(byId("signInFeedback"));
    clearFeedback(
      byId("createAccountFeedback")
    );

    window.scrollTo({
      top: 0,
      behavior: "auto"
    });
  }

  /* =======================================================
     AUTHENTICATION INTERFACE
     ======================================================= */

  function showCreateAccountForm() {
    const createTab =
      requireElement("createAccountTab");

    const signInTab =
      requireElement("signInTab");

    const createForm =
      requireElement("createAccountForm");

    const signInForm =
      requireElement("signInForm");

    createTab.classList.add("is-active");
    signInTab.classList.remove("is-active");

    createTab.setAttribute(
      "aria-selected",
      "true"
    );

    signInTab.setAttribute(
      "aria-selected",
      "false"
    );

    createForm.classList.remove(
      "is-hidden"
    );

    signInForm.classList.add(
      "is-hidden"
    );

    clearFeedback(
      byId("signInFeedback")
    );
  }

  function showSignInForm() {
    const createTab =
      requireElement("createAccountTab");

    const signInTab =
      requireElement("signInTab");

    const createForm =
      requireElement("createAccountForm");

    const signInForm =
      requireElement("signInForm");

    signInTab.classList.add("is-active");
    createTab.classList.remove("is-active");

    signInTab.setAttribute(
      "aria-selected",
      "true"
    );

    createTab.setAttribute(
      "aria-selected",
      "false"
    );

    signInForm.classList.remove(
      "is-hidden"
    );

    createForm.classList.add(
      "is-hidden"
    );

    clearFeedback(
      byId("createAccountFeedback")
    );
  }

  async function handleCreateAccount(event) {
    event.preventDefault();

    const feedback =
      requireElement(
        "createAccountFeedback"
      );

    const firstName =
      requireElement(
        "createFirstName"
      ).value;

    const lastName =
      requireElement(
        "createLastName"
      ).value;

    const email =
      normalizeEmail(
        requireElement(
          "createEmail"
        ).value
      );

    const password =
      requireElement(
        "createPassword"
      ).value;

    const confirmation =
      requireElement(
        "createPasswordConfirm"
      ).value;

    clearFeedback(feedback);

    if (!validateName(firstName)) {
      setFeedback(
        feedback,
        "Enter your first name.",
        "error"
      );
      return;
    }

    if (!validateName(lastName)) {
      setFeedback(
        feedback,
        "Enter your last name.",
        "error"
      );
      return;
    }

    if (!validateEmail(email)) {
      setFeedback(
        feedback,
        "Enter a valid email address.",
        "error"
      );
      return;
    }

    if (!validatePassword(password)) {
      setFeedback(
        feedback,
        "Password must contain at least 8 characters.",
        "error"
      );
      return;
    }

    if (password !== confirmation) {
      setFeedback(
        feedback,
        "Passwords do not match.",
        "error"
      );
      return;
    }

    try {
      setFeedback(
        feedback,
        "Creating your account…"
      );

      const result = await createAccount({
        firstName,
        lastName,
        email,
        password
      });

      if (state.demoMode) {
        applyAuthenticatedState(result);

        setFeedback(
          feedback,
          "Account created.",
          "success"
        );

        await enterAuthenticatedApp();
        return;
      }

      if (result.session?.user) {
        state.session = result.session;
        state.user = result.user;
        state.profile = await loadProfile(
          result.user
        );

        state.role =
          configHelpers.normalizeRole(
            state.profile?.role
          );

        await enterAuthenticatedApp();
        return;
      }

      setFeedback(
        feedback,
        "Account created. Check your email to confirm your account, then sign in.",
        "success"
      );

      showSignInForm();

      requireElement(
        "signInEmail"
      ).value = email;
    } catch (error) {
      console.error(
        "Account creation failed:",
        error
      );

      setFeedback(
        feedback,
        error.message ||
          "Unable to create the account.",
        "error"
      );
    }
  }

  async function handleSignIn(event) {
    event.preventDefault();

    const feedback =
      requireElement("signInFeedback");

    const email = normalizeEmail(
      requireElement("signInEmail").value
    );

    const password =
      requireElement(
        "signInPassword"
      ).value;

    clearFeedback(feedback);

    if (!validateEmail(email)) {
      setFeedback(
        feedback,
        "Enter a valid email address.",
        "error"
      );
      return;
    }

    if (!password) {
      setFeedback(
        feedback,
        "Enter your password.",
        "error"
      );
      return;
    }

    try {
      setFeedback(
        feedback,
        "Signing in…"
      );

      const user = await signIn(
        email,
        password
      );

      state.user = user;
      state.profile = await loadProfile(user);

      if (!state.profile) {
        throw new Error(
          "The account profile could not be loaded."
        );
      }

      state.role =
        configHelpers.normalizeRole(
          state.profile.role
        );

      clearFeedback(feedback);
      await enterAuthenticatedApp();
    } catch (error) {
      console.error(
        "Sign-in failed:",
        error
      );

      setFeedback(
        feedback,
        error.message ||
          "Unable to sign in.",
        "error"
      );
    }
  }

  async function handleForgotPassword() {
    const feedback =
      requireElement("signInFeedback");

    const email = normalizeEmail(
      requireElement("signInEmail").value
    );

    try {
      setFeedback(
        feedback,
        "Preparing password reset…"
      );

      await sendPasswordReset(email);

      setFeedback(
        feedback,
        "Password reset email sent.",
        "success"
      );
    } catch (error) {
      setFeedback(
        feedback,
        error.message ||
          "Unable to send a password reset email.",
        "error"
      );
    }
  }

  async function enterAuthenticatedApp() {
    requireElement(
      "authShell"
    ).classList.add("is-hidden");

    requireElement(
      "appShell"
    ).classList.remove("is-hidden");

    document.body.classList.remove(
      "menu-open"
    );

    if (
      !window.BTHApp ||
      typeof window.BTHApp.enter !== "function"
    ) {
      throw new Error(
        "The application could not finish loading."
      );
    }

    await window.BTHApp.enter();
  }

  function wireAuthenticationInterface() {
    requireElement(
      "createAccountTab"
    ).addEventListener(
      "click",
      showCreateAccountForm
    );

    requireElement(
      "signInTab"
    ).addEventListener(
      "click",
      showSignInForm
    );

    requireElement(
      "createAccountForm"
    ).addEventListener(
      "submit",
      handleCreateAccount
    );

    requireElement(
      "signInForm"
    ).addEventListener(
      "submit",
      handleSignIn
    );

    requireElement(
      "forgotPasswordButton"
    ).addEventListener(
      "click",
      handleForgotPassword
    );

    requireElement(
      "signOutButton"
    ).addEventListener(
      "click",
      async () => {
        try {
          await signOut();
        } catch (error) {
          console.error(
            "Sign-out failed:",
            error
          );
        }
      }
    );
  }

  /* =======================================================
     INITIALIZATION
     ======================================================= */

  async function initializeAuthentication() {
    initializeClient();
    wireAuthenticationInterface();

    try {
      const restored =
        await restoreSession();

      state.ready = true;

      if (restored) {
        await enterAuthenticatedApp();
      }
    } catch (error) {
      console.error(
        "Session restoration failed:",
        error
      );

      resetState();
      state.ready = true;

      setFeedback(
        byId("signInFeedback"),
        "The previous session could not be restored. Please sign in again.",
        "error"
      );
    }
  }

  /* =======================================================
     PUBLIC AUTHENTICATION API
     ======================================================= */

  window.BTHAuth = Object.freeze({
    initializeClient,
    restoreSession,
    createAccount,
    signIn,
    signOut,
    loadProfile,
    updateProfile,
    sendPasswordReset,
    makeDisplayName,
    setFeedback,
    clearFeedback,
    getRoleLabel,
    hasAdministrativeAccess,
    getState() {
      return state;
    }
  });

  document.addEventListener(
    "DOMContentLoaded",
    initializeAuthentication,
    { once: true }
  );
})();
