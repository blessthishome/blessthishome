(() => {
  "use strict";

  /**
   * Bless This Home Volunteer Hub configuration
   *
   * Demo mode uses browser local storage and does not require Supabase.
   *
   * To test another role, change demoRole to:
   *   "volunteer"
   *   "coordinator"
   *   "admin"
   *
   * When Supabase is connected:
   *   1. Add the project URL.
   *   2. Add the public anonymous key.
   *   3. Change demoMode to false.
   *
   * Production roles will come from the user's database profile.
   */

  const allowedDemoRoles = [
    "volunteer",
    "coordinator",
    "admin"
  ];

  const configuredDemoRole = "admin";

  window.BTH_CONFIG = Object.freeze({
    appName: "Bless This Home Volunteer Hub",

    /**
     * Local testing
     */
    demoMode: false,

    demoRole: allowedDemoRoles.includes(configuredDemoRole)
      ? configuredDemoRole
      : "volunteer",

    /**
     * Supabase connection
     */
    supabaseUrl:
  "https://yuokztriptlugbmdoszb.supabase.co",

supabaseAnonKey:
  "sb_publishable_nKodTUuKk58E5pcOnMvtKQ_e8qhnalu",

    /**
     * Local-storage keys
     *
     * The version suffix prevents this clean rebuild from reading
     * incompatible records created by the previous build.
     */
    storageKeys: Object.freeze({
      accounts: "bth_volunteer_accounts_v1",
      session: "bth_volunteer_session_v1",
      data: "bth_volunteer_data_v1"
    }),

    /**
     * Supported user roles
     */
    roles: Object.freeze({
      volunteer: "volunteer",
      coordinator: "coordinator",
      admin: "admin"
    }),

    /**
     * Display labels used throughout the interface.
     */
    roleLabels: Object.freeze({
      volunteer: "Volunteer",
      coordinator: "Coordinator",
      admin: "Administrator"
    }),

    /**
     * Schedule settings
     */
    schedule: Object.freeze({
      weekStartsOn: 0,
      defaultShiftRequestStatus: "pending",
      defaultHoursStatus: "pending",
      maximumMonthsBack: 12,
      maximumMonthsForward: 24
    }),

    /**
     * Preset availability windows.
     *
     * These values are used for display and administrative review.
     * Custom availability uses the volunteer's entered start and end time.
     */
    availabilityWindows: Object.freeze({
      unavailable: Object.freeze({
        label: "Unavailable",
        startTime: null,
        endTime: null
      }),

      open: Object.freeze({
        label: "Open availability",
        startTime: null,
        endTime: null
      }),

      morning: Object.freeze({
        label: "Morning",
        startTime: "08:00",
        endTime: "12:00"
      }),

      afternoon: Object.freeze({
        label: "Afternoon",
        startTime: "12:00",
        endTime: "17:00"
      }),

      evening: Object.freeze({
        label: "Evening",
        startTime: "17:00",
        endTime: "20:00"
      }),

      custom: Object.freeze({
        label: "Custom time",
        startTime: null,
        endTime: null
      })
    }),

    /**
     * Shift-request statuses
     */
    requestStatuses: Object.freeze({
      pending: "pending",
      approved: "approved",
      declined: "declined",
      withdrawn: "withdrawn",
      cancelled: "cancelled"
    }),

    /**
     * Volunteer-hour statuses
     */
    hoursStatuses: Object.freeze({
      pending: "pending",
      approved: "approved",
      declined: "declined"
    })
  });

  /**
   * Shared configuration helpers
   */

  window.BTHConfig = Object.freeze({
    isDemoMode() {
      return window.BTH_CONFIG.demoMode === true;
    },

    getDemoRole() {
      return window.BTH_CONFIG.demoRole;
    },

    isValidRole(role) {
      return allowedDemoRoles.includes(
        String(role || "").toLowerCase()
      );
    },

    normalizeRole(role) {
      const normalized = String(role || "").toLowerCase();

      return allowedDemoRoles.includes(normalized)
        ? normalized
        : "volunteer";
    },

    getRoleLabel(role) {
      const normalized = this.normalizeRole(role);

      return window.BTH_CONFIG.roleLabels[normalized];
    },

    hasAdministrativeAccess(role) {
      const normalized = this.normalizeRole(role);

      return (
        normalized === "coordinator" ||
        normalized === "admin"
      );
    }
  });
})();
