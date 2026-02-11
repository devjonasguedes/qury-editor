export const SESSION_TIMEZONE_ITEMS = Object.freeze([
  { id: "UTC", label: "UTC", offset: 0, gmt: "GMT+00:00" },

  {
    id: "America/Sao_Paulo",
    label: "Brasilia / Sao Paulo",
    offset: -180,
    gmt: "GMT-03:00",
  },
  { id: "America/Manaus", label: "Manaus", offset: -240, gmt: "GMT-04:00" },
  { id: "America/Cuiaba", label: "Cuiaba", offset: -240, gmt: "GMT-04:00" },
  { id: "America/Belem", label: "Belem", offset: -180, gmt: "GMT-03:00" },
  {
    id: "America/Porto_Velho",
    label: "Porto Velho",
    offset: -240,
    gmt: "GMT-04:00",
  },
  {
    id: "America/Rio_Branco",
    label: "Rio Branco",
    offset: -300,
    gmt: "GMT-05:00",
  },
  {
    id: "America/Noronha",
    label: "Fernando de Noronha",
    offset: -120,
    gmt: "GMT-02:00",
  },

  {
    id: "America/New_York",
    label: "New York (ET)",
    offset: -300,
    gmt: "GMT-05:00",
  },
  {
    id: "America/Chicago",
    label: "Chicago (CT)",
    offset: -360,
    gmt: "GMT-06:00",
  },
  {
    id: "America/Denver",
    label: "Denver (MT)",
    offset: -420,
    gmt: "GMT-07:00",
  },
  {
    id: "America/Los_Angeles",
    label: "Los Angeles (PT)",
    offset: -480,
    gmt: "GMT-08:00",
  },
  { id: "America/Phoenix", label: "Phoenix", offset: -420, gmt: "GMT-07:00" },
  { id: "America/Toronto", label: "Toronto", offset: -300, gmt: "GMT-05:00" },
  {
    id: "America/Vancouver",
    label: "Vancouver",
    offset: -480,
    gmt: "GMT-08:00",
  },

  {
    id: "America/Mexico_City",
    label: "Mexico City",
    offset: -360,
    gmt: "GMT-06:00",
  },
  { id: "America/Bogota", label: "Bogota", offset: -300, gmt: "GMT-05:00" },
  { id: "America/Lima", label: "Lima", offset: -300, gmt: "GMT-05:00" },
  { id: "America/Santiago", label: "Santiago", offset: -240, gmt: "GMT-04:00" },
  {
    id: "America/Buenos_Aires",
    label: "Buenos Aires",
    offset: -180,
    gmt: "GMT-03:00",
  },
  {
    id: "America/Montevideo",
    label: "Montevideo",
    offset: -180,
    gmt: "GMT-03:00",
  },
  { id: "America/Asuncion", label: "Asuncion", offset: -240, gmt: "GMT-04:00" },
  { id: "America/Caracas", label: "Caracas", offset: -240, gmt: "GMT-04:00" },

  { id: "Europe/London", label: "London", offset: 0, gmt: "GMT+00:00" },
  { id: "Europe/Dublin", label: "Dublin", offset: 0, gmt: "GMT+00:00" },
  { id: "Europe/Lisbon", label: "Lisbon", offset: 0, gmt: "GMT+00:00" },
  { id: "Europe/Paris", label: "Paris", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Madrid", label: "Madrid", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Berlin", label: "Berlin", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Rome", label: "Rome", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Amsterdam", label: "Amsterdam", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Brussels", label: "Brussels", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Zurich", label: "Zurich", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Vienna", label: "Vienna", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Stockholm", label: "Stockholm", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Warsaw", label: "Warsaw", offset: 60, gmt: "GMT+01:00" },
  { id: "Europe/Athens", label: "Athens", offset: 120, gmt: "GMT+02:00" },
  { id: "Europe/Helsinki", label: "Helsinki", offset: 120, gmt: "GMT+02:00" },
  { id: "Europe/Istanbul", label: "Istanbul", offset: 180, gmt: "GMT+03:00" },
  { id: "Europe/Moscow", label: "Moscow", offset: 180, gmt: "GMT+03:00" },

  {
    id: "Africa/Johannesburg",
    label: "Johannesburg",
    offset: 120,
    gmt: "GMT+02:00",
  },
  { id: "Africa/Cairo", label: "Cairo", offset: 120, gmt: "GMT+02:00" },
  { id: "Africa/Nairobi", label: "Nairobi", offset: 180, gmt: "GMT+03:00" },
  { id: "Africa/Lagos", label: "Lagos", offset: 60, gmt: "GMT+01:00" },
  {
    id: "Africa/Casablanca",
    label: "Casablanca",
    offset: 60,
    gmt: "GMT+01:00",
  },

  { id: "Asia/Dubai", label: "Dubai", offset: 240, gmt: "GMT+04:00" },
  { id: "Asia/Riyadh", label: "Riyadh", offset: 180, gmt: "GMT+03:00" },
  { id: "Asia/Kolkata", label: "Kolkata", offset: 330, gmt: "GMT+05:30" },
  { id: "Asia/Bangkok", label: "Bangkok", offset: 420, gmt: "GMT+07:00" },
  { id: "Asia/Singapore", label: "Singapore", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Hong_Kong", label: "Hong Kong", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Shanghai", label: "Shanghai", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Taipei", label: "Taipei", offset: 480, gmt: "GMT+08:00" },
  { id: "Asia/Seoul", label: "Seoul", offset: 540, gmt: "GMT+09:00" },
  { id: "Asia/Tokyo", label: "Tokyo", offset: 540, gmt: "GMT+09:00" },
  { id: "Asia/Jakarta", label: "Jakarta", offset: 420, gmt: "GMT+07:00" },
  { id: "Asia/Manila", label: "Manila", offset: 480, gmt: "GMT+08:00" },

  { id: "Australia/Sydney", label: "Sydney", offset: 600, gmt: "GMT+10:00" },
  {
    id: "Australia/Melbourne",
    label: "Melbourne",
    offset: 600,
    gmt: "GMT+10:00",
  },
  {
    id: "Australia/Brisbane",
    label: "Brisbane",
    offset: 600,
    gmt: "GMT+10:00",
  },
  { id: "Australia/Perth", label: "Perth", offset: 480, gmt: "GMT+08:00" },
  { id: "Pacific/Auckland", label: "Auckland", offset: 720, gmt: "GMT+12:00" },
]);

export const SESSION_TIMEZONE_VALUES = new Set(
  SESSION_TIMEZONE_ITEMS.map((item) => item.id),
);

export const SESSION_TIMEZONE_ITEM_BY_ID = new Map(
  SESSION_TIMEZONE_ITEMS.map((item) => [item.id, item]),
);
