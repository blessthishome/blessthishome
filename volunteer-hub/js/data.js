(() => {
  "use strict";

  const config = window.BTH_CONFIG;
  const configHelpers = window.BTHConfig;
  const state = window.BTH_STATE;

  if (!config || !configHelpers || !state) {
    throw new Error(
      "Volunteer Hub configuration and authentication must load before data.js."
    );
  }

  /* =======================================================
     TABLE NAMES

     These names match the Supabase schema that will be
     created after the local application is complete.
     ======================================================= */

  const TABLES = Object.freeze({
  profiles: "volunteer_hub_profiles",
  shifts: "volunteer_shifts",
  requests: "volunteer_shift_requests",
  messages: "volunteer_messages",
  hours: "volunteer_hub_hours",
  weeklyAvailability: "volunteer_weekly_availability",
  specificAvailability: "volunteer_specific_availability"
});

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

  function clone(value) {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function addLocalDays(amount) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + amount);

    return localDateString(date);
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function normalizeTime(value) {
    const text = String(value || "").trim();

    if (!text) {
      return null;
    }

    return /^\d{2}:\d{2}$/.test(text)
      ? text
      : null;
  }

  function normalizeDate(value) {
    const text = String(value || "").trim();

    return /^\d{4}-\d{2}-\d{2}$/.test(text)
      ? text
      : null;
  }

  function timeToMinutes(value) {
    const normalized = normalizeTime(value);

    if (!normalized) {
      return null;
    }

    const [hours, minutes] =
      normalized.split(":").map(Number);

    return hours * 60 + minutes;
  }

  function calculateHours(
    date,
    startTime,
    endTime
  ) {
    const normalizedDate =
      normalizeDate(date);

    const startMinutes =
      timeToMinutes(startTime);

    const endMinutes =
      timeToMinutes(endTime);

    if (
      !normalizedDate ||
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      throw new Error(
        "End time must be later than start time."
      );
    }

    return Number(
      (
        (endMinutes - startMinutes) /
        60
      ).toFixed(2)
    );
  }

  function currentProfile() {
    if (!state.profile?.id) {
      throw new Error(
        "You must be signed in to complete this action."
      );
    }

    return state.profile;
  }

  function requireAdministrativeAccess() {
    if (
      !configHelpers.hasAdministrativeAccess(
        state.role
      )
    ) {
      throw new Error(
        "Administrator access is required."
      );
    }
  }

  function sortByDateAndTime(a, b) {
    const first =
      `${a.shift_date || a.entry_date || a.exception_date || ""}` +
      `${a.start_time || ""}`;

    const second =
      `${b.shift_date || b.entry_date || b.exception_date || ""}` +
      `${b.start_time || ""}`;

    return first.localeCompare(second);
  }

  function sortNewestFirst(a, b) {
    return String(
      b.created_at || ""
    ).localeCompare(
      String(a.created_at || "")
    );
  }

  function ensureArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  /* =======================================================
     LOCAL STORAGE
     ======================================================= */

  function readJsonStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) {
        return fallback;
      }

      return JSON.parse(raw);
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
        "The browser could not save this information."
      );
    }
  }

  function createEmptyStore() {
    return {
      schema_version: 1,
      initialized_at: nowIso(),
      directory_profiles: [],
      shifts: [],
      shift_requests: [],
      messages: [],
      hours: [],
      weekly_availability: [],
      specific_availability: []
    };
  }

  function normalizeStore(input) {
    const store =
      input &&
      typeof input === "object"
        ? input
        : createEmptyStore();

    return {
      schema_version: 1,
      initialized_at:
        store.initialized_at || nowIso(),
      directory_profiles:
        ensureArray(
          store.directory_profiles
        ),
      shifts:
        ensureArray(store.shifts),
      shift_requests:
        ensureArray(
          store.shift_requests
        ),
      messages:
        ensureArray(store.messages),
      hours:
        ensureArray(store.hours),
      weekly_availability:
        ensureArray(
          store.weekly_availability
        ),
      specific_availability:
        ensureArray(
          store.specific_availability
        )
    };
  }

  function readStore() {
    return normalizeStore(
      readJsonStorage(
        config.storageKeys.data,
        null
      )
    );
  }

  function saveStore(store) {
    writeJsonStorage(
      config.storageKeys.data,
      normalizeStore(store)
    );
  }

  function updateStore(mutator) {
    const store = readStore();

    const result = mutator(store);

    saveStore(store);

    return result;
  }

  /* =======================================================
     DEMO DIRECTORY PROFILES

     These records provide populated administrative screens
     without creating fake sign-in credentials.
     ======================================================= */

  function createSeedDirectoryProfiles() {
    return [
      {
        id: "demo-profile-melissa",
        auth_user_id: null,
        first_name: "Melissa",
        last_name: "Taylor",
        display_name: "Melissa T.",
        email: "melissa@example.com",
        phone: "",
        role: "volunteer",
        account_status: "active",
        preferred_contact_method: "email",
        created_at: nowIso(),
        updated_at: nowIso()
      },
      {
        id: "demo-profile-david",
        auth_user_id: null,
        first_name: "David",
        last_name: "Parker",
        display_name: "David P.",
        email: "david@example.com",
        phone: "",
        role: "volunteer",
        account_status: "active",
        preferred_contact_method: "text",
        created_at: nowIso(),
        updated_at: nowIso()
      },
      {
        id: "demo-profile-jordan",
        auth_user_id: null,
        first_name: "Jordan",
        last_name: "Miller",
        display_name: "Jordan M.",
        email: "jordan@example.com",
        phone: "",
        role: "volunteer",
        account_status: "active",
        preferred_contact_method: "email",
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];
  }

  /* =======================================================
     DEMO SEED DATA
     ======================================================= */

  function createSeedStore() {
    const store = createEmptyStore();

    const profiles =
      createSeedDirectoryProfiles();

    const shiftOneId =
      "demo-shift-store";

    const shiftTwoId =
      "demo-shift-warehouse";

    const shiftThreeId =
      "demo-shift-hauler";

    store.directory_profiles = profiles;

    store.shifts = [
      {
        id: shiftOneId,
        title: "Thrift Store Support",
        shift_date: addLocalDays(1),
        start_time: "09:00",
        end_time: "13:00",
        shift_type: "Thrift Store",
        location:
          "Bless This Home Thrift Store",
        description:
          "Help customers and organize incoming donations.",
        duties: [
          "Straighten the showroom",
          "Greet customers",
          "Organize incoming donations"
        ],
        minimum_people: 2,
        preferred_people: 4,
        maximum_people: 6,
        status: "published",
        created_by: "demo-admin",
        created_at: nowIso(),
        updated_at: nowIso()
      },
      {
        id: shiftTwoId,
        title: "Warehouse Organization",
        shift_date: addLocalDays(3),
        start_time: "10:00",
        end_time: "14:00",
        shift_type: "Warehouse",
        location: "Main Warehouse",
        description:
          "Prepare furniture for upcoming distributions and deliveries.",
        duties: [
          "Keep table parts together",
          "Organize mattresses by size",
          "Keep aisles and exits clear"
        ],
        minimum_people: 2,
        preferred_people: 3,
        maximum_people: 5,
        status: "published",
        created_by: "demo-admin",
        created_at: nowIso(),
        updated_at: nowIso()
      },
      {
        id: shiftThreeId,
        title: "Delivery and Hauler Team",
        shift_date: addLocalDays(5),
        start_time: "08:30",
        end_time: "13:30",
        shift_type: "Hauler",
        location: "Hauler Station",
        description:
          "Load, secure, deliver, and return furniture safely.",
        duties: [
          "Inspect straps and blankets",
          "Use two people for heavy items",
          "Sweep and organize the truck after the route"
        ],
        minimum_people: 2,
        preferred_people: 4,
        maximum_people: 4,
        status: "published",
        created_by: "demo-admin",
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    store.shift_requests = [
      {
        id: "demo-request-approved",
        shift_id: shiftOneId,
        profile_id:
          "demo-profile-melissa",
        display_name: "Melissa T.",
        request_type: "full",
        start_time: "09:00",
        end_time: "13:00",
        note: "",
        status: "approved",
        admin_note:
          "Thank you for helping.",
        reviewed_by: "demo-admin",
        reviewed_at: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso()
      },
      {
        id: "demo-request-pending",
        shift_id: shiftTwoId,
        profile_id:
          "demo-profile-david",
        display_name: "David P.",
        request_type: "partial",
        start_time: "11:00",
        end_time: "14:00",
        note:
          "I can arrive after a morning appointment.",
        status: "pending",
        admin_note: "",
        reviewed_by: null,
        reviewed_at: null,
        created_at: nowIso(),
        updated_at: nowIso()
      },
      {
        id: "demo-request-hauler",
        shift_id: shiftThreeId,
        profile_id:
          "demo-profile-jordan",
        display_name: "Jordan M.",
        request_type: "full",
        start_time: "08:30",
        end_time: "13:30",
        note: "",
        status: "approved",
        admin_note: "",
        reviewed_by: "demo-admin",
        reviewed_at: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    store.messages = [
      {
        id: "demo-message-welcome",
        title:
          "Welcome to the Volunteer Hub",
        category: "Announcements",
        body:
          "Use the schedule to view open shifts, submit requests, and review your approval status.",
        pinned: true,
        published: true,
        author_profile_id:
          "demo-admin",
        author_display_name:
          "Bless This Home",
        created_at: nowIso(),
        updated_at: nowIso()
      },
      {
        id: "demo-message-door",
        title:
          "Warehouse entrance reminder",
        category: "Volunteer Updates",
        body:
          "Please use the warehouse entrance when reporting for warehouse or hauler shifts.",
        pinned: false,
        published: true,
        author_profile_id:
          "demo-admin",
        author_display_name:
          "Bless This Home",
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    store.hours = [
      {
        id: "demo-hours-pending",
        profile_id:
          "demo-profile-david",
        display_name: "David P.",
        entry_date: addLocalDays(-1),
        start_time: "09:00",
        end_time: "12:00",
        total_hours: 3,
        shift_id: null,
        note:
          "Helped organize incoming furniture.",
        status: "pending",
        admin_note: "",
        reviewed_by: null,
        reviewed_at: null,
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    store.weekly_availability = [
      {
        id:
          "demo-weekly-melissa",
        profile_id:
          "demo-profile-melissa",
        days: {
          "0": {
            status: "unavailable",
            start_time: null,
            end_time: null
          },
          "1": {
            status: "morning",
            start_time: "08:00",
            end_time: "12:00"
          },
          "2": {
            status: "unavailable",
            start_time: null,
            end_time: null
          },
          "3": {
            status: "afternoon",
            start_time: "12:00",
            end_time: "17:00"
          },
          "4": {
            status: "unavailable",
            start_time: null,
            end_time: null
          },
          "5": {
            status: "unavailable",
            start_time: null,
            end_time: null
          },
          "6": {
            status: "open",
            start_time: null,
            end_time: null
          }
        },
        note:
          "Please contact me one day in advance.",
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    store.specific_availability = [
      {
        id: "demo-specific-david",
        profile_id:
          "demo-profile-david",
        exception_date:
          addLocalDays(7),
        is_available: true,
        time_window: "custom",
        start_time: "10:00",
        end_time: "14:00",
        note:
          "Available after 10 AM.",
        created_at: nowIso(),
        updated_at: nowIso()
      }
    ];

    return store;
  }

  function initializeDemoStore() {
    const existing =
      readJsonStorage(
        config.storageKeys.data,
        null
      );

    if (
      existing &&
      existing.schema_version === 1
    ) {
      saveStore(
        normalizeStore(existing)
      );

      return;
    }

    saveStore(createSeedStore());
  }

  /* =======================================================
     ACCOUNT DIRECTORY
     ======================================================= */

  function readDemoAccountProfiles() {
    const accounts =
      readJsonStorage(
        config.storageKeys.accounts,
        []
      );

    if (!Array.isArray(accounts)) {
      return [];
    }

    return accounts.map((account) => ({
      id: account.id,
      auth_user_id:
        account.auth_user_id,
      first_name:
        account.first_name,
      last_name:
        account.last_name,
      display_name:
        account.display_name,
      email:
        normalizeEmail(account.email),
      phone:
        account.phone || "",
      role:
        configHelpers.normalizeRole(
          account.role
        ),
      account_status:
        account.account_status ||
        "active",
      preferred_contact_method:
        account.preferred_contact_method ||
        "email",
      created_at:
        account.created_at || null,
      updated_at:
        account.updated_at || null
    }));
  }

  function mergeProfiles(
    directoryProfiles,
    accountProfiles
  ) {
    const byProfileId = new Map();

    [
      ...directoryProfiles,
      ...accountProfiles
    ].forEach((profile) => {
      if (!profile?.id) {
        return;
      }

      byProfileId.set(
        profile.id,
        profile
      );
    });

    return [...byProfileId.values()]
      .sort((a, b) =>
        String(
          a.display_name || ""
        ).localeCompare(
          String(
            b.display_name || ""
          )
        )
      );
  }

  async function listProfiles(options = {}) {
    if (state.demoMode) {
      const store = readStore();

      let profiles = mergeProfiles(
        store.directory_profiles,
        readDemoAccountProfiles()
      );

      if (options.role) {
        profiles = profiles.filter(
          (profile) =>
            profile.role ===
            options.role
        );
      }

      if (
        options.activeOnly !== false
      ) {
        profiles = profiles.filter(
          (profile) =>
            profile.account_status ===
            "active"
        );
      }

      return clone(profiles);
    }

    let query = state.supabase
      .from(TABLES.profiles)
      .select("*")
      .order("display_name");

    if (options.role) {
      query = query.eq(
        "role",
        options.role
      );
    }

    if (
      options.activeOnly !== false
    ) {
      query = query.eq(
        "account_status",
        "active"
      );
    }

    const { data, error } =
      await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function getProfile(profileId) {
    const profiles =
      await listProfiles({
        activeOnly: false
      });

    return (
      profiles.find(
        (profile) =>
          profile.id === profileId
      ) || null
    );
  }

  /* =======================================================
     SHIFT HYDRATION
     ======================================================= */

  function hydrateShift(
    shift,
    requests
  ) {
    const shiftRequests =
      requests.filter(
        (request) =>
          request.shift_id === shift.id
      );

    const approvedRequests =
      shiftRequests.filter(
        (request) =>
          request.status === "approved"
      );

    const pendingRequests =
      shiftRequests.filter(
        (request) =>
          request.status === "pending"
      );

    return {
      ...shift,
      duties:
        ensureArray(shift.duties),
      requests: shiftRequests,
      approved_requests:
        approvedRequests,
      pending_requests:
        pendingRequests,
      approved_count:
        approvedRequests.length,
      pending_count:
        pendingRequests.length,
      remaining_preferred:
        Math.max(
          0,
          Number(
            shift.preferred_people || 0
          ) -
            approvedRequests.length
        ),
      remaining_maximum:
        Math.max(
          0,
          Number(
            shift.maximum_people || 0
          ) -
            approvedRequests.length
        )
    };
  }

  /* =======================================================
     SHIFTS
     ======================================================= */

  async function listShifts(options = {}) {
    if (state.demoMode) {
      const store = readStore();

      let shifts = store.shifts.map(
        (shift) =>
          hydrateShift(
            shift,
            store.shift_requests
          )
      );

      if (options.status) {
        shifts = shifts.filter(
          (shift) =>
            shift.status ===
            options.status
        );
      } else if (
        options.includeCancelled !== true
      ) {
        shifts = shifts.filter(
          (shift) =>
            shift.status !==
            "cancelled"
        );
      }

      if (options.dateFrom) {
        shifts = shifts.filter(
          (shift) =>
            shift.shift_date >=
            options.dateFrom
        );
      }

      if (options.dateTo) {
        shifts = shifts.filter(
          (shift) =>
            shift.shift_date <=
            options.dateTo
        );
      }

      if (options.shiftType) {
        shifts = shifts.filter(
          (shift) =>
            shift.shift_type ===
            options.shiftType
        );
      }

      return clone(
        shifts.sort(
          sortByDateAndTime
        )
      );
    }

    let query = state.supabase
      .from(TABLES.shifts)
      .select(
  `
    *,
    volunteer_shift_requests (*)
  `
)
      .order("shift_date")
      .order("start_time");

    if (options.status) {
      query = query.eq(
        "status",
        options.status
      );
    } else if (
      options.includeCancelled !== true
    ) {
      query = query.neq(
        "status",
        "cancelled"
      );
    }

    if (options.dateFrom) {
      query = query.gte(
        "shift_date",
        options.dateFrom
      );
    }

    if (options.dateTo) {
      query = query.lte(
        "shift_date",
        options.dateTo
      );
    }

    if (options.shiftType) {
      query = query.eq(
        "shift_type",
        options.shiftType
      );
    }

    const { data, error } =
      await query;

    if (error) {
      throw error;
    }

    return (data || []).map(
  (shift) =>
    hydrateShift(
      shift,
      shift.volunteer_shift_requests || []
    )
);
  }

  async function getShift(shiftId) {
    const shifts =
      await listShifts({
        includeCancelled: true
      });

    return (
      shifts.find(
        (shift) =>
          shift.id === shiftId
      ) || null
    );
  }

  function validateShiftPayload(payload) {
    const date =
      normalizeDate(
        payload.shift_date
      );

    const startTime =
      normalizeTime(
        payload.start_time
      );

    const endTime =
      normalizeTime(
        payload.end_time
      );

    if (
      !normalizeText(payload.title)
    ) {
      throw new Error(
        "Enter a shift title."
      );
    }

    if (!date) {
      throw new Error(
        "Choose a valid shift date."
      );
    }

    if (
      !startTime ||
      !endTime ||
      timeToMinutes(endTime) <=
        timeToMinutes(startTime)
    ) {
      throw new Error(
        "Choose a valid shift start and end time."
      );
    }

    const minimum = Number(
      payload.minimum_people
    );

    const preferred = Number(
      payload.preferred_people
    );

    const maximum = Number(
      payload.maximum_people
    );

    if (
      !Number.isFinite(minimum) ||
      !Number.isFinite(preferred) ||
      !Number.isFinite(maximum) ||
      minimum < 0 ||
      preferred < 1 ||
      maximum < 1 ||
      preferred < minimum ||
      maximum < preferred
    ) {
      throw new Error(
        "Staffing must follow minimum, preferred, and maximum order."
      );
    }

    if (
      !normalizeText(
        payload.location
      )
    ) {
      throw new Error(
        "Choose or enter a location."
      );
    }

    return {
      title:
        normalizeText(payload.title),
      shift_date: date,
      start_time: startTime,
      end_time: endTime,
      shift_type:
        normalizeText(
          payload.shift_type
        ) || "Other",
      location:
        normalizeText(
          payload.location
        ),
      description:
        normalizeText(
          payload.description
        ),
      duties:
        ensureArray(
          payload.duties
        )
          .map(normalizeText)
          .filter(Boolean),
      minimum_people: minimum,
      preferred_people: preferred,
      maximum_people: maximum
    };
  }

  async function createShift(payload) {
    requireAdministrativeAccess();

    const profile =
      currentProfile();

    const values =
      validateShiftPayload(payload);

    const record = {
      id: generateId(),
      ...values,
      status: "published",
      created_by: profile.id,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    if (state.demoMode) {
      updateStore((store) => {
        store.shifts.push(record);
      });

      return clone(
        hydrateShift(record, [])
      );
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.shifts)
        .insert({
          ...values,
          status: "published",
          created_by: profile.id
        })
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return hydrateShift(data, []);
  }

  async function updateShift(
    shiftId,
    payload
  ) {
    requireAdministrativeAccess();

    const values =
      validateShiftPayload(payload);

    if (state.demoMode) {
      const updated =
        updateStore((store) => {
          const index =
            store.shifts.findIndex(
              (shift) =>
                shift.id === shiftId
            );

          if (index === -1) {
            throw new Error(
              "The shift could not be found."
            );
          }

          store.shifts[index] = {
            ...store.shifts[index],
            ...values,
            updated_at: nowIso()
          };

          return store.shifts[index];
        });

      const store = readStore();

      return clone(
        hydrateShift(
          updated,
          store.shift_requests
        )
      );
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.shifts)
        .update({
          ...values,
          updated_at: nowIso()
        })
        .eq("id", shiftId)
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function cancelShift(
    shiftId
  ) {
    requireAdministrativeAccess();

    if (state.demoMode) {
      return clone(
        updateStore((store) => {
          const shift =
            store.shifts.find(
              (item) =>
                item.id === shiftId
            );

          if (!shift) {
            throw new Error(
              "The shift could not be found."
            );
          }

          shift.status = "cancelled";
          shift.updated_at = nowIso();

          store.shift_requests
            .filter(
              (request) =>
                request.shift_id ===
                shiftId &&
                [
                  "pending",
                  "approved"
                ].includes(
                  request.status
                )
            )
            .forEach((request) => {
              request.status =
                "cancelled";
              request.updated_at =
                nowIso();
            });

          return shift;
        })
      );
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.shifts)
        .update({
          status: "cancelled",
          updated_at: nowIso()
        })
        .eq("id", shiftId)
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    await state.supabase
      .from(TABLES.requests)
      .update({
        status: "cancelled",
        updated_at: nowIso()
      })
      .eq("shift_id", shiftId)
      .in("status", [
        "pending",
        "approved"
      ]);

    return data;
  }

  /* =======================================================
     SHIFT REQUESTS
     ======================================================= */

  async function listShiftRequests(
    options = {}
  ) {
    if (state.demoMode) {
      const store = readStore();

      let requests =
        store.shift_requests.map(
          (request) => ({
            ...request,
            shift:
              store.shifts.find(
                (shift) =>
                  shift.id ===
                  request.shift_id
              ) || null,
            profile:
              mergeProfiles(
                store.directory_profiles,
                readDemoAccountProfiles()
              ).find(
                (profile) =>
                  profile.id ===
                  request.profile_id
              ) || null
          })
        );

      if (options.profileId) {
        requests = requests.filter(
          (request) =>
            request.profile_id ===
            options.profileId
        );
      }

      if (options.shiftId) {
        requests = requests.filter(
          (request) =>
            request.shift_id ===
            options.shiftId
        );
      }

      if (options.status) {
        requests = requests.filter(
          (request) =>
            request.status ===
            options.status
        );
      }

      return clone(
        requests.sort(
          sortNewestFirst
        )
      );
    }

    let query = state.supabase
      .from(TABLES.requests)
     .select(
  `
    *,
    volunteer_shifts (*),
    volunteer_hub_profiles (*)
  `
)
      .order("created_at", {
        ascending: false
      });

    if (options.profileId) {
      query = query.eq(
        "profile_id",
        options.profileId
      );
    }

    if (options.shiftId) {
      query = query.eq(
        "shift_id",
        options.shiftId
      );
    }

    if (options.status) {
      query = query.eq(
        "status",
        options.status
      );
    }

    const { data, error } =
      await query;

    if (error) {
      throw error;
    }

    return (data || []).map(
  (request) => ({
    ...request,
    shift:
      request.volunteer_shifts || null,
    profile:
      request.volunteer_hub_profiles || null
  })
);
  }

  async function createShiftRequest(
    shiftId,
    payload
  ) {
    const profile =
      currentProfile();

    const shift =
      await getShift(shiftId);

    if (
      !shift ||
      shift.status !== "published"
    ) {
      throw new Error(
        "This shift is not available."
      );
    }

    const existing =
      (
        await listShiftRequests({
          shiftId,
          profileId: profile.id
        })
      ).find((request) =>
        [
          "pending",
          "approved"
        ].includes(request.status)
      );

    if (existing) {
      throw new Error(
        "You already have an active request for this shift."
      );
    }

    const requestType =
      payload.request_type === "partial"
        ? "partial"
        : "full";

    let startTime =
      shift.start_time;

    let endTime =
      shift.end_time;

    if (requestType === "partial") {
      startTime =
        normalizeTime(
          payload.start_time
        );

      endTime =
        normalizeTime(
          payload.end_time
        );

      if (
        !startTime ||
        !endTime ||
        timeToMinutes(endTime) <=
          timeToMinutes(startTime)
      ) {
        throw new Error(
          "Choose valid partial-shift times."
        );
      }

      if (
        timeToMinutes(startTime) <
          timeToMinutes(
            shift.start_time
          ) ||
        timeToMinutes(endTime) >
          timeToMinutes(
            shift.end_time
          )
      ) {
        throw new Error(
          "Partial hours must fall within the shift time."
        );
      }
    }

    const record = {
      id: generateId(),
      shift_id: shiftId,
      profile_id: profile.id,
      display_name:
        profile.display_name,
      request_type: requestType,
      start_time: startTime,
      end_time: endTime,
      note:
        normalizeText(payload.note),
      status:
        config.schedule
          .defaultShiftRequestStatus,
      admin_note: "",
      reviewed_by: null,
      reviewed_at: null,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    if (state.demoMode) {
      updateStore((store) => {
        store.shift_requests.push(
          record
        );
      });

      return clone(record);
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.requests)
        .insert({
          ...record,
          id: undefined
        })
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function withdrawShiftRequest(
    requestId
  ) {
    const profile =
      currentProfile();

    if (state.demoMode) {
      return clone(
        updateStore((store) => {
          const request =
            store.shift_requests.find(
              (item) =>
                item.id === requestId
            );

          if (!request) {
            throw new Error(
              "The request could not be found."
            );
          }

          if (
            request.profile_id !==
              profile.id &&
            !configHelpers
              .hasAdministrativeAccess(
                state.role
              )
          ) {
            throw new Error(
              "You cannot change this request."
            );
          }

          if (
            ![
              "pending",
              "approved"
            ].includes(
              request.status
            )
          ) {
            throw new Error(
              "This request can no longer be withdrawn."
            );
          }

          request.status =
            "withdrawn";
          request.updated_at =
            nowIso();

          return request;
        })
      );
    }

    let query = state.supabase
      .from(TABLES.requests)
      .update({
        status: "withdrawn",
        updated_at: nowIso()
      })
      .eq("id", requestId);

    if (
      !configHelpers.hasAdministrativeAccess(
        state.role
      )
    ) {
      query = query.eq(
        "profile_id",
        profile.id
      );
    }

    const { data, error } =
      await query
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function reviewShiftRequest(
    requestId,
    decision,
    adminNote = ""
  ) {
    requireAdministrativeAccess();

    if (
      !["approved", "declined"].includes(
        decision
      )
    ) {
      throw new Error(
        "Choose approve or decline."
      );
    }

    const reviewer =
      currentProfile();

    if (state.demoMode) {
      return clone(
        updateStore((store) => {
          const request =
            store.shift_requests.find(
              (item) =>
                item.id === requestId
            );

          if (!request) {
            throw new Error(
              "The request could not be found."
            );
          }

          if (
            request.status !==
            "pending"
          ) {
            throw new Error(
              "This request has already been reviewed."
            );
          }

          if (
            decision === "approved"
          ) {
            const shift =
              store.shifts.find(
                (item) =>
                  item.id ===
                  request.shift_id
              );

            if (!shift) {
              throw new Error(
                "The related shift could not be found."
              );
            }

            const approvedCount =
              store.shift_requests.filter(
                (item) =>
                  item.shift_id ===
                    request.shift_id &&
                  item.status ===
                    "approved"
              ).length;

            if (
              approvedCount >=
              Number(
                shift.maximum_people
              )
            ) {
              throw new Error(
                "This shift is already at maximum staffing."
              );
            }
          }

          request.status = decision;
          request.admin_note =
            normalizeText(adminNote);
          request.reviewed_by =
            reviewer.id;
          request.reviewed_at =
            nowIso();
          request.updated_at =
            nowIso();

          return request;
        })
      );
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.requests)
        .update({
          status: decision,
          admin_note:
            normalizeText(adminNote),
          reviewed_by:
            reviewer.id,
          reviewed_at: nowIso(),
          updated_at: nowIso()
        })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /* =======================================================
     MESSAGES
     ======================================================= */

  async function listMessages(
    options = {}
  ) {
    if (state.demoMode) {
      let messages =
        readStore().messages;

      if (
        options.includeUnpublished !==
        true
      ) {
        messages = messages.filter(
          (message) =>
            message.published !== false
        );
      }

      return clone(
        [...messages].sort(
          (a, b) =>
            Number(Boolean(b.pinned)) -
              Number(Boolean(a.pinned)) ||
            sortNewestFirst(a, b)
        )
      );
    }

    let query = state.supabase
      .from(TABLES.messages)
      .select("*")
      .order("pinned", {
        ascending: false
      })
      .order("created_at", {
        ascending: false
      });

    if (
      options.includeUnpublished !==
      true
    ) {
      query = query.eq(
        "published",
        true
      );
    }

    const { data, error } =
      await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function createMessage(payload) {
    requireAdministrativeAccess();

    const profile =
      currentProfile();

    const title =
      normalizeText(payload.title);

    const body =
      normalizeText(payload.body);

    if (!title) {
      throw new Error(
        "Enter a message title."
      );
    }

    if (!body) {
      throw new Error(
        "Enter a message."
      );
    }

    const record = {
      id: generateId(),
      title,
      category:
        normalizeText(
          payload.category
        ) || "General",
      body,
      pinned:
        Boolean(payload.pinned),
      published: true,
      author_profile_id:
        profile.id,
      author_display_name:
        profile.display_name,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    if (state.demoMode) {
      updateStore((store) => {
        store.messages.push(record);
      });

      return clone(record);
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.messages)
        .insert({
          title: record.title,
          category:
            record.category,
          body: record.body,
          pinned: record.pinned,
          published: true,
          author_profile_id:
            profile.id,
          author_display_name:
            profile.display_name
        })
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function updateMessage(
    messageId,
    payload
  ) {
    requireAdministrativeAccess();

    const values = {
      title:
        normalizeText(payload.title),
      category:
        normalizeText(
          payload.category
        ) || "General",
      body:
        normalizeText(payload.body),
      pinned:
        Boolean(payload.pinned),
      updated_at: nowIso()
    };

    if (!values.title || !values.body) {
      throw new Error(
        "A title and message are required."
      );
    }

    if (state.demoMode) {
      return clone(
        updateStore((store) => {
          const message =
            store.messages.find(
              (item) =>
                item.id === messageId
            );

          if (!message) {
            throw new Error(
              "The message could not be found."
            );
          }

          Object.assign(
            message,
            values
          );

          return message;
        })
      );
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.messages)
        .update(values)
        .eq("id", messageId)
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function deleteMessage(
    messageId
  ) {
    requireAdministrativeAccess();

    if (state.demoMode) {
      updateStore((store) => {
        store.messages =
          store.messages.filter(
            (message) =>
              message.id !==
              messageId
          );
      });

      return true;
    }

    const { error } =
      await state.supabase
        .from(TABLES.messages)
        .delete()
        .eq("id", messageId);

    if (error) {
      throw error;
    }

    return true;
  }

  /* =======================================================
     VOLUNTEER HOURS
     ======================================================= */

  async function listHours(options = {}) {
    if (state.demoMode) {
      let rows =
        readStore().hours;

      if (options.profileId) {
        rows = rows.filter(
          (row) =>
            row.profile_id ===
            options.profileId
        );
      }

      if (options.status) {
        rows = rows.filter(
          (row) =>
            row.status ===
            options.status
        );
      }

      if (options.dateFrom) {
        rows = rows.filter(
          (row) =>
            row.entry_date >=
            options.dateFrom
        );
      }

      if (options.dateTo) {
        rows = rows.filter(
          (row) =>
            row.entry_date <=
            options.dateTo
        );
      }

      return clone(
        [...rows].sort((a, b) =>
          String(
            b.entry_date
          ).localeCompare(
            String(a.entry_date)
          )
        )
      );
    }

    let query = state.supabase
      .from(TABLES.hours)
      .select("*")
      .order("entry_date", {
        ascending: false
      });

    if (options.profileId) {
      query = query.eq(
        "profile_id",
        options.profileId
      );
    }

    if (options.status) {
      query = query.eq(
        "status",
        options.status
      );
    }

    if (options.dateFrom) {
      query = query.gte(
        "entry_date",
        options.dateFrom
      );
    }

    if (options.dateTo) {
      query = query.lte(
        "entry_date",
        options.dateTo
      );
    }

    const { data, error } =
      await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function submitHours(payload) {
    const profile =
      currentProfile();

    const date =
      normalizeDate(
        payload.entry_date
      );

    const startTime =
      normalizeTime(
        payload.start_time
      );

    const endTime =
      normalizeTime(
        payload.end_time
      );

    const totalHours =
      calculateHours(
        date,
        startTime,
        endTime
      );

    const record = {
      id: generateId(),
      profile_id: profile.id,
      display_name:
        profile.display_name,
      entry_date: date,
      start_time: startTime,
      end_time: endTime,
      total_hours: totalHours,
      shift_id:
        payload.shift_id || null,
      note:
        normalizeText(payload.note),
      status:
        config.schedule
          .defaultHoursStatus,
      admin_note: "",
      reviewed_by: null,
      reviewed_at: null,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    if (state.demoMode) {
      updateStore((store) => {
        store.hours.push(record);
      });

      return clone(record);
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.hours)
        .insert({
          profile_id:
            record.profile_id,
          display_name:
            record.display_name,
          entry_date:
            record.entry_date,
          start_time:
            record.start_time,
          end_time:
            record.end_time,
          total_hours:
            record.total_hours,
          shift_id:
            record.shift_id,
          note: record.note,
          status: record.status
        })
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function reviewHours(
    hoursId,
    decision,
    adminNote = ""
  ) {
    requireAdministrativeAccess();

    if (
      !["approved", "declined"].includes(
        decision
      )
    ) {
      throw new Error(
        "Choose approve or decline."
      );
    }

    const reviewer =
      currentProfile();

    if (state.demoMode) {
      return clone(
        updateStore((store) => {
          const row =
            store.hours.find(
              (item) =>
                item.id === hoursId
            );

          if (!row) {
            throw new Error(
              "The time entry could not be found."
            );
          }

          if (
            row.status !== "pending"
          ) {
            throw new Error(
              "This time entry has already been reviewed."
            );
          }

          row.status = decision;
          row.admin_note =
            normalizeText(adminNote);
          row.reviewed_by =
            reviewer.id;
          row.reviewed_at =
            nowIso();
          row.updated_at =
            nowIso();

          return row;
        })
      );
    }

    const { data, error } =
      await state.supabase
        .from(TABLES.hours)
        .update({
          status: decision,
          admin_note:
            normalizeText(adminNote),
          reviewed_by:
            reviewer.id,
          reviewed_at: nowIso(),
          updated_at: nowIso()
        })
        .eq("id", hoursId)
        .eq("status", "pending")
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /* =======================================================
     WEEKLY AVAILABILITY
     ======================================================= */

  function emptyWeeklyDays() {
    const days = {};

    for (
      let dayIndex = 0;
      dayIndex < 7;
      dayIndex += 1
    ) {
      days[String(dayIndex)] = {
        status: "unavailable",
        start_time: null,
        end_time: null
      };
    }

    return days;
  }

  function normalizeWeeklyDays(days) {
    const result =
      emptyWeeklyDays();

    for (
      let dayIndex = 0;
      dayIndex < 7;
      dayIndex += 1
    ) {
      const key =
        String(dayIndex);

      const supplied =
        days?.[key] ||
        days?.[dayIndex] ||
        {};

      const status =
        [
          "unavailable",
          "open",
          "morning",
          "afternoon",
          "evening",
          "custom"
        ].includes(
          supplied.status
        )
          ? supplied.status
          : "unavailable";

      let startTime = null;
      let endTime = null;

      if (status === "custom") {
        startTime =
          normalizeTime(
            supplied.start_time
          );

        endTime =
          normalizeTime(
            supplied.end_time
          );

        if (
          !startTime ||
          !endTime ||
          timeToMinutes(endTime) <=
            timeToMinutes(startTime)
        ) {
          throw new Error(
            `Choose valid custom availability times for day ${dayIndex + 1}.`
          );
        }
      } else {
        const preset =
          config
            .availabilityWindows[
              status
            ];

        startTime =
          preset?.startTime || null;

        endTime =
          preset?.endTime || null;
      }

      result[key] = {
        status,
        start_time: startTime,
        end_time: endTime
      };
    }

    return result;
  }

  async function getWeeklyAvailability(
    profileId = state.profile?.id
  ) {
    if (!profileId) {
      throw new Error(
        "A volunteer profile is required."
      );
    }

    if (state.demoMode) {
      const row =
        readStore()
          .weekly_availability
          .find(
            (item) =>
              item.profile_id ===
              profileId
          );

      if (!row) {
        return {
          id: null,
          profile_id: profileId,
          days: emptyWeeklyDays(),
          note: ""
        };
      }

      return clone(row);
    }

    const { data, error } =
      await state.supabase
        .from(
          TABLES.weeklyAvailability
        )
        .select("*")
        .eq(
          "profile_id",
          profileId
        )
        .maybeSingle();

    if (error) {
      throw error;
    }

    return (
      data || {
        id: null,
        profile_id: profileId,
        days: emptyWeeklyDays(),
        note: ""
      }
    );
  }

  async function saveWeeklyAvailability(
    days,
    note = "",
    profileId = state.profile?.id
  ) {
    if (!profileId) {
      throw new Error(
        "A volunteer profile is required."
      );
    }

    if (
      profileId !== state.profile?.id
    ) {
      requireAdministrativeAccess();
    }

    const normalizedDays =
      normalizeWeeklyDays(days);

    const timestamp = nowIso();

    if (state.demoMode) {
      return clone(
        updateStore((store) => {
          const existing =
            store.weekly_availability.find(
              (row) =>
                row.profile_id ===
                profileId
            );

          if (existing) {
            existing.days =
              normalizedDays;
            existing.note =
              normalizeText(note);
            existing.updated_at =
              timestamp;

            return existing;
          }

          const record = {
            id: generateId(),
            profile_id: profileId,
            days: normalizedDays,
            note:
              normalizeText(note),
            created_at: timestamp,
            updated_at: timestamp
          };

          store.weekly_availability.push(
            record
          );

          return record;
        })
      );
    }

    const { data, error } =
      await state.supabase
        .from(
          TABLES.weeklyAvailability
        )
        .upsert(
          {
            profile_id: profileId,
            days: normalizedDays,
            note:
              normalizeText(note),
            updated_at: timestamp
          },
          {
            onConflict: "profile_id"
          }
        )
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /* =======================================================
     SPECIFIC-DATE AVAILABILITY
     ======================================================= */

  async function listSpecificAvailability(
    profileId = state.profile?.id
  ) {
    if (!profileId) {
      throw new Error(
        "A volunteer profile is required."
      );
    }

    if (state.demoMode) {
      return clone(
        readStore()
          .specific_availability
          .filter(
            (row) =>
              row.profile_id ===
              profileId
          )
          .sort((a, b) =>
            String(
              a.exception_date
            ).localeCompare(
              String(
                b.exception_date
              )
            )
          )
      );
    }

    const { data, error } =
      await state.supabase
        .from(
          TABLES.specificAvailability
        )
        .select("*")
        .eq(
          "profile_id",
          profileId
        )
        .order("exception_date");

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function saveSpecificAvailability(
    payload,
    profileId = state.profile?.id
  ) {
    if (!profileId) {
      throw new Error(
        "A volunteer profile is required."
      );
    }

    if (
      profileId !== state.profile?.id
    ) {
      requireAdministrativeAccess();
    }

    const exceptionDate =
      normalizeDate(
        payload.exception_date
      );

    if (!exceptionDate) {
      throw new Error(
        "Choose a valid date."
      );
    }

    const isAvailable =
      Boolean(payload.is_available);

    const allowedWindows = [
      "open",
      "morning",
      "afternoon",
      "evening",
      "custom"
    ];

    const timeWindow =
      allowedWindows.includes(
        payload.time_window
      )
        ? payload.time_window
        : "open";

    let startTime = null;
    let endTime = null;

    if (
      isAvailable &&
      timeWindow === "custom"
    ) {
      startTime =
        normalizeTime(
          payload.start_time
        );

      endTime =
        normalizeTime(
          payload.end_time
        );

      if (
        !startTime ||
        !endTime ||
        timeToMinutes(endTime) <=
          timeToMinutes(startTime)
      ) {
        throw new Error(
          "Choose valid custom availability times."
        );
      }
    } else if (isAvailable) {
      const preset =
        config
          .availabilityWindows[
            timeWindow
          ];

      startTime =
        preset?.startTime || null;

      endTime =
        preset?.endTime || null;
    }

    const timestamp = nowIso();

    const values = {
      profile_id: profileId,
      exception_date:
        exceptionDate,
      is_available:
        isAvailable,
      time_window:
        isAvailable
          ? timeWindow
          : "open",
      start_time:
        isAvailable
          ? startTime
          : null,
      end_time:
        isAvailable
          ? endTime
          : null,
      note:
        normalizeText(payload.note),
      updated_at: timestamp
    };

    if (state.demoMode) {
      return clone(
        updateStore((store) => {
          const existing =
            store.specific_availability
              .find(
                (row) =>
                  row.profile_id ===
                    profileId &&
                  row.exception_date ===
                    exceptionDate
              );

          if (existing) {
            Object.assign(
              existing,
              values
            );

            return existing;
          }

          const record = {
            id: generateId(),
            ...values,
            created_at: timestamp
          };

          store.specific_availability.push(
            record
          );

          return record;
        })
      );
    }

    const { data, error } =
      await state.supabase
        .from(
          TABLES.specificAvailability
        )
        .upsert(
          values,
          {
            onConflict:
              "profile_id,exception_date"
          }
        )
        .select("*")
        .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function deleteSpecificAvailability(
    recordId
  ) {
    const profile =
      currentProfile();

    if (state.demoMode) {
      updateStore((store) => {
        const record =
          store.specific_availability
            .find(
              (item) =>
                item.id === recordId
            );

        if (!record) {
          throw new Error(
            "The saved date could not be found."
          );
        }

        if (
          record.profile_id !==
            profile.id &&
          !configHelpers
            .hasAdministrativeAccess(
              state.role
            )
        ) {
          throw new Error(
            "You cannot remove this saved date."
          );
        }

        store.specific_availability =
          store.specific_availability
            .filter(
              (item) =>
                item.id !== recordId
            );
      });

      return true;
    }

    let query = state.supabase
      .from(
        TABLES.specificAvailability
      )
      .delete()
      .eq("id", recordId);

    if (
      !configHelpers.hasAdministrativeAccess(
        state.role
      )
    ) {
      query = query.eq(
        "profile_id",
        profile.id
      );
    }

    const { error } = await query;

    if (error) {
      throw error;
    }

    return true;
  }

  /* =======================================================
     ADMINISTRATIVE AVAILABILITY SUMMARY
     ======================================================= */

  async function getAvailabilitySummary(
    profileId
  ) {
    requireAdministrativeAccess();

    const [
      profile,
      weekly,
      specific
    ] = await Promise.all([
      getProfile(profileId),
      getWeeklyAvailability(
        profileId
      ),
      listSpecificAvailability(
        profileId
      )
    ]);

    if (!profile) {
      throw new Error(
        "The volunteer could not be found."
      );
    }

    return {
      profile,
      weekly,
      specific
    };
  }

  /* =======================================================
     DATA INITIALIZATION
     ======================================================= */

  async function initializeData() {
    if (state.demoMode) {
      initializeDemoStore();
      return true;
    }

    if (!state.supabase) {
      throw new Error(
        "The database connection is unavailable."
      );
    }

    return true;
  }

  /* =======================================================
     DEVELOPMENT RESET

     This method is intentionally not connected to a visible
     button. It can be called from the browser console while
     testing:

       BTHData.resetDemoData()

     It resets operational records but does not delete accounts.
     ======================================================= */

  async function resetDemoData() {
    if (!state.demoMode) {
      throw new Error(
        "Demo data can only be reset in demo mode."
      );
    }

    saveStore(createSeedStore());

    return true;
  }

  /* =======================================================
     PUBLIC DATA API
     ======================================================= */

  window.BTHData = Object.freeze({
    initializeData,

    listProfiles,
    getProfile,

    listShifts,
    getShift,
    createShift,
    updateShift,
    cancelShift,

    listShiftRequests,
    createShiftRequest,
    withdrawShiftRequest,
    reviewShiftRequest,

    listMessages,
    createMessage,
    updateMessage,
    deleteMessage,

    listHours,
    submitHours,
    reviewHours,

    getWeeklyAvailability,
    saveWeeklyAvailability,

    listSpecificAvailability,
    saveSpecificAvailability,
    deleteSpecificAvailability,

    getAvailabilitySummary,

    calculateHours,
    localDateString,
    addLocalDays,

    resetDemoData
  });
})();
