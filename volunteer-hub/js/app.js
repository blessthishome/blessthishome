(() => {
  "use strict";

  const config = window.BTH_CONFIG;
  const configHelpers = window.BTHConfig;
  const auth = window.BTHAuth;
  const dataApi = window.BTHData;
  const state = window.BTH_STATE;

  if (
    !config ||
    !configHelpers ||
    !auth ||
    !dataApi ||
    !state
  ) {
    throw new Error(
      "Volunteer Hub configuration, authentication, and data files must load before app.js."
    );
  }

  /* =======================================================
     APPLICATION DATA
     ======================================================= */

  const appState = {
    initialized: false,
    entering: false,

    activeView: "dashboard",

    calendarMonth: startOfMonth(new Date()),
    selectedDate: null,

    shifts: [],
    shiftRequests: [],
    messages: [],
    hours: [],
    profiles: [],
    weeklyAvailability: null,
    specificAvailability: [],

    activeShiftId: null,
editingShiftId: null,
activeRequestId: null,
activeMessageId: null,
activeHoursId: null
  };

  const WEEKDAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  const WEEKDAY_SHORT_NAMES = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
  ];

const CLOSED_REQUEST_VISIBILITY_HOURS = 24;

  /* =======================================================
     ELEMENT HELPERS
     ======================================================= */

  const byId = (id) =>
    document.getElementById(id);

  function requireElement(id) {
    const element = byId(id);

    if (!element) {
      throw new Error(
        `Required page element #${id} was not found.`
      );
    }

    return element;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[character]
    );
  }

  /* =======================================================
     DATE AND TIME HELPERS
     ======================================================= */

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function toLocalDateString(date) {
    return [
      date.getFullYear(),
      padNumber(date.getMonth() + 1),
      padNumber(date.getDate())
    ].join("-");
  }

  function parseLocalDate(value) {
    const match = String(value || "").match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) {
      return null;
    }

    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      12,
      0,
      0,
      0
    );

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  function startOfMonth(date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      1,
      12,
      0,
      0,
      0
    );
  }

  function addMonths(date, amount) {
    return new Date(
      date.getFullYear(),
      date.getMonth() + amount,
      1,
      12,
      0,
      0,
      0
    );
  }

  function todayString() {
    return toLocalDateString(new Date());
  }

  function formatDate(
    value,
    options = {
      weekday: "long",
      month: "long",
      day: "numeric"
    }
  ) {
    const date =
      value instanceof Date
        ? value
        : parseLocalDate(value);

    if (!date) {
      return "";
    }

    return new Intl.DateTimeFormat(
      "en-US",
      options
    ).format(date);
  }

  function formatMonth(value) {
    const date =
      value instanceof Date
        ? value
        : parseLocalDate(value);

    if (!date) {
      return "";
    }

    return new Intl.DateTimeFormat(
      "en-US",
      {
        month: "long",
        year: "numeric"
      }
    ).format(date);
  }

  function formatTime(value) {
    const match = String(value || "").match(
      /^(\d{2}):(\d{2})/
    );

    if (!match) {
      return "";
    }

    const date = new Date(
      2000,
      0,
      1,
      Number(match[1]),
      Number(match[2]),
      0,
      0
    );

    return new Intl.DateTimeFormat(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit"
      }
    ).format(date);
  }

  function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }
    ).format(date);
  }

  function timeToMinutes(value) {
    const match = String(value || "").match(
      /^(\d{2}):(\d{2})$/
    );

    if (!match) {
      return null;
    }

    return (
      Number(match[1]) * 60 +
      Number(match[2])
    );
  }

  function isFutureOrToday(dateValue) {
    return (
      String(dateValue || "") >= todayString()
    );
  }

  /* =======================================================
     GENERAL HELPERS
     ======================================================= */

