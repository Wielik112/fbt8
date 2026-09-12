/* ============================================
   FBT OUTLET — front-end configuration
   ============================================ */
window.FBT_CONFIG = {
  // InPost Geowidget v5 token. Get one at https://geowidget.inpost.pl/.
  // When set, the checkout shows the InPost parcel-locker map; when empty,
  // it falls back to manual Paczkomat code entry. The token is public
  // (client-side) by design and scoped to the geowidget only.
  inpostGeowidgetToken: '',

  // --- Orlen Paczka (embedded point map) ---------------------------------
  // Orlen Paczka's map is served by the official Bliska Paczka / Alsendo
  // widget (global `BPWidget`). It is multi-carrier; here we scope it to
  // ORLEN Paczka (operator code "RUCH"). Two keys are needed, both handed to
  // you during onboarding:
  //   • googleMapsApiKey  – REQUIRED by the widget to render the map
  //                         (Google Cloud → enable "Maps JavaScript API").
  //   • orlenWidgetToken  – map/API key from integracje@orlenpaczka.pl
  //                         (send your PartnerID + shop URL). Leave empty if
  //                         your widget plan does not require it.
  // When googleMapsApiKey is empty (or the widget fails to load), checkout
  // falls back to opening the official Orlen point map in a new tab plus
  // manual code entry — so it is always safe to ship with these empty.
  googleMapsApiKey: '',
  orlenWidgetToken: '',
  // Widget assets. Orlen/Alsendo give you the exact URLs on onboarding; bump
  // the version here if they ship a newer one. Defaults target the current
  // public build.
  orlenWidgetJs: 'https://map.alsendo.com/v8.2/bundle.js',
  orlenWidgetCss: 'https://map.alsendo.com/v8.2/styles.css',
};