function shouldShowClosedRequest(request) {
  if (
    !["withdrawn", "declined", "cancelled"].includes(
      request.status
    )
  ) {
    return true;
  }

  const statusDate =
    request.updated_at ||
    request.withdrawn_at ||
    request.reviewed_at ||
    request.created_at;

  if (!statusDate) {
    return false;
  }

  const changedAt =
    new Date(statusDate);

  if (
    Number.isNaN(
      changedAt.getTime()
    )
  ) {
    return false;
  }

  const visibleUntil =
    changedAt.getTime() +
    CLOSED_REQUEST_VISIBILITY_HOURS *
      60 *
      60 *
      1000;

  return Date.now() < visibleUntil;
}

  function hasAdministrativeAccess() {
    return configHelpers.hasAdministrativeAccess(
      state.role
    );
  }

  function roleLabel() {
    return configHelpers.getRoleLabel(
      state.role
    );
  }

  function showAppFeedback(
    message,
    type = "success"
  ) {
    const feedback = byId("appFeedback");

    if (!feedback) {
      return;
    }

    feedback.textContent = message;
    feedback.classList.remove(
      "is-hidden"
    );

    feedback.dataset.type = type;

    clearTimeout(
      showAppFeedback.timer
    );

    showAppFeedback.timer =
      window.setTimeout(() => {
        feedback.classList.add(
          "is-hidden"
        );

        feedback.textContent = "";
        delete feedback.dataset.type;
      }, 3200);
  }

  function setFormFeedback(
    id,
    message,
    type = ""
  ) {
    auth.setFeedback(
      byId(id),
      message,
      type
    );
  }

  function clearFormFeedback(id) {
    auth.clearFeedback(byId(id));
  }

  function setEmptyState(
    element,
    isEmpty
  ) {
    if (!element) {
      return;
    }

    element.classList.toggle(
      "empty-state",
      isEmpty
    );
  }

  function requestStatusLabel(status) {
    return (
      {
        pending: "Pending approval",
        approved: "Approved",
        declined: "Declined",
        withdrawn: "Withdrawn",
        cancelled: "Cancelled"
      }[status] || status
    );
  }

  function hoursStatusLabel(status) {
    return (
      {
        pending: "Pending approval",
        approved: "Approved",
        declined: "Declined"
      }[status] || status
    );
  }

  function availabilityLabel(status) {
    return (
      config.availabilityWindows[
        status
      ]?.label || "Unavailable"
    );
  }

  function staffingStatus(shift) {
    const approved = Number(
      shift.approved_count || 0
    );

    const minimum = Number(
      shift.minimum_people || 0
    );

    const preferred = Number(
      shift.preferred_people || 0
    );

    const maximum = Number(
      shift.maximum_people || 0
    );

    if (
      maximum > 0 &&
      approved >= maximum
    ) {
      return "full";
    }

    if (
      preferred > 0 &&
      approved >= preferred
    ) {
      return "full";
    }

    if (
      minimum > 0 &&
      approved < minimum
    ) {
      return "critical";
    }

    if (
      preferred > 0 &&
      approved ===
        preferred - 1
    ) {
      return "almost";
    }

    return "needs";
  }

  function getShiftById(shiftId) {
    return (
      appState.shifts.find(
        (shift) =>
          shift.id === shiftId
      ) || null
    );
  }

  function getRequestById(requestId) {
    return (
      appState.shiftRequests.find(
        (request) =>
          request.id === requestId
      ) || null
    );
  }

  function getMessageById(messageId) {
    return (
      appState.messages.find(
        (message) =>
          message.id === messageId
      ) || null
    );
  }

  function getMyRequestForShift(
    shiftId
  ) {
    return (
      appState.shiftRequests.find(
        (request) =>
          request.shift_id ===
            shiftId &&
          request.profile_id ===
            state.profile.id &&
          [
            "pending",
            "approved"
          ].includes(request.status)
      ) || null
    );
  }

  function getProfileName(
    profileId,
    fallback = "Volunteer"
  ) {
    return (
      appState.profiles.find(
        (profile) =>
          profile.id === profileId
      )?.display_name || fallback
    );
  }

  function dutiesMarkup(duties) {
    const values = Array.isArray(duties)
      ? duties.filter(Boolean)
      : [];

    if (!values.length) {
      return "";
    }

    return `
      <div class="shift-description">
        <strong>Duties and notes</strong>

        <ul class="duties-list">
          ${values
            .map(
              (duty) =>
                `<li>${escapeHtml(
                  duty
                )}</li>`
            )
            .join("")}
        </ul>
      </div>
    `;
  }

  /* =======================================================
     ROLE AND PROFILE INTERFACE
     ======================================================= */

  function applyProfileToInterface() {
    const profile = state.profile;

    if (!profile) {
      return;
    }

    requireElement(
      "sidebarDisplayName"
    ).textContent =
      profile.display_name;

    requireElement(
      "sidebarRole"
    ).textContent = roleLabel();

    requireElement(
      "mobileRole"
    ).textContent = roleLabel();

    requireElement(
      "welcomeHeading"
    ).textContent =
      `Welcome, ${profile.first_name}`;

    requireElement(
      "profileFirstName"
    ).value =
      profile.first_name || "";

    requireElement(
      "profileLastName"
    ).value =
      profile.last_name || "";

    requireElement(
      "profileDisplayName"
    ).value =
      profile.display_name || "";

    requireElement(
      "profileEmail"
    ).value =
      profile.email || "";

    requireElement(
      "profilePhone"
    ).value =
      profile.phone || "";

    requireElement(
      "profileContactMethod"
    ).value =
      profile.preferred_contact_method ||
      "email";

    document
      .querySelectorAll(".admin-only")
      .forEach((element) => {
        element.classList.toggle(
          "is-hidden",
          !hasAdministrativeAccess()
        );
      });
  }

  /* =======================================================
     NAVIGATION
     ======================================================= */

  function openMobileMenu() {
    document.body.classList.add(
      "menu-open"
    );

    requireElement(
      "mobileMenuButton"
    ).setAttribute(
      "aria-expanded",
      "true"
    );
  }

  function closeMobileMenu() {
    document.body.classList.remove(
      "menu-open"
    );

    requireElement(
      "mobileMenuButton"
    ).setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function toggleMobileMenu() {
    if (
      document.body.classList.contains(
        "menu-open"
      )
    ) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  function switchView(
    viewName,
    options = {}
  ) {
    if (
      ["manage", "reports"].includes(
        viewName
      ) &&
      !hasAdministrativeAccess()
    ) {
      showAppFeedback(
        "Administrator access is required.",
        "error"
      );

      return;
    }

    const panel = document.querySelector(
      `[data-view-panel="${viewName}"]`
    );

    if (!panel) {
      return;
    }

    document
      .querySelectorAll(
        "[data-view-panel]"
      )
      .forEach((view) => {
        view.classList.toggle(
          "is-active",
          view === panel
        );
      });

    document
      .querySelectorAll(
        ".nav-button[data-view]"
      )
      .forEach((button) => {
        button.classList.toggle(
          "is-active",
          button.dataset.view ===
            viewName
        );
      });

    appState.activeView = viewName;

    closeMobileMenu();

    if (options.scroll !== false) {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }

    if (viewName === "schedule") {
      renderSchedule();
    }

    if (viewName === "availability") {
      renderAvailability();
    }

    if (
      viewName === "manage" &&
      hasAdministrativeAccess()
    ) {
      renderManage();
    }

    if (
      viewName === "reports" &&
      hasAdministrativeAccess()
    ) {
      setReportDefaultDates();
    }
  }

  /* =======================================================
     DATA REFRESH
     ======================================================= */

  async function refreshAll() {
    const profileId = state.profile.id;

    const coreRequests = [
      dataApi.listShifts({
        includeCancelled: false
      }),
      dataApi.listShiftRequests(),
      dataApi.listMessages(),
      dataApi.listProfiles({
        activeOnly: true
      })
    ];

    const hoursRequest =
      hasAdministrativeAccess()
        ? dataApi.listHours()
        : dataApi.listHours({
            profileId
          });

    const [
      shifts,
      shiftRequests,
      messages,
      profiles,
      hours
    ] = await Promise.all([
      ...coreRequests,
      hoursRequest
    ]);

    appState.shifts = shifts;
    appState.shiftRequests =
      shiftRequests;
    appState.messages = messages;
    appState.profiles = profiles;
    appState.hours = hours;

    await refreshAvailabilityData();

    renderAll();
  }

  async function refreshAvailabilityData() {
    try {
      const [weekly, specific] =
        await Promise.all([
          dataApi.getWeeklyAvailability(
            state.profile.id
          ),
          dataApi.listSpecificAvailability(
            state.profile.id
          )
        ]);

      appState.weeklyAvailability =
        weekly;

      appState.specificAvailability =
        specific;
    } catch (error) {
      console.error(
        "Availability data could not be loaded:",
        error
      );

      appState.weeklyAvailability =
        null;

      appState.specificAvailability =
        [];
    }
  }

  function renderAll() {
    applyProfileToInterface();
    renderDashboard();
    renderSchedule();
    renderMyShifts();
    renderAvailability();
    renderHours();
    renderMessages();
    populateHoursShiftSelect();

    if (hasAdministrativeAccess()) {
      renderManage();
      populateAvailabilityVolunteerSelect();
      setReportDefaultDates();
    }
  }

  /* =======================================================
     DASHBOARD
     ======================================================= */

  function renderDashboard() {
    const now = todayString();

    const myActiveRequests =
      appState.shiftRequests
        .filter(
          (request) =>
            request.profile_id ===
              state.profile.id &&
            [
              "pending",
              "approved"
            ].includes(
              request.status
            )
        )
        .map((request) => ({
          ...request,
          shift:
            request.shift ||
            getShiftById(
              request.shift_id
            )
        }))
        .filter(
          (request) =>
            request.shift &&
            request.shift.shift_date >=
              now
        )
        .sort((a, b) =>
          (
            `${a.shift.shift_date}` +
            `${a.shift.start_time}`
          ).localeCompare(
            `${b.shift.shift_date}` +
              `${b.shift.start_time}`
          )
        );

    const nextRequest =
      myActiveRequests[0];

    const nextShiftSummary =
      byId("nextShiftSummary");

    const nextShiftDetail =
      byId("nextShiftDetail");

    if (
      nextRequest &&
      nextRequest.shift
    ) {
      nextShiftSummary.textContent =
        nextRequest.shift.title;

      nextShiftDetail.textContent =
        `${formatDate(
          nextRequest.shift.shift_date,
          {
            weekday: "short",
            month: "short",
            day: "numeric"
          }
        )}, ${formatTime(
          nextRequest.start_time
        )} · ${requestStatusLabel(
          nextRequest.status
        )}`;
    } else {
      nextShiftSummary.textContent =
        "No upcoming shift";

      nextShiftDetail.textContent =
        "Browse the schedule to request a shift.";
    }

    const currentMonth =
      todayString().slice(0, 7);

    const monthlyHours =
      appState.hours
        .filter(
          (row) =>
            row.profile_id ===
              state.profile.id &&
            row.entry_date.startsWith(
              currentMonth
            ) &&
            [
              "pending",
              "approved"
            ].includes(row.status)
        )
        .reduce(
          (total, row) =>
            total +
            Number(
              row.total_hours || 0
            ),
          0
        );

    byId(
      "monthlyHoursSummary"
    ).textContent =
      monthlyHours.toFixed(1);

    const openShiftCount =
      appState.shifts.filter(
        (shift) =>
          shift.shift_date >= now &&
          shift.status === "published" &&
          shift.approved_count <
            shift.maximum_people
      ).length;

    byId(
      "openNeedsSummary"
    ).textContent =
      String(openShiftCount);

    byId(
      "messageCountSummary"
    ).textContent =
      String(appState.messages.length);

    renderWeekNeeds();
    renderRecentMessages();
  }

  function renderWeekNeeds() {
    const container =
      requireElement("weekNeeds");

    container.innerHTML = "";

    const baseDate = new Date();
    baseDate.setHours(12, 0, 0, 0);

    for (
      let offset = 0;
      offset < 7;
      offset += 1
    ) {
      const date = new Date(baseDate);
      date.setDate(
        baseDate.getDate() + offset
      );

      const dateString =
        toLocalDateString(date);

      const dayShifts =
        appState.shifts.filter(
          (shift) =>
            shift.shift_date ===
            dateString
        );

      const approvedCount =
        dayShifts.reduce(
          (total, shift) =>
            total +
            Number(
              shift.approved_count || 0
            ),
          0
        );

      const preferredCount =
        dayShifts.reduce(
          (total, shift) =>
            total +
            Number(
              shift.preferred_people ||
                0
            ),
          0
        );

      let status = "closed";

      if (dayShifts.length) {
        const priorities = {
          critical: 0,
          needs: 1,
          almost: 2,
          full: 3
        };

        status = dayShifts
          .map(staffingStatus)
          .sort(
            (a, b) =>
              priorities[a] -
              priorities[b]
          )[0];
      }

      const button =
        document.createElement("button");

      button.type = "button";
      button.className =
        `need-day status-${status}`;

      button.innerHTML = `
        <strong>
          ${escapeHtml(
            WEEKDAY_SHORT_NAMES[
              date.getDay()
            ]
          )}
        </strong>

        <span>
          ${escapeHtml(
            formatDate(date, {
              month: "short",
              day: "numeric"
            })
          )}
        </span>

        <span class="need-count">
          ${
            dayShifts.length
              ? `${approvedCount} of ${preferredCount} preferred`
              : "No shifts"
          }
        </span>
      `;

      button.addEventListener(
        "click",
        () => {
          appState.calendarMonth =
            startOfMonth(date);

          appState.selectedDate =
            dateString;

          switchView("schedule");
        }
      );

      container.appendChild(button);
    }
  }

  function renderRecentMessages() {
    const container =
      requireElement("recentMessages");

    const rows =
      appState.messages.slice(0, 3);

    setEmptyState(
      container,
      rows.length === 0
    );

    container.innerHTML =
      rows.length > 0
        ? rows
            .map(
              (message) => `
                <article>
                  <strong>
                    ${escapeHtml(
                      message.title
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(
                      message.category
                    )}
                    ·
                    ${escapeHtml(
                      message
                        .author_display_name ||
                        "Bless This Home"
                    )}
                  </small>
                </article>
              `
            )
            .join("")
        : "No recent messages.";
  }

  /* =======================================================
     SCHEDULE
     ======================================================= */

  function filteredScheduleShifts() {
    const monthPrefix = [
      appState.calendarMonth.getFullYear(),
      padNumber(
        appState.calendarMonth.getMonth() +
          1
      )
    ].join("-");

    const typeFilter =
      byId(
        "scheduleTypeFilter"
      )?.value || "";

    const staffingFilter =
      byId(
        "scheduleStaffingFilter"
      )?.value || "";

    return appState.shifts
      .filter(
        (shift) =>
          shift.shift_date.startsWith(
            monthPrefix
          )
      )
      .filter(
        (shift) =>
          !typeFilter ||
          shift.shift_type ===
            typeFilter
      )
      .filter((shift) => {
        if (!staffingFilter) {
          return true;
        }

        if (
          staffingFilter === "mine"
        ) {
          return Boolean(
            getMyRequestForShift(
              shift.id
            )
          );
        }

        const status =
          staffingStatus(shift);

        if (
          staffingFilter === "needs"
        ) {
          return [
            "critical",
            "needs"
          ].includes(status);
        }

        return (
          status === staffingFilter
        );
      })
      .sort((a, b) =>
        (
          `${a.shift_date}` +
          `${a.start_time}`
        ).localeCompare(
          `${b.shift_date}` +
            `${b.start_time}`
        )
      );
  }

  function renderSchedule() {
    const monthLabel =
      byId("scheduleMonthLabel");

    if (!monthLabel) {
      return;
    }

    monthLabel.textContent =
      formatMonth(
        appState.calendarMonth
      );

    const filtered =
      filteredScheduleShifts();

    renderCalendar(filtered);
    renderSelectedDay();

    const list =
  requireElement("scheduleList");

const selectedDate =
  appState.selectedDate;

/*
 * Keep chronological organization, but place shifts from
 * the currently selected calendar day at the top.
 */
const orderedFiltered =
  [...filtered].sort(
    (firstShift, secondShift) => {
      const firstSelected =
        firstShift.shift_date ===
        selectedDate
          ? 0
          : 1;

      const secondSelected =
        secondShift.shift_date ===
        selectedDate
          ? 0
          : 1;

      if (
        firstSelected !==
        secondSelected
      ) {
        return (
          firstSelected -
          secondSelected
        );
      }

      return (
        `${firstShift.shift_date}` +
        `${firstShift.start_time}`
      ).localeCompare(
        `${secondShift.shift_date}` +
        `${secondShift.start_time}`
      );
    }
  );

setEmptyState(
  list,
  orderedFiltered.length === 0
);

list.innerHTML =
  orderedFiltered.length > 0
    ? orderedFiltered
        .map((shift) =>
          shiftCardMarkup(
            shift,
            "matching"
          )
        )
        .join("")
    : "No shifts match the selected month and filters.";

const count =
  requireElement(
    "matchingShiftCount"
  );

count.textContent =
  `${orderedFiltered.length} shift${
    orderedFiltered.length === 1
      ? ""
      : "s"
  }`;

wireShiftCardButtons(list);
}

  function renderCalendar(shifts) {
    const container =
      requireElement(
        "scheduleCalendar"
      );

    container.innerHTML = "";

    WEEKDAY_SHORT_NAMES.forEach(
      (name) => {
        const label =
          document.createElement("div");

        label.className =
          "calendar-weekday";

        label.textContent = name;

        container.appendChild(label);
      }
    );

    const year =
      appState.calendarMonth.getFullYear();

    const month =
      appState.calendarMonth.getMonth();

    const firstDay =
      new Date(
        year,
        month,
        1,
        12
      ).getDay();

    const daysInMonth =
      new Date(
        year,
        month + 1,
        0,
        12
      ).getDate();

    for (
      let emptyIndex = 0;
      emptyIndex < firstDay;
      emptyIndex += 1
    ) {
      const emptyCell =
        document.createElement("div");

      emptyCell.className =
        "calendar-cell is-empty";

      emptyCell.setAttribute(
        "aria-hidden",
        "true"
      );

      container.appendChild(emptyCell);
    }

    for (
      let day = 1;
      day <= daysInMonth;
      day += 1
    ) {
      const date = new Date(
        year,
        month,
        day,
        12
      );

      const dateString =
        toLocalDateString(date);

      const cell =
        document.createElement("div");

      cell.className =
        "calendar-cell";

      cell.dataset.date =
        dateString;

      cell.setAttribute(
        "role",
        "button"
      );

      cell.setAttribute(
        "tabindex",
        "0"
      );

      cell.setAttribute(
        "aria-label",
        formatDate(date, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric"
        })
      );

      if (
        dateString ===
        todayString()
      ) {
        cell.classList.add(
          "is-today"
        );
      }

      if (
        dateString ===
        appState.selectedDate
      ) {
        cell.classList.add(
          "is-selected"
        );
      }

      const dayShifts =
        shifts.filter(
          (shift) =>
            shift.shift_date ===
            dateString
        );

      cell.innerHTML = `
        <span class="calendar-date">
          ${day}
        </span>

        ${dayShifts
          .map(
            (shift) => `
              <span
                class="calendar-shift status-${staffingStatus(
                  shift
                )}"
              >
                <strong>
                  ${escapeHtml(
                    shift.title
                  )}
                </strong>

                <span>
                  ${escapeHtml(
                    formatTime(
                      shift.start_time
                    )
                  )}
                </span>
              </span>
            `
          )
          .join("")}
      `;

      const selectDate = () => {
        appState.selectedDate =
          dateString;

        renderSchedule();

        byId(
  "matchingShiftsSection"
)?.scrollIntoView({
  behavior: "smooth",
  block: "start"
});
      };

      cell.addEventListener(
        "click",
        selectDate
      );

      cell.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            selectDate();
          }
        }
      );

      container.appendChild(cell);
    }
  }

  function renderSelectedDay() {
    if (!appState.selectedDate) {
      const firstShift =
        filteredScheduleShifts()[0];

      appState.selectedDate =
        firstShift?.shift_date ||
        todayString();
    }

    const heading =
      requireElement(
        "selectedDayHeading"
      );

    const summary =
      requireElement(
        "selectedDaySummary"
      );

    const list =
      requireElement(
        "selectedDayShifts"
      );

    heading.textContent =
      formatDate(
        appState.selectedDate,
        {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric"
        }
      );

    const dayShifts =
      appState.shifts
        .filter(
          (shift) =>
            shift.shift_date ===
            appState.selectedDate
        )
        .sort((a, b) =>
          String(
            a.start_time
          ).localeCompare(
            String(b.start_time)
          )
        );

    const approved =
      dayShifts.reduce(
        (total, shift) =>
          total +
          Number(
            shift.approved_count || 0
          ),
        0
      );

    const preferred =
      dayShifts.reduce(
        (total, shift) =>
          total +
          Number(
            shift.preferred_people ||
              0
          ),
        0
      );

    summary.textContent =
      dayShifts.length > 0
        ? `${dayShifts.length} shift${
            dayShifts.length === 1
              ? ""
              : "s"
          } · ${approved} of ${preferred} preferred positions filled`
        : "No shifts are scheduled for this date.";

    setEmptyState(
      list,
      dayShifts.length === 0
    );

    list.innerHTML =
  dayShifts.length > 0
    ? dayShifts
        .map((shift) =>
          shiftCardMarkup(
            shift,
            "selected"
          )
        )
        .join("")
    : "No shifts are scheduled for this date.";

    wireShiftCardButtons(list);
  }

  function shiftCardMarkup(
  shift,
  context = "matching"
) {
  const myRequest =
    getMyRequestForShift(shift.id);

  const status =
    staffingStatus(shift);

  const approvedNames =
    (shift.approved_requests || [])
      .map(
        (request) =>
          request.display_name ||
          getProfileName(
            request.profile_id
          )
      )
      .filter(Boolean);

  const isFull =
    Number(
      shift.approved_count || 0
    ) >=
    Number(
      shift.maximum_people || 0
    );

  const isPast =
    shift.shift_date <
    todayString();

  let actionMarkup = "";

  if (myRequest) {
    actionMarkup = `
      <button
        class="button button-secondary"
        type="button"
        data-view-request="${escapeHtml(
          myRequest.id
        )}"
      >
        View ${escapeHtml(
          requestStatusLabel(
            myRequest.status
          )
        )}
      </button>
    `;
  } else if (
    !isPast &&
    !isFull
  ) {
    actionMarkup = `
      <button
        class="button button-primary"
        type="button"
        data-request-shift="${escapeHtml(
          shift.id
        )}"
      >
        Request shift
      </button>
    `;
  }

  const duties = Array.isArray(
    shift.duties
  )
    ? shift.duties.filter(Boolean)
    : [];

  return `
    <details
      class="schedule-shift-item status-${escapeHtml(
        status
      )}"
      data-shift-item="${escapeHtml(
        shift.id
      )}"
      data-shift-date="${escapeHtml(
        shift.shift_date
      )}"
      data-shift-context="${escapeHtml(
        context
      )}"
    >
      <summary class="schedule-shift-summary">
        <div class="schedule-summary-date">
          <strong>
            ${escapeHtml(
              formatDate(
                shift.shift_date,
                {
                  weekday: "short",
                  month: "short",
                  day: "numeric"
                }
              )
            )}
          </strong>

          <small>
            ${escapeHtml(
              shift.location || ""
            )}
          </small>
        </div>

        <div class="schedule-summary-title">
          <strong>
            ${escapeHtml(
              shift.title
            )}
          </strong>

          <small>
            ${escapeHtml(
              shift.shift_type
            )}
          </small>
        </div>

        <div class="schedule-summary-time">
          <strong>
            ${escapeHtml(
              formatTime(
                shift.start_time
              )
            )}
            to
            ${escapeHtml(
              formatTime(
                shift.end_time
              )
            )}
          </strong>

          <small>
            ${
              isFull
                ? "Maximum staffing reached"
                : `${Number(
                    shift.remaining_preferred ||
                    0
                  )} preferred spot${
                    Number(
                      shift.remaining_preferred ||
                      0
                    ) === 1
                      ? ""
                      : "s"
                  } remaining`
            }
          </small>
        </div>

        <div class="schedule-summary-staffing">
          <div class="schedule-status-line">
            <span class="schedule-mini-chip">
              ${Number(
                shift.approved_count || 0
              )}
              of
              ${Number(
                shift.preferred_people || 0
              )}
              preferred
            </span>

            ${
              Number(
                shift.pending_count || 0
              ) > 0
                ? `
                  <span class="schedule-mini-chip pending">
                    ${Number(
                      shift.pending_count
                    )}
                    pending
                  </span>
                `
                : ""
            }

            ${
              myRequest
                ? `
                  <span class="schedule-mini-chip ${escapeHtml(
                    myRequest.status
                  )}">
                    ${escapeHtml(
                      requestStatusLabel(
                        myRequest.status
                      )
                    )}
                  </span>
                `
                : ""
            }

            ${
              isFull
                ? `
                  <span class="schedule-mini-chip full">
                    Full
                  </span>
                `
                : ""
            }
          </div>
        </div>
      </summary>

      <div class="schedule-shift-expanded">
        <div class="schedule-expanded-top">
          <div class="schedule-expanded-description">
            <strong>
              Location and shift information
            </strong>

            <p>
              <strong>
                ${escapeHtml(
                  shift.location ||
                  "Location not specified"
                )}
              </strong>
            </p>

            <p>
              ${
                shift.description
                  ? escapeHtml(
                      shift.description
                    )
                  : "No additional description was provided."
              }
            </p>
          </div>

          <div class="schedule-expanded-duties">
            <strong>
              Duties and notes
            </strong>

            ${
              duties.length
                ? `
                  <ul>
                    ${duties
                      .map(
                        (duty) => `
                          <li>
                            ${escapeHtml(
                              duty
                            )}
                          </li>
                        `
                      )
                      .join("")}
                  </ul>
                `
                : `
                  <p class="muted">
                    No duties or day notes were added.
                  </p>
                `
            }
          </div>
        </div>

        <div class="schedule-expanded-meta">
          <span>
            <strong>
              Approved:
            </strong>

            ${escapeHtml(
              approvedNames.join(", ") ||
              "No volunteers yet"
            )}
          </span>

          <span>
            <strong>
              Minimum:
            </strong>

            ${Number(
              shift.minimum_people || 0
            )}
          </span>

          <span>
            <strong>
              Preferred:
            </strong>

            ${Number(
              shift.preferred_people || 0
            )}
          </span>

          <span>
            <strong>
              Maximum:
            </strong>

            ${Number(
              shift.maximum_people || 0
            )}
          </span>
        </div>

        ${
          actionMarkup
            ? `
              <div class="schedule-expanded-actions">
                ${actionMarkup}
              </div>
            `
            : ""
        }
      </div>
    </details>
  `;
}

  function wireShiftCardButtons(
    container
  ) {
    container
      .querySelectorAll(
        "[data-request-shift]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            openShiftRequestDialog(
              button.dataset
                .requestShift
            );
          }
        );
      });

    container
      .querySelectorAll(
        "[data-view-request]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            const request =
              getRequestById(
                button.dataset
                  .viewRequest
              );

            if (request) {
              switchView(
                "my-shifts"
              );

              window.setTimeout(
                () => {
                  document
                    .querySelector(
                      `[data-request-card="${request.id}"]`
                    )
                    ?.scrollIntoView({
                      behavior: "smooth",
                      block: "center"
                    });
                },
                100
              );
            }
          }
        );
      });
  }

  function showPreviousMonth() {
    appState.calendarMonth =
      addMonths(
        appState.calendarMonth,
        -1
      );

    appState.selectedDate = null;
    renderSchedule();
  }

  function showNextMonth() {
    appState.calendarMonth =
      addMonths(
        appState.calendarMonth,
        1
      );

    appState.selectedDate = null;
    renderSchedule();
  }

  function showToday() {
    appState.calendarMonth =
      startOfMonth(new Date());

    appState.selectedDate =
      todayString();

    renderSchedule();
  }

  function showNextOpenShift() {
    const nextShift =
      appState.shifts
        .filter(
          (shift) =>
            shift.shift_date >=
              todayString() &&
            shift.approved_count <
              shift.maximum_people
        )
        .sort((a, b) =>
          (
            `${a.shift_date}` +
            `${a.start_time}`
          ).localeCompare(
            `${b.shift_date}` +
              `${b.start_time}`
          )
        )[0];

    if (!nextShift) {
      showAppFeedback(
        "There are no upcoming open shifts.",
        "error"
      );

      return;
    }

    const date =
      parseLocalDate(
        nextShift.shift_date
      );

    appState.calendarMonth =
      startOfMonth(date);

    appState.selectedDate =
      nextShift.shift_date;

    renderSchedule();

    byId(
      "selectedDayHeading"
    )?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  /* =======================================================
     SHIFT REQUEST DIALOG
     ======================================================= */

  function openShiftRequestDialog(
    shiftId
  ) {
    const shift =
      getShiftById(shiftId);

    if (!shift) {
      showAppFeedback(
        "The selected shift could not be found.",
        "error"
      );

      return;
    }

    appState.activeShiftId =
      shiftId;

    requireElement(
      "shiftRequestForm"
    ).reset();

    clearFormFeedback(
      "shiftRequestFeedback"
    );

    requireElement(
      "partialShiftFields"
    ).classList.add(
      "is-hidden"
    );

    requireElement(
      "partialShiftStart"
    ).value =
      shift.start_time;

    requireElement(
      "partialShiftEnd"
    ).value =
      shift.end_time;

    requireElement(
      "shiftRequestTitle"
    ).textContent =
      shift.title;

    requireElement(
      "shiftRequestDetails"
    ).innerHTML = `
      <div class="shift-description">
        <p>
          <strong>
            ${escapeHtml(
              formatDate(
                shift.shift_date,
                {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric"
                }
              )
            )}
          </strong>

          <br>

          ${escapeHtml(
            formatTime(
              shift.start_time
            )
          )}
          to
          ${escapeHtml(
            formatTime(
              shift.end_time
            )
          )}
        </p>

        <p>
          ${escapeHtml(
            shift.location || ""
          )}
        </p>

        ${
          shift.description
            ? `
              <p>
                ${escapeHtml(
                  shift.description
                )}
              </p>
            `
            : ""
        }

        ${dutiesMarkup(
          shift.duties
        )}
      </div>
    `;

    openDialog(
      "shiftRequestDialog"
    );
  }

  function updatePartialShiftFields() {
    const type =
      document.querySelector(
        'input[name="shiftRequestType"]:checked'
      )?.value || "full";

    requireElement(
      "partialShiftFields"
    ).classList.toggle(
      "is-hidden",
      type !== "partial"
    );
  }

  async function handleShiftRequestSubmit(
    event
  ) {
    event.preventDefault();

    const shift =
      getShiftById(
        appState.activeShiftId
      );

    if (!shift) {
      setFormFeedback(
        "shiftRequestFeedback",
        "The selected shift could not be found.",
        "error"
      );

      return;
    }

    const requestType =
      document.querySelector(
        'input[name="shiftRequestType"]:checked'
      )?.value || "full";

    try {
      setFormFeedback(
        "shiftRequestFeedback",
        "Submitting request…"
      );

      await dataApi.createShiftRequest(
        shift.id,
        {
          request_type: requestType,
          start_time:
            requestType === "partial"
              ? requireElement(
                  "partialShiftStart"
                ).value
              : shift.start_time,
          end_time:
            requestType === "partial"
              ? requireElement(
                  "partialShiftEnd"
                ).value
              : shift.end_time,
          note: requireElement(
            "shiftRequestNote"
          ).value
        }
      );

      closeDialog(
        "shiftRequestDialog"
      );

      showAppFeedback(
        "Shift request submitted for approval."
      );

      await refreshAll();

      switchView("my-shifts");
    } catch (error) {
      console.error(
        "Shift request failed:",
        error
      );

      setFormFeedback(
        "shiftRequestFeedback",
        error.message ||
          "Unable to submit the shift request.",
        "error"
      );
    }
  }

  /* =======================================================
     MY SHIFTS
     ======================================================= */

  function renderMyShifts() {
  const list =
    requireElement(
      "myShiftsList"
    );

  const myRequests =
  appState.shiftRequests.filter(
    (request) =>
      request.profile_id ===
      state.profile.id
  );

const rows =
  myRequests
    .filter((request) => {
      /*
       * Always show active requests.
       */
      if (
        ["pending", "approved"].includes(
          request.status
        )
      ) {
        return true;
      }

      /*
       * Hide an older withdrawn or declined request when a
       * newer active request exists for the same shift.
       */
      const hasActiveReplacement =
        myRequests.some(
          (otherRequest) =>
            otherRequest.id !==
              request.id &&
            otherRequest.shift_id ===
              request.shift_id &&
            ["pending", "approved"].includes(
              otherRequest.status
            )
        );

      if (hasActiveReplacement) {
        return false;
      }

      return shouldShowClosedRequest(
        request
      );
    })
      .map((request) => ({
        ...request,
        shift:
          request.shift ||
          getShiftById(
            request.shift_id
          )
      }))
      .filter(
        (request) =>
          request.shift
      )
      .sort((a, b) => {
        const statusOrder = {
          approved: 0,
          pending: 1,
          withdrawn: 2,
          declined: 3,
          cancelled: 4
        };

        const statusDifference =
          (statusOrder[a.status] ?? 99) -
          (statusOrder[b.status] ?? 99);

        if (
          statusDifference !== 0
        ) {
          return statusDifference;
        }

        return (
          `${a.shift.shift_date}` +
          `${a.shift.start_time}`
        ).localeCompare(
          `${b.shift.shift_date}` +
          `${b.shift.start_time}`
        );
      });

  setEmptyState(
    list,
    rows.length === 0
  );

  list.classList.remove(
    "card-list"
  );

  list.classList.add(
    "schedule-accordion-list"
  );

  list.innerHTML =
    rows.length
      ? rows
          .map(
            myShiftRequestMarkup
          )
          .join("")
      : "You have no active or recent shift requests.";

  wireMyShiftActions(list);
}

  function myShiftRequestMarkup(
  request
) {
  const shift =
    request.shift;

  const status =
    request.status;

  const isFuture =
    shift.shift_date >=
    todayString();

  const isFull =
    Number(
      shift.approved_count || 0
    ) >=
    Number(
      shift.maximum_people || 0
    );

  const canWithdraw =
    isFuture &&
    ["pending", "approved"].includes(
      status
    );

  const canRequestAgain =
    isFuture &&
    !isFull &&
    ["withdrawn", "declined"].includes(
      status
    );

  const duties =
    Array.isArray(
      shift.duties
    )
      ? shift.duties.filter(Boolean)
      : [];

  let actionMarkup = "";

  if (canWithdraw) {
    actionMarkup = `
      <button
        class="button button-secondary"
        type="button"
        data-withdraw-request="${escapeHtml(
          request.id
        )}"
      >
        Withdraw request
      </button>
    `;
  } else if (
    canRequestAgain
  ) {
    actionMarkup = `
      <button
        class="button button-primary"
        type="button"
        data-request-again="${escapeHtml(
          shift.id
        )}"
      >
        Request again
      </button>
    `;
  }

  return `
    <details
      class="schedule-shift-item status-${escapeHtml(
        status
      )}"
      data-request-item="${escapeHtml(
        request.id
      )}"
    >
      <summary class="schedule-shift-summary">
        <div class="schedule-summary-date">
          <strong>
            ${escapeHtml(
              formatDate(
                shift.shift_date,
                {
                  weekday: "short",
                  month: "short",
                  day: "numeric"
                }
              )
            )}
          </strong>

          <small>
            ${escapeHtml(
              shift.location ||
              "Location not specified"
            )}
          </small>
        </div>

        <div class="schedule-summary-title">
          <strong>
            ${escapeHtml(
              shift.title
            )}
          </strong>

          <small>
            ${escapeHtml(
              shift.shift_type
            )}
          </small>
        </div>

        <div class="schedule-summary-time">
          <strong>
            ${escapeHtml(
              formatTime(
                request.start_time
              )
            )}
            to
            ${escapeHtml(
              formatTime(
                request.end_time
              )
            )}
          </strong>

          <small>
            ${
              request.request_type ===
              "partial"
                ? "Partial shift"
                : "Full shift"
            }
          </small>
        </div>

        <div class="schedule-summary-staffing">
          <span class="schedule-mini-chip ${escapeHtml(
            status
          )}">
            ${escapeHtml(
              requestStatusLabel(
                status
              )
            )}
          </span>
        </div>
      </summary>

      <div class="schedule-shift-expanded">
        <div class="schedule-expanded-top">
          <div class="schedule-expanded-description">
            <strong>
              Shift information
            </strong>

            <p>
              <strong>
                ${escapeHtml(
                  shift.location ||
                  "Location not specified"
                )}
              </strong>
            </p>

            <p>
              ${
                shift.description
                  ? escapeHtml(
                      shift.description
                    )
                  : "No additional description was provided."
              }
            </p>
          </div>

          <div class="schedule-expanded-duties">
            <strong>
              Duties and notes
            </strong>

            ${
              duties.length
                ? `
                  <ul>
                    ${duties
                      .map(
                        (duty) => `
                          <li>
                            ${escapeHtml(
                              duty
                            )}
                          </li>
                        `
                      )
                      .join("")}
                  </ul>
                `
                : `
                  <p class="muted">
                    No duties or day notes were added.
                  </p>
                `
            }
          </div>
        </div>

        <div class="schedule-expanded-meta">
          <span>
            <strong>Status:</strong>
            ${escapeHtml(
              requestStatusLabel(
                status
              )
            )}
          </span>

          <span>
            <strong>Requested:</strong>
            ${
              request.request_type ===
              "partial"
                ? "Partial shift"
                : "Full shift"
            }
          </span>

          <span>
            <strong>Staffing:</strong>
            ${Number(
              shift.approved_count || 0
            )}
            of
            ${Number(
              shift.preferred_people || 0
            )}
            preferred
          </span>
        </div>

        ${
          request.note
            ? `
              <div class="request-note">
                <strong>Your note</strong>

                <p>
                  ${escapeHtml(
                    request.note
                  )}
                </p>
              </div>
            `
            : ""
        }

        ${
          request.admin_note
            ? `
              <div class="admin-note">
                <strong>
                  Coordinator response
                </strong>

                <p>
                  ${escapeHtml(
                    request.admin_note
                  )}
                </p>
              </div>
            `
            : ""
        }

        ${
          actionMarkup
            ? `
              <div class="schedule-expanded-actions">
                ${actionMarkup}
              </div>
            `
            : ""
        }
      </div>
    </details>
  `;
}

function wireMyShiftActions(
  container
) {
  container
    .querySelectorAll(
      "[data-withdraw-request]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const confirmed =
            window.confirm(
              "Withdraw this shift request?"
            );

          if (!confirmed) {
            return;
          }

          try {
            await dataApi.withdrawShiftRequest(
              button.dataset
                .withdrawRequest
            );

            showAppFeedback(
              "Shift request withdrawn."
            );

            await refreshAll();

            switchView(
              "my-shifts",
              {
                scroll: false
              }
            );
          } catch (error) {
            showAppFeedback(
              error.message ||
                "Unable to withdraw the request.",
              "error"
            );
          }
        }
      );
    });

  container
    .querySelectorAll(
      "[data-request-again]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();

          openShiftRequestDialog(
            button.dataset
              .requestAgain
          );
        }
      );
    });
}
  /* =======================================================
     AVAILABILITY
     ======================================================= */

  function renderAvailability() {
    renderWeeklyAvailability();
    renderSpecificAvailability();
  }

  function renderWeeklyAvailability() {
    const weekly =
      appState.weeklyAvailability;

    for (
      let dayIndex = 0;
      dayIndex < 7;
      dayIndex += 1
    ) {
      const key =
        String(dayIndex);

      const row =
        weekly?.days?.[key] || {
          status: "unavailable",
          start_time: null,
          end_time: null
        };

      const statusSelect =
        document.querySelector(
          `[data-weekly-status="${dayIndex}"]`
        );

      const customContainer =
        document.querySelector(
          `[data-weekly-custom="${dayIndex}"]`
        );

      if (!statusSelect) {
        continue;
      }

      statusSelect.value =
        row.status || "unavailable";

      customContainer?.classList.toggle(
        "is-hidden",
        row.status !== "custom"
      );

      const prefix =
        [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ][dayIndex];

      const startInput =
        byId(
          `weekly${prefix}Start`
        );

      const endInput =
        byId(
          `weekly${prefix}End`
        );

      if (startInput) {
        startInput.value =
          row.start_time || "";
      }

      if (endInput) {
        endInput.value =
          row.end_time || "";
      }
    }

    byId(
      "weeklyAvailabilityNote"
    ).value =
      weekly?.note || "";
  }

  function collectWeeklyAvailability() {
    const days = {};

    for (
      let dayIndex = 0;
      dayIndex < 7;
      dayIndex += 1
    ) {
      const key =
        String(dayIndex);

      const status =
        document.querySelector(
          `[data-weekly-status="${dayIndex}"]`
        )?.value ||
        "unavailable";

      const prefix =
        [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ][dayIndex];

      days[key] = {
        status,
        start_time:
          status === "custom"
            ? byId(
                `weekly${prefix}Start`
              )?.value || null
            : null,
        end_time:
          status === "custom"
            ? byId(
                `weekly${prefix}End`
              )?.value || null
            : null
      };
    }

    return days;
  }

  function handleWeeklyStatusChange(
    event
  ) {
    const dayIndex =
      event.target.dataset
        .weeklyStatus;

    const customContainer =
      document.querySelector(
        `[data-weekly-custom="${dayIndex}"]`
      );

    customContainer?.classList.toggle(
      "is-hidden",
      event.target.value !==
        "custom"
    );
  }

  async function handleWeeklyAvailabilitySubmit(
    event
  ) {
    event.preventDefault();

    try {
      setFormFeedback(
        "weeklyAvailabilityFeedback",
        "Saving availability…"
      );

      await dataApi.saveWeeklyAvailability(
        collectWeeklyAvailability(),
        byId(
          "weeklyAvailabilityNote"
        ).value
      );

      setFormFeedback(
        "weeklyAvailabilityFeedback",
        "Weekly availability saved.",
        "success"
      );

      await refreshAvailabilityData();
      renderAvailability();
    } catch (error) {
      console.error(
        "Weekly availability save failed:",
        error
      );

      setFormFeedback(
        "weeklyAvailabilityFeedback",
        error.message ||
          "Unable to save weekly availability.",
        "error"
      );
    }
  }

  function updateSpecificCustomTimes() {
    const isCustom =
      byId(
        "specificAvailabilityTime"
      ).value === "custom";

    const isAvailable =
      byId(
        "specificAvailabilityStatus"
      ).value === "available";

    byId(
      "specificAvailabilityCustomTimes"
    ).classList.toggle(
      "is-hidden",
      !(isCustom && isAvailable)
    );
  }

  function updateSpecificStatusFields() {
    const isAvailable =
      byId(
        "specificAvailabilityStatus"
      ).value === "available";

    byId(
      "specificAvailabilityTime"
    ).disabled = !isAvailable;

    updateSpecificCustomTimes();
  }

  async function handleSpecificAvailabilitySubmit(
    event
  ) {
    event.preventDefault();

    const isAvailable =
      byId(
        "specificAvailabilityStatus"
      ).value === "available";

    const timeWindow =
      byId(
        "specificAvailabilityTime"
      ).value;

    try {
      setFormFeedback(
        "specificAvailabilityFeedback",
        "Saving date…"
      );

      await dataApi.saveSpecificAvailability({
        exception_date:
          byId(
            "specificAvailabilityDate"
          ).value,
        is_available:
          isAvailable,
        time_window:
          timeWindow,
        start_time:
          timeWindow === "custom"
            ? byId(
                "specificAvailabilityStart"
              ).value
            : null,
        end_time:
          timeWindow === "custom"
            ? byId(
                "specificAvailabilityEnd"
              ).value
            : null,
        note:
          byId(
            "specificAvailabilityNote"
          ).value
      });

      requireElement(
        "specificAvailabilityForm"
      ).reset();

      byId(
        "specificAvailabilityDate"
      ).min =
        todayString();

      updateSpecificStatusFields();

      setFormFeedback(
        "specificAvailabilityFeedback",
        "Specific date saved.",
        "success"
      );

      await refreshAvailabilityData();
      renderAvailability();
    } catch (error) {
      console.error(
        "Specific availability save failed:",
        error
      );

      setFormFeedback(
        "specificAvailabilityFeedback",
        error.message ||
          "Unable to save this date.",
        "error"
      );
    }
  }

  function renderSpecificAvailability() {
    const list =
      requireElement(
        "specificAvailabilityList"
      );

    const rows =
      [...appState
        .specificAvailability].sort(
        (a, b) =>
          String(
            a.exception_date
          ).localeCompare(
            String(
              b.exception_date
            )
          )
      );

    setEmptyState(
      list,
      rows.length === 0
    );

    list.innerHTML =
      rows.length > 0
        ? rows
            .map((row) => {
              let timeLabel =
                "Unavailable";

              if (row.is_available) {
                if (
                  row.time_window ===
                    "custom" &&
                  row.start_time &&
                  row.end_time
                ) {
                  timeLabel =
                    `${formatTime(
                      row.start_time
                    )} to ${formatTime(
                      row.end_time
                    )}`;
                } else {
                  timeLabel =
                    availabilityLabel(
                      row.time_window
                    );
                }
              }

              return `
                <article class="specific-date-row">
                  <div>
                    <strong>
                      ${escapeHtml(
                        formatDate(
                          row.exception_date,
                          {
                            weekday: "short",
                            month: "long",
                            day: "numeric",
                            year: "numeric"
                          }
                        )
                      )}
                    </strong>

                    <small>
                      ${escapeHtml(
                        row.is_available
                          ? "Available"
                          : "Unavailable"
                      )}
                      ·
                      ${escapeHtml(
                        timeLabel
                      )}

                      ${
                        row.note
                          ? ` · ${escapeHtml(
                              row.note
                            )}`
                          : ""
                      }
                    </small>
                  </div>

                  <button
                    class="button button-secondary"
                    type="button"
                    data-remove-specific-date="${escapeHtml(
                      row.id
                    )}"
                  >
                    Remove
                  </button>
                </article>
              `;
            })
            .join("")
        : "No specific dates saved.";

    list
      .querySelectorAll(
        "[data-remove-specific-date]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const confirmed =
              window.confirm(
                "Remove this saved date?"
              );

            if (!confirmed) {
              return;
            }

            try {
              await dataApi.deleteSpecificAvailability(
                button.dataset
                  .removeSpecificDate
              );

              showAppFeedback(
                "Saved date removed."
              );

              await refreshAvailabilityData();
              renderAvailability();
            } catch (error) {
              showAppFeedback(
                error.message ||
                  "Unable to remove the date.",
                "error"
              );
            }
          }
        );
      });
  }

  /* =======================================================
     HOURS
     ======================================================= */

  function renderHours() {
  const list = requireElement(
    "hoursList"
  );

  /*
   * The personal Hours page must always show only the
   * signed-in account's records, even for administrators.
   *
   * Organization-wide hour review remains exclusively
   * inside the Manage and Reports pages.
   */
  const rows = appState.hours
    .filter(
      (row) =>
        row.profile_id ===
        state.profile.id
    )
    .sort((a, b) =>
      String(
        b.entry_date
      ).localeCompare(
        String(
          a.entry_date
        )
      )
    );

  setEmptyState(
    list,
    rows.length === 0
  );

  list.innerHTML =
    rows.length > 0
      ? rows
          .map(
            (row) => `
              <article
                class="hour-card status-${escapeHtml(
                  row.status
                )}"
              >
                <div class="chip-row">
                  <span class="chip ${escapeHtml(
                    row.status
                  )}">
                    ${escapeHtml(
                      hoursStatusLabel(
                        row.status
                      )
                    )}
                  </span>
                </div>

                <h3>
                  ${escapeHtml(
                    formatDate(
                      row.entry_date,
                      {
                        weekday: "short",
                        month: "long",
                        day: "numeric",
                        year: "numeric"
                      }
                    )
                  )}
                </h3>

                <p>
                  ${escapeHtml(
                    formatTime(
                      row.start_time
                    )
                  )}
                  to
                  ${escapeHtml(
                    formatTime(
                      row.end_time
                    )
                  )}
                  ·
                  <strong>
                    ${Number(
                      row.total_hours || 0
                    ).toFixed(2)}
                    hours
                  </strong>
                </p>

                ${
                  row.note
                    ? `
                      <div class="request-note">
                        ${escapeHtml(
                          row.note
                        )}
                      </div>
                    `
                    : ""
                }

                ${
                  row.admin_note
                    ? `
                      <div class="admin-note">
                        <strong>
                          Coordinator response
                        </strong>

                        <p>
                          ${escapeHtml(
                            row.admin_note
                          )}
                        </p>
                      </div>
                    `
                    : ""
                }
              </article>
            `
          )
          .join("")
      : "You have not submitted any hours.";
}

  function populateHoursShiftSelect() {
    const select =
      byId("hoursShiftSelect");

    if (!select) {
      return;
    }

    const currentValue =
      select.value;

    const myApprovedRequests =
      appState.shiftRequests
        .filter(
          (request) =>
            request.profile_id ===
              state.profile.id &&
            request.status ===
              "approved"
        )
        .map((request) => ({
          request,
          shift:
            request.shift ||
            getShiftById(
              request.shift_id
            )
        }))
        .filter(
          (row) => row.shift
        );

    select.innerHTML = `
      <option value="">
        No specific shift
      </option>

      ${myApprovedRequests
        .map(
          ({ shift }) => `
            <option value="${escapeHtml(
              shift.id
            )}">
              ${escapeHtml(
                shift.title
              )}
              ·
              ${escapeHtml(
                shift.shift_date
              )}
            </option>
          `
        )
        .join("")}
    `;

    if (
      [...select.options].some(
        (option) =>
          option.value ===
          currentValue
      )
    ) {
      select.value =
        currentValue;
    }
  }
  function openHoursDialog() {
    requireElement(
      "hoursForm"
    ).reset();

    clearFormFeedback(
      "hoursFeedback"
    );

    byId("hoursDate").value =
      todayString();

    byId("hoursStartTime").value =
      "";

    byId("hoursEndTime").value =
      "";

    populateHoursShiftSelect();

    openDialog("hoursDialog");
  }

  async function handleHoursSubmit(
    event
  ) {
    event.preventDefault();

    try {
      setFormFeedback(
        "hoursFeedback",
        "Submitting hours…"
      );

      await dataApi.submitHours({
        entry_date:
          byId("hoursDate").value,
        start_time:
          byId(
            "hoursStartTime"
          ).value,
        end_time:
          byId(
            "hoursEndTime"
          ).value,
        shift_id:
          byId(
            "hoursShiftSelect"
          ).value || null,
        note:
          byId("hoursNote").value
      });

      closeDialog("hoursDialog");

      showAppFeedback(
        "Hours submitted for approval."
      );

      await refreshAll();
      switchView("hours");
    } catch (error) {
      console.error(
        "Hours submission failed:",
        error
      );

      setFormFeedback(
        "hoursFeedback",
        error.message ||
          "Unable to submit hours.",
        "error"
      );
    }
  }

  /* =======================================================
     MESSAGES
     ======================================================= */

  function renderMessages() {
    const list =
      requireElement(
        "messagesList"
      );

    const rows =
      [...appState.messages].sort(
        (a, b) =>
          Number(
            Boolean(b.pinned)
          ) -
            Number(
              Boolean(a.pinned)
            ) ||
          String(
            b.created_at || ""
          ).localeCompare(
            String(
              a.created_at || ""
            )
          )
      );

    setEmptyState(
      list,
      rows.length === 0
    );

    list.innerHTML =
      rows.length > 0
        ? rows
            .map(
              (message) => `
                <article
                  class="message-card ${
                    message.pinned
                      ? "pinned"
                      : ""
                  }"
                >
                  <div class="chip-row">
                    <span class="chip">
                      ${escapeHtml(
                        message.category
                      )}
                    </span>

                    ${
                      message.pinned
                        ? `
                          <span class="chip">
                            Pinned
                          </span>
                        `
                        : ""
                    }
                  </div>

                  <h3>
                    ${escapeHtml(
                      message.title
                    )}
                  </h3>

                  <p>
                    ${escapeHtml(
                      message.body
                    )}
                  </p>

                  <small>
                    ${escapeHtml(
                      message
                        .author_display_name ||
                        "Bless This Home"
                    )}
                    ·
                    ${escapeHtml(
                      formatDateTime(
                        message.created_at
                      )
                    )}
                  </small>

                  ${
                    hasAdministrativeAccess()
                      ? `
                        <div class="card-actions">
                          <button
                            class="button button-secondary"
                            type="button"
                            data-edit-message="${escapeHtml(
                              message.id
                            )}"
                          >
                            Edit
                          </button>

                          <button
                            class="button button-danger"
                            type="button"
                            data-delete-message="${escapeHtml(
                              message.id
                            )}"
                          >
                            Remove
                          </button>
                        </div>
                      `
                      : ""
                  }
                </article>
              `
            )
            .join("")
        : "No messages posted.";

    list
      .querySelectorAll(
        "[data-edit-message]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            openMessageDialog(
              button.dataset
                .editMessage
            );
          }
        );
      });

    list
      .querySelectorAll(
        "[data-delete-message]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          async () => {
            const confirmed =
              window.confirm(
                "Remove this message?"
              );

            if (!confirmed) {
              return;
            }

            try {
              await dataApi.deleteMessage(
                button.dataset
                  .deleteMessage
              );

              showAppFeedback(
                "Message removed."
              );

              await refreshAll();
            } catch (error) {
              showAppFeedback(
                error.message ||
                  "Unable to remove the message.",
                "error"
              );
            }
          }
        );
      });
  }

  function openMessageDialog(
    messageId = null
  ) {
    if (
      !hasAdministrativeAccess()
    ) {
      return;
    }

    const form =
      requireElement(
        "messageForm"
      );

    form.reset();

    clearFormFeedback(
      "messageFeedback"
    );

    appState.activeMessageId =
      messageId;

    const message =
      messageId
        ? getMessageById(
            messageId
          )
        : null;

    if (message) {
      byId("messageTitle").value =
        message.title || "";

      byId(
        "messageCategory"
      ).value =
        message.category ||
        "Announcements";

      byId("messageBody").value =
        message.body || "";

      byId(
        "messagePinned"
      ).checked =
        Boolean(message.pinned);
    }

    const heading =
      byId("messageDialog")
        .querySelector("h2");

    heading.textContent =
      message
        ? "Edit message"
        : "Post a message";

    openDialog("messageDialog");
  }

  async function handleMessageSubmit(
    event
  ) {
    event.preventDefault();

    const payload = {
      title:
        byId("messageTitle").value,
      category:
        byId(
          "messageCategory"
        ).value,
      body:
        byId("messageBody").value,
      pinned:
        byId("messagePinned").checked
    };

    try {
      setFormFeedback(
        "messageFeedback",
        appState.activeMessageId
          ? "Saving message…"
          : "Posting message…"
      );

      if (
        appState.activeMessageId
      ) {
        await dataApi.updateMessage(
          appState.activeMessageId,
          payload
        );
      } else {
        await dataApi.createMessage(
          payload
        );
      }

      closeDialog("messageDialog");

      showAppFeedback(
        appState.activeMessageId
          ? "Message updated."
          : "Message posted."
      );

      appState.activeMessageId =
        null;

      await refreshAll();
      switchView("messages");
    } catch (error) {
      console.error(
        "Message save failed:",
        error
      );

      setFormFeedback(
        "messageFeedback",
        error.message ||
          "Unable to save the message.",
        "error"
      );
    }
  }

  /* =======================================================
     PROFILE
     ======================================================= */

  async function handleProfileSubmit(
    event
  ) {
    event.preventDefault();

    try {
      setFormFeedback(
        "profileFeedback",
        "Saving profile…"
      );

      const updated =
        await auth.updateProfile({
          first_name:
            byId(
              "profileFirstName"
            ).value,
          last_name:
            byId(
              "profileLastName"
            ).value,
          phone:
            byId(
              "profilePhone"
            ).value,
          preferred_contact_method:
            byId(
              "profileContactMethod"
            ).value
        });

      state.profile = updated;

      applyProfileToInterface();

      setFormFeedback(
        "profileFeedback",
        "Profile saved.",
        "success"
      );

      await refreshAll();
    } catch (error) {
      console.error(
        "Profile save failed:",
        error
      );

      setFormFeedback(
        "profileFeedback",
        error.message ||
          "Unable to save the profile.",
        "error"
      );
    }
  }

  /* =======================================================
     ADMIN MANAGEMENT
     ======================================================= */

  function renderManage() {
  if (!hasAdministrativeAccess()) {
    return;
  }

  renderPendingShiftRequests();
  renderManageShifts();
  renderPendingHours();
  updateManagementBadges();

  refreshAvailabilityUpdateBadge().catch(
    (error) => {
      console.warn(
        "Availability notifications could not be refreshed:",
        error
      );
    }
  );
}

  function populatePendingShiftRequestPersonSelect() {
  const select = byId(
    "pendingShiftRequestPersonSelect"
  );

  if (!select) {
    return;
  }

  const currentValue = select.value;

  const pendingRequests =
    appState.shiftRequests.filter(
      (request) =>
        request.status === "pending"
    );

  const peopleMap = new Map();

  pendingRequests.forEach(
    (request) => {
      if (!request.profile_id) {
        return;
      }

      if (
        !peopleMap.has(
          request.profile_id
        )
      ) {
        peopleMap.set(
          request.profile_id,
          {
            profileId:
              request.profile_id,

            displayName:
              request.display_name ||
              getProfileName(
                request.profile_id
              ),

            requestCount: 0
          }
        );
      }

      peopleMap.get(
        request.profile_id
      ).requestCount += 1;
    }
  );

  const people = [
    ...peopleMap.values()
  ].sort((first, second) =>
    String(
      first.displayName
    ).localeCompare(
      String(
        second.displayName
      )
    )
  );

  select.innerHTML = `
    <option value="">
      ${
        people.length
          ? "Select a person"
          : "No pending requests"
      }
    </option>

    ${people
      .map(
        (person) => `
          <option value="${escapeHtml(
            person.profileId
          )}">
            ${escapeHtml(
              person.displayName
            )}
            ·
            ${person.requestCount}
            request${
              person.requestCount === 1
                ? ""
                : "s"
            }
          </option>
        `
      )
      .join("")}
  `;

  select.disabled =
    people.length === 0;

  const currentStillExists =
    people.some(
      (person) =>
        person.profileId ===
        currentValue
    );

  if (currentStillExists) {
    select.value =
      currentValue;
  } else if (
    people.length === 1
  ) {
    select.value =
      people[0].profileId;
  } else {
    select.value = "";
  }
}

function renderPendingShiftRequests() {
  populatePendingShiftRequestPersonSelect();

  const select = byId(
    "pendingShiftRequestPersonSelect"
  );

  const list = requireElement(
    "pendingShiftRequestsList"
  );

  const selectedProfileId =
    select?.value || "";

  const allPendingRequests =
    appState.shiftRequests
      .filter(
        (request) =>
          request.status ===
          "pending"
      )
      .map((request) => ({
        ...request,

        shift:
          request.shift ||
          getShiftById(
            request.shift_id
          )
      }))
      .filter(
        (request) =>
          Boolean(request.shift)
      );

  if (
    allPendingRequests.length === 0
  ) {
    setEmptyState(list, true);

    list.innerHTML =
      "No pending requests.";

    return;
  }

  if (!selectedProfileId) {
    setEmptyState(list, true);

    list.innerHTML =
      "Select a person to review pending requests.";

    return;
  }

  const rows =
    allPendingRequests
      .filter(
        (request) =>
          request.profile_id ===
          selectedProfileId
      )
      .sort((first, second) =>
        (
          `${first.shift.shift_date}` +
          `${first.shift.start_time}`
        ).localeCompare(
          `${second.shift.shift_date}` +
          `${second.shift.start_time}`
        )
      );

  const displayName =
    rows[0]?.display_name ||
    getProfileName(
      selectedProfileId
    );

  setEmptyState(
    list,
    rows.length === 0
  );

  list.innerHTML =
    rows.length > 0
      ? `
        <div class="pending-hours-summary">
          <div>
            <strong>
              ${escapeHtml(
                displayName
              )}
            </strong>

            <small>
              ${rows.length}
              pending request${
                rows.length === 1
                  ? ""
                  : "s"
              }
            </small>
          </div>
        </div>

        ${rows
          .map((request) => {
            const requestedTime =
              `${formatTime(
                request.start_time
              )} to ${formatTime(
                request.end_time
              )}`;

            return `
              <article class="management-row status-pending">
                <div class="management-row-main">
                  <strong>
                    ${escapeHtml(
                      request.shift.title
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(
                      request.shift
                        .shift_type
                    )}
                    ·
                    ${escapeHtml(
                      request.shift
                        .location || ""
                    )}
                  </small>
                </div>

                <div class="management-row-detail">
                  <span class="management-status pending">
                    ${
                      request.request_type ===
                      "partial"
                        ? "Partial request"
                        : "Full shift"
                    }
                  </span>

                  <small>
                    ${escapeHtml(
                      formatDate(
                        request.shift
                          .shift_date,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        }
                      )
                    )}
                    ·
                    ${escapeHtml(
                      requestedTime
                    )}
                  </small>
                </div>

                ${
                  request.note
                    ? `
                      <div class="management-row-note">
                        <strong>
                          Volunteer note
                        </strong>

                        <div>
                          ${escapeHtml(
                            request.note
                          )}
                        </div>
                      </div>
                    `
                    : ""
                }

                <div class="management-row-actions">
                  <button
                    class="button button-primary button-small"
                    type="button"
                    data-review-request="${escapeHtml(
                      request.id
                    )}"
                  >
                    Review
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      `
      : "This person has no pending requests.";

  list
    .querySelectorAll(
      "[data-review-request]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          openRequestReviewDialog(
            button.dataset
              .reviewRequest
          );
        }
      );
    });
}

function updateManagementBadges() {
  const pendingRequests =
    appState.shiftRequests.filter(
      (request) =>
        request.status === "pending"
    ).length;

  const pendingHours =
    appState.hours.filter(
      (row) =>
        row.status === "pending"
    ).length;

  const requestBadge = byId(
    "pendingShiftRequestBadge"
  );

  if (requestBadge) {
    requestBadge.textContent =
      `${pendingRequests} ${
        pendingRequests === 1
          ? "request"
          : "requests"
      }`;

    requestBadge.classList.toggle(
      "is-hidden",
      pendingRequests === 0
    );

    requestBadge.classList.toggle(
      "has-alert",
      pendingRequests > 0
    );
  }

  const hoursBadge = byId(
    "pendingHoursBadge"
  );

  if (hoursBadge) {
    hoursBadge.textContent =
      `${pendingHours} ${
        pendingHours === 1
          ? "entry"
          : "entries"
      }`;

    hoursBadge.classList.toggle(
      "is-hidden",
      pendingHours === 0
    );

    hoursBadge.classList.toggle(
      "has-alert",
      pendingHours > 0
    );
  }
}
  function openRequestReviewDialog(
    requestId
  ) {
    const request =
      getRequestById(requestId);

    if (!request) {
      showAppFeedback(
        "The request could not be found.",
        "error"
      );

      return;
    }

    const shift =
      request.shift ||
      getShiftById(
        request.shift_id
      );

    if (!shift) {
      showAppFeedback(
        "The related shift could not be found.",
        "error"
      );

      return;
    }

    appState.activeRequestId =
      requestId;

    byId(
      "requestReviewNote"
    ).value =
      request.admin_note || "";

    clearFormFeedback(
      "requestReviewFeedback"
    );

    byId(
      "requestReviewDetails"
    ).innerHTML = `
      <div class="shift-description">
        <p>
          <strong>
            ${escapeHtml(
              request.display_name ||
                getProfileName(
                  request.profile_id
                )
            )}
          </strong>
        </p>

        <p>
          ${escapeHtml(
            shift.title
          )}

          <br>

          ${escapeHtml(
            formatDate(
              shift.shift_date,
              {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
              }
            )
          )}

          <br>

          ${escapeHtml(
            formatTime(
              request.start_time
            )
          )}
          to
          ${escapeHtml(
            formatTime(
              request.end_time
            )
          )}
        </p>

        ${
          request.note
            ? `
              <p>
                <strong>
                  Volunteer note
                </strong>

                <br>

                ${escapeHtml(
                  request.note
                )}
              </p>
            `
            : ""
        }
      </div>
    `;

    openDialog(
      "requestReviewDialog"
    );
  }

  async function reviewActiveRequest(
    decision
  ) {
    if (
      !appState.activeRequestId
    ) {
      return;
    }

    try {
      setFormFeedback(
        "requestReviewFeedback",
        decision === "approved"
          ? "Approving request…"
          : "Declining request…"
      );

      await dataApi.reviewShiftRequest(
        appState.activeRequestId,
        decision,
        byId(
          "requestReviewNote"
        ).value
      );

      closeDialog(
        "requestReviewDialog"
      );

      showAppFeedback(
        decision === "approved"
          ? "Shift request approved."
          : "Shift request declined."
      );

      appState.activeRequestId =
        null;

      await refreshAll();
      switchView("manage");
    } catch (error) {
      console.error(
        "Request review failed:",
        error
      );

      setFormFeedback(
        "requestReviewFeedback",
        error.message ||
          "Unable to review the request.",
        "error"
      );
    }
  }

  function populateManageShiftFilters(
  rows
) {
  const typeSelect =
    byId("manageShiftTypeFilter");

  const locationSelect =
    byId("manageShiftLocationFilter");

  if (
    !typeSelect ||
    !locationSelect
  ) {
    return;
  }

  const currentType =
    typeSelect.value;

  const currentLocation =
    locationSelect.value;

  const types = [
    ...new Set(
      rows
        .map(
          (shift) =>
            String(
              shift.shift_type || ""
            ).trim()
        )
        .filter(Boolean)
    )
  ].sort((first, second) =>
    first.localeCompare(second)
  );

  const locations = [
    ...new Set(
      rows
        .map(
          (shift) =>
            String(
              shift.location || ""
            ).trim()
        )
        .filter(Boolean)
    )
  ].sort((first, second) =>
    first.localeCompare(second)
  );

  typeSelect.innerHTML = `
    <option value="">
      All shift types
    </option>

    ${types
      .map(
        (type) => `
          <option value="${escapeHtml(
            type
          )}">
            ${escapeHtml(type)}
          </option>
        `
      )
      .join("")}
  `;

  locationSelect.innerHTML = `
    <option value="">
      All locations
    </option>

    ${locations
      .map(
        (location) => `
          <option value="${escapeHtml(
            location
          )}">
            ${escapeHtml(
              location
            )}
          </option>
        `
      )
      .join("")}
  `;

  if (
    types.includes(
      currentType
    )
  ) {
    typeSelect.value =
      currentType;
  }

  if (
    locations.includes(
      currentLocation
    )
  ) {
    locationSelect.value =
      currentLocation;
  }
}

function searchableShiftText(
  shift
) {
  const duties =
    Array.isArray(shift.duties)
      ? shift.duties.join(" ")
      : "";

  return [
    shift.title,
    shift.shift_type,
    shift.location,
    shift.description,
    duties,
    shift.shift_date,
    formatDate(
      shift.shift_date,
      {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      }
    ),
    formatTime(
      shift.start_time
    ),
    formatTime(
      shift.end_time
    )
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderManageShifts() {
  const list = requireElement(
    "manageShiftsList"
  );

  const allUpcomingRows =
    appState.shifts
      .filter(
        (shift) =>
          shift.shift_date >=
            todayString()
      )
      .sort((first, second) =>
        (
          `${first.shift_date}` +
          `${first.start_time}`
        ).localeCompare(
          `${second.shift_date}` +
            `${second.start_time}`
        )
      );

  populateManageShiftFilters(
    allUpcomingRows
  );

  const searchValue =
    String(
      byId(
        "manageShiftSearch"
      )?.value || ""
    )
      .trim()
      .toLowerCase();

  const typeFilter =
    byId(
      "manageShiftTypeFilter"
    )?.value || "";

  const locationFilter =
    byId(
      "manageShiftLocationFilter"
    )?.value || "";

  const rows =
    allUpcomingRows.filter(
      (shift) => {
        const matchesSearch =
          !searchValue ||
          searchableShiftText(
            shift
          ).includes(
            searchValue
          );

        const matchesType =
          !typeFilter ||
          shift.shift_type ===
            typeFilter;

        const matchesLocation =
          !locationFilter ||
          shift.location ===
            locationFilter;

        return (
          matchesSearch &&
          matchesType &&
          matchesLocation
        );
      }
    );

  const count =
    byId("manageShiftCount");

  if (count) {
    count.textContent =
      `${rows.length} shift${
        rows.length === 1
          ? ""
          : "s"
      }`;
  }

  setEmptyState(
    list,
    rows.length === 0
  );

  list.innerHTML =
    rows.length > 0
      ? rows
          .map((shift) => {
            const status =
              staffingStatus(shift);

            const duties =
              Array.isArray(
                shift.duties
              )
                ? shift.duties.filter(
                    Boolean
                  )
                : [];

            return `
              <details
                class="management-shift-item status-${escapeHtml(
                  status
                )}"
              >
                <summary class="management-shift-summary">
                  <div class="management-row-main">
                    <strong>
                      ${escapeHtml(
                        shift.title
                      )}
                    </strong>

                    <small>
                      ${escapeHtml(
                        shift.shift_type ||
                        "Other"
                      )}
                      ·
                      ${escapeHtml(
                        shift.location ||
                        "No location"
                      )}
                    </small>
                  </div>

                  <div class="management-row-detail">
                    <strong>
                      ${escapeHtml(
                        formatDate(
                          shift.shift_date,
                          {
                            month: "short",
                            day: "numeric"
                          }
                        )
                      )}
                      ·
                      ${escapeHtml(
                        formatTime(
                          shift.start_time
                        )
                      )}
                    </strong>

                    <small>
                      ${Number(
                        shift.approved_count ||
                        0
                      )}
                      approved ·
                      ${Number(
                        shift.pending_count ||
                        0
                      )}
                      pending
                    </small>
                  </div>
                </summary>

                <div class="management-shift-expanded">
                  <div class="management-shift-meta">
                    <span>
                      <strong>Date:</strong>
                      ${escapeHtml(
                        formatDate(
                          shift.shift_date,
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric"
                          }
                        )
                      )}
                    </span>

                    <span>
                      <strong>Time:</strong>
                      ${escapeHtml(
                        formatTime(
                          shift.start_time
                        )
                      )}
                      to
                      ${escapeHtml(
                        formatTime(
                          shift.end_time
                        )
                      )}
                    </span>

                    <span>
                      <strong>Staffing:</strong>
                      ${Number(
                        shift.minimum_people ||
                        0
                      )}
                      minimum,
                      ${Number(
                        shift.preferred_people ||
                        0
                      )}
                      preferred,
                      ${Number(
                        shift.maximum_people ||
                        0
                      )}
                      maximum
                    </span>
                  </div>

                  ${
                    shift.description
                      ? `
                        <div class="management-row-note">
                          <strong>
                            Description
                          </strong>

                          <div>
                            ${escapeHtml(
                              shift.description
                            )}
                          </div>
                        </div>
                      `
                      : ""
                  }

                  ${
                    duties.length
                      ? `
                        <div class="management-row-note">
                          <strong>
                            Duties and notes
                          </strong>

                          <ul class="duties-list">
                            ${duties
                              .map(
                                (duty) => `
                                  <li>
                                    ${escapeHtml(
                                      duty
                                    )}
                                  </li>
                                `
                              )
                              .join("")}
                          </ul>
                        </div>
                      `
                      : ""
                  }

                  <div class="management-shift-actions">
  <button
    class="button button-secondary"
    type="button"
    data-edit-shift="${escapeHtml(
      shift.id
    )}"
  >
    Edit shift
  </button>

  <button
    class="button button-danger"
    type="button"
    data-cancel-shift="${escapeHtml(
      shift.id
    )}"
  >
    Cancel shift
  </button>
</div>
                </div>
              </details>
            `;
          })
          .join("")
      : allUpcomingRows.length
        ? "No shifts match the current search and filters."
        : "No upcoming shifts.";

  list
    .querySelectorAll(
      "[data-edit-shift]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();

          openEditShiftDialog(
            button.dataset.editShift
          );
        }
      );
    });

  list
    .querySelectorAll(
      "[data-cancel-shift]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const confirmed =
            window.confirm(
              "Cancel this shift and its active requests?"
            );

          if (!confirmed) {
            return;
          }

          try {
            await dataApi.cancelShift(
              button.dataset.cancelShift
            );

            showAppFeedback(
              "Shift cancelled."
            );

            await refreshAll();
          } catch (error) {
            showAppFeedback(
              error.message ||
                "Unable to cancel the shift.",
              "error"
            );
          }
        }
      );
    });
}
function populatePendingHoursPersonSelect() {
  const select = byId(
    "pendingHoursPersonSelect"
  );

  if (!select) {
    return;
  }

  const currentValue = select.value;

  const pendingRows = appState.hours.filter(
    (row) =>
      row.status === "pending"
  );

  const peopleMap = new Map();

  pendingRows.forEach((row) => {
    if (!row.profile_id) {
      return;
    }

    if (!peopleMap.has(row.profile_id)) {
      peopleMap.set(row.profile_id, {
        profileId: row.profile_id,
        displayName:
          row.display_name ||
          getProfileName(
            row.profile_id
          ),
        entries: 0,
        hours: 0
      });
    }

    const person = peopleMap.get(
      row.profile_id
    );

    person.entries += 1;

    person.hours += Number(
      row.total_hours || 0
    );
  });

  const people = [...peopleMap.values()]
    .sort((a, b) =>
      String(a.displayName).localeCompare(
        String(b.displayName)
      )
    );

  select.innerHTML = `
    <option value="">
      ${
        people.length
          ? "Select a person"
          : "No pending hours"
      }
    </option>

    ${people
      .map(
        (person) => `
          <option value="${escapeHtml(
            person.profileId
          )}">
            ${escapeHtml(
              person.displayName
            )}
            ·
            ${person.entries}
            entr${person.entries === 1 ? "y" : "ies"}
            ·
            ${person.hours.toFixed(2)}
            hours
          </option>
        `
      )
      .join("")}
  `;

  select.disabled =
    people.length === 0;

  if (
    people.some(
      (person) =>
        person.profileId ===
        currentValue
    )
  ) {
    select.value = currentValue;
  } else if (people.length === 1) {
    select.value =
      people[0].profileId;
  }
}

  function renderPendingHours() {
  populatePendingHoursPersonSelect();

  const select = byId(
    "pendingHoursPersonSelect"
  );

  const list = requireElement(
    "pendingHoursList"
  );

  const selectedProfileId =
    select?.value || "";

  const allPendingRows =
    appState.hours.filter(
      (row) =>
        row.status === "pending"
    );

  if (!allPendingRows.length) {
    setEmptyState(list, true);

    list.innerHTML =
      "No pending hours.";

    return;
  }

  if (!selectedProfileId) {
    setEmptyState(list, true);

    list.innerHTML =
      "Select a person to review pending hours.";

    return;
  }

  const rows = allPendingRows
    .filter(
      (row) =>
        row.profile_id ===
        selectedProfileId
    )
    .sort((a, b) =>
      String(b.entry_date).localeCompare(
        String(a.entry_date)
      )
    );

  const displayName =
    rows[0]?.display_name ||
    getProfileName(
      selectedProfileId
    );

  const totalHours = rows.reduce(
    (total, row) =>
      total +
      Number(row.total_hours || 0),
    0
  );

  setEmptyState(
    list,
    rows.length === 0
  );

  list.innerHTML =
    rows.length > 0
      ? `
        <div class="pending-hours-summary">
          <div>
            <strong>
              ${escapeHtml(displayName)}
            </strong>

            <small>
              ${rows.length}
              pending entr${
                rows.length === 1
                  ? "y"
                  : "ies"
              }
            </small>
          </div>

          <span class="pending-hours-total">
            ${totalHours.toFixed(2)}
            total hours
          </span>
        </div>

        ${rows
          .map(
            (row) => `
              <article class="management-row status-pending">
                <div class="management-row-main">
                  <strong>
                    ${escapeHtml(
                      formatDate(
                        row.entry_date,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        }
                      )
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(
                      formatTime(
                        row.start_time
                      )
                    )}
                    to
                    ${escapeHtml(
                      formatTime(
                        row.end_time
                      )
                    )}
                  </small>
                </div>

                <div class="management-row-detail">
                  <strong>
                    ${Number(
                      row.total_hours || 0
                    ).toFixed(2)}
                    hours
                  </strong>

                  <small>
                    Pending approval
                  </small>
                </div>

                <div class="management-row-actions">
                  <button
                    class="button button-primary button-small"
                    type="button"
                    data-approve-hours="${escapeHtml(
                      row.id
                    )}"
                  >
                    Approve
                  </button>

                  <button
                    class="button button-danger button-small"
                    type="button"
                    data-decline-hours="${escapeHtml(
                      row.id
                    )}"
                  >
                    Decline
                  </button>
                </div>

                ${
                  row.note
                    ? `
                      <div class="management-row-note">
                        ${escapeHtml(
                          row.note
                        )}
                      </div>
                    `
                    : ""
                }
              </article>
            `
          )
          .join("")}
      `
      : "This person has no pending hours.";

  list
    .querySelectorAll(
      "[data-approve-hours]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          reviewHours(
            button.dataset.approveHours,
            "approved"
          )
      );
    });

  list
    .querySelectorAll(
      "[data-decline-hours]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          reviewHours(
            button.dataset.declineHours,
            "declined"
          )
      );
    });
}

  async function reviewHours(
    hoursId,
    decision
  ) {
    const note =
      window.prompt(
        decision === "approved"
          ? "Optional approval note:"
          : "Optional reason for declining:",
        ""
      );

    if (note === null) {
      return;
    }

    try {
      await dataApi.reviewHours(
        hoursId,
        decision,
        note
      );

      showAppFeedback(
        decision === "approved"
          ? "Hours approved."
          : "Hours declined."
      );

      await refreshAll();
    } catch (error) {
      showAppFeedback(
        error.message ||
          "Unable to review the time entry.",
        "error"
      );
    }
  }

  /* =======================================================
     CREATE SHIFT
     ======================================================= */

  function openCreateShiftDialog() {
  if (!hasAdministrativeAccess()) {
    return;
  }

  appState.editingShiftId = null;

  const form = requireElement(
    "createShiftForm"
  );

  form.reset();

  clearFormFeedback(
    "createShiftFeedback"
  );

  requireElement(
    "createShiftDialogTitle"
  ).textContent =
    "Create shift";

  requireElement(
    "createShiftSubmitButton"
  ).textContent =
    "Create shift";

  byId(
    "createShiftDate"
  ).value =
    todayString();

  byId(
    "createShiftDate"
  ).min =
    todayString();

  byId(
    "createShiftStaffingPreset"
  ).value =
    "2|4|6";

  setStaffingPresetValues(
    "2|4|6"
  );

  byId(
    "createShiftTimePreset"
  ).value = "";

  byId(
    "createShiftLocationPreset"
  ).value = "";

  byId(
    "createShiftCustomTimes"
  ).classList.add(
    "is-hidden"
  );

  byId(
    "createShiftCustomStaffing"
  ).classList.add(
    "is-hidden"
  );

  byId(
    "createShiftCustomLocationField"
  ).classList.add(
    "is-hidden"
  );

  openDialog(
    "createShiftDialog"
  );
}

function openEditShiftDialog(
  shiftId
) {
  if (!hasAdministrativeAccess()) {
    return;
  }

  const shift =
    getShiftById(shiftId);

  if (!shift) {
    showAppFeedback(
      "The selected shift could not be found.",
      "error"
    );

    return;
  }

  appState.editingShiftId =
    shift.id;

  requireElement(
    "createShiftForm"
  ).reset();

  clearFormFeedback(
    "createShiftFeedback"
  );

  requireElement(
    "createShiftDialogTitle"
  ).textContent =
    "Edit shift";

  requireElement(
    "createShiftSubmitButton"
  ).textContent =
    "Save changes";

  byId(
    "createShiftTitle"
  ).value =
    shift.title || "";

  byId(
    "createShiftDate"
  ).value =
    shift.shift_date || "";

  byId(
    "createShiftDate"
  ).min =
    todayString();

  byId(
    "createShiftType"
  ).value =
    shift.shift_type || "Other";

  /*
   * Use custom time so the current values
   * always appear correctly.
   */
  byId(
    "createShiftTimePreset"
  ).value =
    "custom";

  byId(
    "createShiftCustomTimes"
  ).classList.remove(
    "is-hidden"
  );

  byId(
    "createShiftStartTime"
  ).value =
    String(
      shift.start_time || ""
    ).slice(0, 5);

  byId(
    "createShiftEndTime"
  ).value =
    String(
      shift.end_time || ""
    ).slice(0, 5);

  /*
   * Use custom staffing so no existing
   * staffing values are accidentally changed.
   */
  byId(
    "createShiftStaffingPreset"
  ).value =
    "custom";

  byId(
    "createShiftCustomStaffing"
  ).classList.remove(
    "is-hidden"
  );

  byId(
    "createShiftMinimum"
  ).value =
    String(
      shift.minimum_people || 0
    );

  byId(
    "createShiftPreferred"
  ).value =
    String(
      shift.preferred_people || 1
    );

  byId(
    "createShiftMaximum"
  ).value =
    String(
      shift.maximum_people || 1
    );

  const knownLocations = [
    "Bless This Home Thrift Store",
    "Main Warehouse",
    "Hauler Station",
    "Delivery Route"
  ];

  if (
    knownLocations.includes(
      shift.location
    )
  ) {
    byId(
      "createShiftLocationPreset"
    ).value =
      shift.location;

    byId(
      "createShiftCustomLocation"
    ).value = "";

    byId(
      "createShiftCustomLocationField"
    ).classList.add(
      "is-hidden"
    );
  } else {
    byId(
      "createShiftLocationPreset"
    ).value =
      "custom";

    byId(
      "createShiftCustomLocation"
    ).value =
      shift.location || "";

    byId(
      "createShiftCustomLocationField"
    ).classList.remove(
      "is-hidden"
    );
  }

  byId(
    "createShiftDescription"
  ).value =
    shift.description || "";

  byId(
    "createShiftDuties"
  ).value =
    Array.isArray(
      shift.duties
    )
      ? shift.duties.join("\n")
      : "";

  openDialog(
    "createShiftDialog"
  );
}

  function handleShiftTimePresetChange() {
    const value =
      byId(
        "createShiftTimePreset"
      ).value;

    const custom =
      value === "custom";

    byId(
      "createShiftCustomTimes"
    ).classList.toggle(
      "is-hidden",
      !custom
    );

    if (
      value &&
      !custom
    ) {
      const [start, end] =
        value.split("|");

      byId(
        "createShiftStartTime"
      ).value = start;

      byId(
        "createShiftEndTime"
      ).value = end;
    }

    if (custom) {
      byId(
        "createShiftStartTime"
      ).value = "";

      byId(
        "createShiftEndTime"
      ).value = "";
    }
  }

  function setStaffingPresetValues(
    value
  ) {
    if (
      !value ||
      value === "custom"
    ) {
      return;
    }

    const [
      minimum,
      preferred,
      maximum
    ] = value
      .split("|")
      .map(Number);

    byId(
      "createShiftMinimum"
    ).value =
      String(minimum);

    byId(
      "createShiftPreferred"
    ).value =
      String(preferred);

    byId(
      "createShiftMaximum"
    ).value =
      String(maximum);
  }

  function handleStaffingPresetChange() {
    const value =
      byId(
        "createShiftStaffingPreset"
      ).value;

    const custom =
      value === "custom";

    byId(
      "createShiftCustomStaffing"
    ).classList.toggle(
      "is-hidden",
      !custom
    );

    if (!custom) {
      setStaffingPresetValues(
        value
      );
    }
  }

  function handleLocationPresetChange() {
    const value =
      byId(
        "createShiftLocationPreset"
      ).value;

    const custom =
      value === "custom";

    byId(
      "createShiftCustomLocationField"
    ).classList.toggle(
      "is-hidden",
      !custom
    );

    if (!custom) {
      byId(
        "createShiftCustomLocation"
      ).value = "";
    }
  }

  async function handleCreateShiftSubmit(
  event
) {
  event.preventDefault();

  const presetLocation =
    byId(
      "createShiftLocationPreset"
    ).value;

  const location =
    presetLocation === "custom"
      ? byId(
          "createShiftCustomLocation"
        ).value.trim()
      : presetLocation;

  const duties =
    byId(
      "createShiftDuties"
    ).value
      .split("\n")
      .map((item) =>
        item.trim()
      )
      .filter(Boolean);

  const payload = {
    title:
      byId(
        "createShiftTitle"
      ).value.trim(),

    shift_date:
      byId(
        "createShiftDate"
      ).value,

    shift_type:
      byId(
        "createShiftType"
      ).value,

    start_time:
      byId(
        "createShiftStartTime"
      ).value,

    end_time:
      byId(
        "createShiftEndTime"
      ).value,

    minimum_people:
      Number(
        byId(
          "createShiftMinimum"
        ).value
      ),

    preferred_people:
      Number(
        byId(
          "createShiftPreferred"
        ).value
      ),

    maximum_people:
      Number(
        byId(
          "createShiftMaximum"
        ).value
      ),

    location,

    description:
      byId(
        "createShiftDescription"
      ).value.trim(),

    duties
  };

  if (
    !payload.title ||
    !payload.shift_date ||
    !payload.start_time ||
    !payload.end_time ||
    !payload.location
  ) {
    setFormFeedback(
      "createShiftFeedback",
      "Complete the title, date, time and location.",
      "error"
    );

    return;
  }

  try {
    const isEditing =
      Boolean(
        appState.editingShiftId
      );

    setFormFeedback(
      "createShiftFeedback",
      isEditing
        ? "Saving changes…"
        : "Creating shift…"
    );

    if (isEditing) {
      await dataApi.updateShift(
        appState.editingShiftId,
        payload
      );
    } else {
      await dataApi.createShift(
        payload
      );
    }

    closeDialog(
      "createShiftDialog"
    );

    showAppFeedback(
      isEditing
        ? "Shift updated."
        : "Shift created."
    );

    appState.editingShiftId =
      null;

    await refreshAll();

    switchView("manage");
  } catch (error) {
    console.error(
      "Shift save failed:",
      error
    );

    setFormFeedback(
      "createShiftFeedback",
      error.message ||
        "Unable to save the shift.",
      "error"
    );
  }
}

  /* =======================================================
     ADMIN AVAILABILITY
     ======================================================= */

function availabilityViewedStorageKey(
  profileId
) {
  return [
    "bth_availability_viewed",
    state.profile.id,
    profileId
  ].join("_");
}

function latestAvailabilityTimestamp(
  summary
) {
  const timestamps = [];

  if (
    summary?.weekly?.updated_at
  ) {
    timestamps.push(
      summary.weekly.updated_at
    );
  }

  if (
    summary?.weekly?.created_at
  ) {
    timestamps.push(
      summary.weekly.created_at
    );
  }

  const specificRows =
    Array.isArray(summary?.specific)
      ? summary.specific
      : [];

  specificRows.forEach((row) => {
    if (row.updated_at) {
      timestamps.push(
        row.updated_at
      );
    }

    if (row.created_at) {
      timestamps.push(
        row.created_at
      );
    }
  });

  const validTimes =
    timestamps
      .map((value) =>
        new Date(value).getTime()
      )
      .filter(
        (value) =>
          Number.isFinite(value)
      );

  return validTimes.length
    ? Math.max(...validTimes)
    : 0;
}

function markAvailabilityViewed(
  profileId,
  summary
) {
  if (!profileId) {
    return;
  }

  const latestTimestamp =
    latestAvailabilityTimestamp(
      summary
    );

  if (!latestTimestamp) {
    return;
  }

  localStorage.setItem(
    availabilityViewedStorageKey(
      profileId
    ),
    String(latestTimestamp)
  );
}

async function refreshAvailabilityUpdateBadge() {
  const badge = byId(
    "availabilityUpdateBadge"
  );

  if (!badge) {
    return;
  }

  const teamMembers =
    appState.profiles.filter(
      (profile) =>
        profile.account_status ===
          "active" &&
        profile.id !==
          state.profile.id
    );

  if (!teamMembers.length) {
    badge.classList.add(
      "is-hidden"
    );

    return;
  }

  const results =
    await Promise.allSettled(
      teamMembers.map(
        async (profile) => {
          const summary =
            await dataApi
              .getAvailabilitySummary(
                profile.id
              );

          const latestTimestamp =
            latestAvailabilityTimestamp(
              summary
            );

          const viewedTimestamp =
            Number(
              localStorage.getItem(

              availabilityViewedStorageKey(
                  profile.id
                )
              ) || 0
            );

          return (
            latestTimestamp >
            viewedTimestamp
          );
        }
      )
    );

  const updateCount =
    results.filter(
      (result) =>
        result.status ===
          "fulfilled" &&
        result.value === true
    ).length;

  badge.textContent =
    updateCount > 0
      ? String(updateCount)
      : "Updated";

  badge.classList.toggle(
    "is-hidden",
    updateCount === 0
  );
}

  function populateAvailabilityVolunteerSelect() {
  const select = byId(
    "availabilityVolunteerSelect"
  );

  if (!select) {
    return;
  }

  const currentValue = select.value;

  const roleOrder = {
    admin: 0,
    coordinator: 1,
    volunteer: 2
  };

  const teamMembers = [...appState.profiles]
    .filter(
      (profile) =>
        profile.account_status === "active"
    )
    .sort((a, b) => {
      const roleDifference =
        (roleOrder[a.role] ?? 99) -
        (roleOrder[b.role] ?? 99);

      if (roleDifference !== 0) {
        return roleDifference;
      }

      return String(
        a.display_name || ""
      ).localeCompare(
        String(b.display_name || "")
      );
    });

  const groups = [
    {
      role: "admin",
      label: "Administrators"
    },
    {
      role: "coordinator",
      label: "Coordinators"
    },
    {
      role: "volunteer",
      label: "Volunteers"
    }
  ];

  select.innerHTML = `
    <option value="">
      Select a team member
    </option>

    ${groups
      .map((group) => {
        const members = teamMembers.filter(
          (profile) =>
            profile.role === group.role
        );

        if (!members.length) {
          return "";
        }

        return `
          <optgroup label="${escapeHtml(
            group.label
          )}">
            ${members
              .map(
                (profile) => `
                  <option value="${escapeHtml(
                    profile.id
                  )}">
                    ${escapeHtml(
                      profile.display_name
                    )}
                  </option>
                `
              )
              .join("")}
          </optgroup>
        `;
      })
      .join("")}
  `;

  if (
    teamMembers.some(
      (profile) =>
        profile.id === currentValue
    )
  ) {
    select.value = currentValue;
  }
}

  async function handleAvailabilityVolunteerChange() {
    const profileId =
      byId(
        "availabilityVolunteerSelect"
      ).value;

    const container =
      byId(
        "adminAvailabilitySummary"
      );

    if (!profileId) {
      container.classList.add(
        "empty-state"
      );

      container.textContent =
        "Select a volunteer to view availability.";

      return;
    }

    container.classList.add(
      "empty-state"
    );

    container.textContent =
      "Loading availability…";

    try {
      const summary =
  await dataApi.getAvailabilitySummary(
    profileId
  );

renderAdminAvailabilitySummary(
  summary
);

markAvailabilityViewed(
  profileId,
  summary
);

await refreshAvailabilityUpdateBadge();
    } catch (error) {
      container.textContent =
        error.message ||
        "Unable to load availability.";
    }
  }

  function renderAdminAvailabilitySummary(
    summary
  ) {
    const container =
      byId(
        "adminAvailabilitySummary"
      );

    const days =
      summary.weekly?.days || {};

    const weeklyMarkup =
      WEEKDAY_NAMES.map(
        (name, index) => {
          const row =
            days[String(index)] || {
              status:
                "unavailable",
              start_time: null,
              end_time: null
            };

          let detail =
            availabilityLabel(
              row.status
            );

          if (
            row.status === "custom" &&
            row.start_time &&
            row.end_time
          ) {
            detail =
              `${formatTime(
                row.start_time
              )} to ${formatTime(
                row.end_time
              )}`;
          }

          return `
            <article>
              <strong>
                ${escapeHtml(name)}
              </strong>

              <small>
                ${escapeHtml(detail)}
              </small>
            </article>
          `;
        }
      ).join("");

    const specificMarkup =
      summary.specific.length > 0
        ? summary.specific
            .map((row) => {
              let detail =
                row.is_available
                  ? availabilityLabel(
                      row.time_window
                    )
                  : "Unavailable";

              if (
                row.is_available &&
                row.time_window ===
                  "custom"
              ) {
                detail =
                  `${formatTime(
                    row.start_time
                  )} to ${formatTime(
                    row.end_time
                  )}`;
              }

              return `
                <article>
                  <strong>
                    ${escapeHtml(
                      formatDate(
                        row.exception_date,
                        {
                          month: "long",
                          day: "numeric",
                          year: "numeric"
                        }
                      )
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(detail)}

                    ${
                      row.note
                        ? ` · ${escapeHtml(
                            row.note
                          )}`
                        : ""
                    }
                  </small>
                </article>
              `;
            })
            .join("")
        : `
            <article>
              <small>
                No specific dates saved.
              </small>
            </article>
          `;

    container.classList.remove(
      "empty-state"
    );

    container.innerHTML = `
      <article>
        <strong>
          ${escapeHtml(
            summary.profile
              .display_name
          )}
        </strong>

        <small>
          ${escapeHtml(
            summary.weekly?.note ||
              "No general note"
          )}
        </small>
      </article>

      <div class="subsection">
        <h3>
          Weekly availability
        </h3>

        ${weeklyMarkup}
      </div>

      <div class="subsection">
        <h3>
          Specific dates
        </h3>

        ${specificMarkup}
      </div>
    `;
  }

  /* =======================================================
     REPORTS
     ======================================================= */

  function setReportDefaultDates() {
    const startInput =
      byId("reportStartDate");

    const endInput =
      byId("reportEndDate");

    if (!startInput || !endInput) {
      return;
    }

    if (!startInput.value) {
      const start =
        new Date();

      start.setDate(1);

      startInput.value =
        toLocalDateString(start);
    }

    if (!endInput.value) {
      endInput.value =
        todayString();
    }
  }

  function reportRows() {
    const start =
      byId(
        "reportStartDate"
      ).value;

    const end =
      byId(
        "reportEndDate"
      ).value;

    if (
      start &&
      end &&
      end < start
    ) {
      throw new Error(
        "End date must be on or after the start date."
      );
    }

    return appState.hours
      .filter(
        (row) =>
          (!start ||
            row.entry_date >=
              start) &&
          (!end ||
            row.entry_date <=
              end)
      )
      .sort((a, b) =>
        String(
          a.entry_date
        ).localeCompare(
          String(
            b.entry_date
          )
        )
      );
  }

  function printHoursReport() {
    try {
      const rows = reportRows();

      const printWindow =
        window.open(
          "",
          "_blank",
          "noopener,noreferrer"
        );

      if (!printWindow) {
        throw new Error(
          "The browser blocked the print window."
        );
      }

      const start =
        byId(
          "reportStartDate"
        ).value;

      const end =
        byId(
          "reportEndDate"
        ).value;

      const totalHours =
        rows.reduce(
          (total, row) =>
            total +
            Number(
              row.total_hours || 0
            ),
          0
        );

      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">

          <title>
            Bless This Home Volunteer Hours
          </title>

          <style>
            body {
              margin: 0;
              padding: 32px;
              color: #222;
              font-family: Arial, sans-serif;
            }

            h1 {
              margin-bottom: 6px;
            }

            p {
              margin-top: 0;
            }

            table {
              width: 100%;
              margin-top: 24px;
              border-collapse: collapse;
            }

            th,
            td {
              padding: 9px;
              border: 1px solid #bbb;
              text-align: left;
              vertical-align: top;
            }

            th {
              background: #f1eee7;
            }

            .summary {
              margin-top: 16px;
              font-weight: bold;
            }
          </style>
        </head>

        <body>
          <h1>
            Bless This Home Volunteer Hours
          </h1>

          <p>
            ${escapeHtml(
              start || "All dates"
            )}
            through
            ${escapeHtml(
              end || "present"
            )}
          </p>

          <p class="summary">
            ${rows.length}
            record${
              rows.length === 1
                ? ""
                : "s"
            }
            ·
            ${totalHours.toFixed(2)}
            total hours
          </p>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Volunteer</th>
                <th>Start</th>
                <th>End</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>

            <tbody>
              ${rows
                .map(
                  (row) => `
                    <tr>
                      <td>
                        ${escapeHtml(
                          row.entry_date
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          row.display_name ||
                            getProfileName(
                              row.profile_id
                            )
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          formatTime(
                            row.start_time
                          )
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          formatTime(
                            row.end_time
                          )
                        )}
                      </td>

                      <td>
                        ${Number(
                          row.total_hours ||
                            0
                        ).toFixed(2)}
                      </td>

                      <td>
                        ${escapeHtml(
                          hoursStatusLabel(
                            row.status
                          )
                        )}
                      </td>

                      <td>
                        ${escapeHtml(
                          row.note || ""
                        )}
                      </td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `);

      printWindow.document.close();

      printWindow.focus();

      window.setTimeout(
        () => {
          printWindow.print();
        },
        150
      );
    } catch (error) {
      setFormFeedback(
        "reportsFeedback",
        error.message ||
          "Unable to prepare the report.",
        "error"
      );
    }
  }

  function csvValue(value) {
    return `"${String(
      value ?? ""
    ).replace(/"/g, '""')}"`;
  }

  function downloadHoursCsv() {
    try {
      const rows = reportRows();

      const output = [
        [
          "Date",
          "Volunteer",
          "Start",
          "End",
          "Hours",
          "Status",
          "Note"
        ],
        ...rows.map((row) => [
          row.entry_date,
          row.display_name ||
            getProfileName(
              row.profile_id
            ),
          formatTime(
            row.start_time
          ),
          formatTime(
            row.end_time
          ),
          Number(
            row.total_hours || 0
          ).toFixed(2),
          hoursStatusLabel(
            row.status
          ),
          row.note || ""
        ])
      ]
        .map((row) =>
          row.map(csvValue).join(",")
        )
        .join("\n");

      const blob = new Blob(
        [output],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );

      const url =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;
      link.download =
        "bth-volunteer-hours.csv";

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      URL.revokeObjectURL(url);

      setFormFeedback(
        "reportsFeedback",
        "CSV downloaded.",
        "success"
      );
    } catch (error) {
      setFormFeedback(
        "reportsFeedback",
        error.message ||
          "Unable to download the CSV.",
        "error"
      );
    }
  }

  /* =======================================================
     DIALOGS
     ======================================================= */

  function openDialog(dialogId) {
    const dialog =
      requireElement(dialogId);

    if (dialog.open) {
      return;
    }

    if (
      typeof dialog.showModal ===
      "function"
    ) {
      dialog.showModal();
    } else {
      dialog.setAttribute(
        "open",
        ""
      );
    }

    document.body.classList.add(
      "dialog-open"
    );
  }

  function closeDialog(dialogOrId) {
    const dialog =
      typeof dialogOrId === "string"
        ? byId(dialogOrId)
        : dialogOrId;

    if (!dialog) {
      return;
    }

    if (
      typeof dialog.close ===
        "function" &&
      dialog.open
    ) {
      dialog.close();
    } else {
      dialog.removeAttribute(
        "open"
      );
    }

    if (
      !document.querySelector(
        "dialog[open]"
      )
    ) {
      document.body.classList.remove(
        "dialog-open"
      );
    }
  }

  function closeAllDialogs() {
    document
      .querySelectorAll(
        "dialog[open]"
      )
      .forEach((dialog) => {
        closeDialog(dialog);
      });
  }

  function wireDialogBehavior() {
    document
      .querySelectorAll(
        "[data-close-dialog]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();

            closeDialog(
              button.closest(
                "dialog"
              )
            );
          }
        );
      });

    document
      .querySelectorAll("dialog")
      .forEach((dialog) => {
        dialog.addEventListener(
          "click",
          (event) => {
            if (
              event.target === dialog
            ) {
              closeDialog(dialog);
            }
          }
        );

        dialog.addEventListener(
          "close",
          () => {
            if (
              !document.querySelector(
                "dialog[open]"
              )
            ) {
              document.body.classList.remove(
                "dialog-open"
              );
            }
          }
        );

        dialog.addEventListener(
          "cancel",
          (event) => {
            event.preventDefault();
            closeDialog(dialog);
          }
        );
      });
  }

  /* =======================================================
     EVENT WIRING
     ======================================================= */

  function wireNavigation() {
    document
      .querySelectorAll(
        ".nav-button[data-view]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            switchView(
              button.dataset.view
            );
          }
        );
      });

    document
      .querySelectorAll(
        "[data-open-view]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            switchView(
              button.dataset
                .openView
            );
          }
        );
      });

    requireElement(
      "mobileMenuButton"
    ).addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        toggleMobileMenu();
      }
    );

    requireElement(
      "menuBackdrop"
    ).addEventListener(
      "click",
      closeMobileMenu
    );

    requireElement(
      "sidebar"
    ).addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        if (
          !document.body.classList.contains(
            "menu-open"
          )
        ) {
          return;
        }

        if (
          byId("sidebar").contains(
            event.target
          ) ||
          byId(
            "mobileMenuButton"
          ).contains(event.target)
        ) {
          return;
        }

        closeMobileMenu();
      }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") {
          return;
        }

        closeMobileMenu();
        closeAllDialogs();
      }
    );
  }

  function wireSchedule() {
    byId(
      "previousMonthButton"
    ).addEventListener(
      "click",
      showPreviousMonth
    );

    byId(
      "nextMonthButton"
    ).addEventListener(
      "click",
      showNextMonth
    );

    byId(
      "todayButton"
    ).addEventListener(
      "click",
      showToday
    );

    byId(
      "nextOpenShiftButton"
    ).addEventListener(
      "click",
      showNextOpenShift
    );

    byId(
      "scheduleTypeFilter"
    ).addEventListener(
      "change",
      () => {
        appState.selectedDate =
          null;

        renderSchedule();
      }
    );

  byId(
      "scheduleStaffingFilter"
    ).addEventListener(
      "change",
      () => {
        appState.selectedDate =
          null;

        renderSchedule();
      }
    );

    document
      .querySelectorAll(
        'input[name="shiftRequestType"]'
      )
      .forEach((input) => {
        input.addEventListener(
          "change",
          updatePartialShiftFields
        );
      });

    byId(
      "shiftRequestForm"
    ).addEventListener(
      "submit",
      handleShiftRequestSubmit
    );
  }

  function wireAvailability() {
    document
      .querySelectorAll(
        "[data-weekly-status]"
      )
      .forEach((select) => {
        select.addEventListener(
          "change",
          handleWeeklyStatusChange
        );
      });

    byId(
      "weeklyAvailabilityForm"
    ).addEventListener(
      "submit",
      handleWeeklyAvailabilitySubmit
    );

    byId(
      "specificAvailabilityDate"
    ).min =
      todayString();

    byId(
      "specificAvailabilityTime"
    ).addEventListener(
      "change",
      updateSpecificCustomTimes
    );

    byId(
      "specificAvailabilityStatus"
    ).addEventListener(
      "change",
      updateSpecificStatusFields
    );

    byId(
      "specificAvailabilityForm"
    ).addEventListener(
      "submit",
      handleSpecificAvailabilitySubmit
    );

    updateSpecificStatusFields();
  }

  function wireHours() {
    byId(
      "openHoursDialogButton"
    ).addEventListener(
      "click",
      openHoursDialog
    );

    byId(
      "hoursForm"
    ).addEventListener(
      "submit",
      handleHoursSubmit
    );
  }

  function wireMessages() {
    byId(
      "openMessageDialogButton"
    ).addEventListener(
      "click",
      () =>
        openMessageDialog()
    );

    byId(
      "messageForm"
    ).addEventListener(
      "submit",
      handleMessageSubmit
    );
  }

  function wireProfile() {
    byId(
      "profileForm"
    ).addEventListener(
      "submit",
      handleProfileSubmit
    );

    const updateDisplayName =
      () => {
        byId(
          "profileDisplayName"
        ).value =
          auth.makeDisplayName(
            byId(
              "profileFirstName"
            ).value,
            byId(
              "profileLastName"
            ).value
          );
      };

    byId(
      "profileFirstName"
    ).addEventListener(
      "input",
      updateDisplayName
    );

    byId(
      "profileLastName"
    ).addEventListener(
      "input",
      updateDisplayName
    );
  }

  function wireAdmin() {
    byId(
      "openCreateShiftDialogButton"
    ).addEventListener(
      "click",
      openCreateShiftDialog
    );

    byId(
      "createShiftTimePreset"
    ).addEventListener(
      "change",
      handleShiftTimePresetChange
    );

    byId(
      "createShiftStaffingPreset"
    ).addEventListener(
      "change",
      handleStaffingPresetChange
    );

    byId(
      "createShiftLocationPreset"
    ).addEventListener(
      "change",
      handleLocationPresetChange
    );

    byId(
      "createShiftForm"
    ).addEventListener(
      "submit",
      handleCreateShiftSubmit
    );

byId(
  "manageShiftSearch"
).addEventListener(
  "input",
  renderManageShifts
);

byId(
  "manageShiftTypeFilter"
).addEventListener(
  "change",
  renderManageShifts
);

byId(
  "manageShiftLocationFilter"
).addEventListener(
  "change",
  renderManageShifts
);

    byId(
      "approveShiftRequestButton"
    ).addEventListener(
      "click",
      () =>
        reviewActiveRequest(
          "approved"
        )
    );

    byId(
      "declineShiftRequestButton"
    ).addEventListener(
      "click",
      () =>
        reviewActiveRequest(
          "declined"
        )
    );

    byId(
      "availabilityVolunteerSelect"
    ).addEventListener(
      "change",
      handleAvailabilityVolunteerChange
    );

byId(
  "pendingShiftRequestPersonSelect"
).addEventListener(
  "change",
  renderPendingShiftRequests
);

byId(
  "pendingHoursPersonSelect"
).addEventListener(
  "change",
  renderPendingHours
);

    byId(
      "printHoursReportButton"
    ).addEventListener(
      "click",
      printHoursReport
    );

    byId(
      "downloadHoursCsvButton"
    ).addEventListener(
      "click",
      downloadHoursCsv
    );
  }

  function wireInterface() {
    if (appState.initialized) {
      return;
    }

    wireNavigation();
    wireSchedule();
    wireAvailability();
    wireHours();
    wireMessages();
    wireProfile();
    wireAdmin();
    wireDialogBehavior();

    appState.initialized = true;
  }

  /* =======================================================
     APPLICATION ENTRY
     ======================================================= */

  async function enter() {
    if (appState.entering) {
      return;
    }

    appState.entering = true;

    try {
      wireInterface();

      await dataApi.initializeData();

      applyProfileToInterface();

      appState.calendarMonth =
        startOfMonth(new Date());

      if (!appState.selectedDate) {
        appState.selectedDate =
          todayString();
      }

      await refreshAll();

if (hasAdministrativeAccess()) {
  setReportDefaultDates();
}

      switchView(
        appState.activeView ||
          "dashboard",
        {
          scroll: false
        }
      );
    } catch (error) {
      console.error(
        "Application entry failed:",
        error
      );

      showAppFeedback(
        error.message ||
          "The application could not be loaded.",
        "error"
      );
    } finally {
      appState.entering = false;
    }
  }

  /* =======================================================
     PUBLIC APPLICATION API
     ======================================================= */

  window.BTHApp = Object.freeze({
    enter,
    refresh: refreshAll,
    switchView,
    openDialog,
    closeDialog,
    getState() {
      return {
        ...appState
      };
    }
  });
})();
