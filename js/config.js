/* ============================================
   FBT OUTLET — front-end configuration
   ============================================ */
window.FBT_CONFIG = {
  // InPost Geowidget v5 token. Get one at https://geowidget.inpost.pl/.
  // When set, the checkout shows the InPost parcel-locker map; when empty,
  // it falls back to manual Paczkomat code entry. The token is public
  // (client-side) by design and scoped to the geowidget only.
  inpostGeowidgetToken: '',

  // Klucz mapy punktów odbioru Furgonetki. Przypisany do domeny sklepu,
  // działa po stronie przeglądarki (publiczny z założenia). Obsługuje wybór
  // punktu dla InPost, Poczty/Pocztexu, DPD i Orlen Paczki.
  furgonetkaApiKey: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJGdXJnb25ldGthLnBsIiwiaWF0IjoxNzg5OTkwMzY5Ljc2MTkxOCwic3ViIjoiMmIwNzhhMDItYTU5OC00MjFlLWFjZDUtMjhiOTcyMGUwMWViIn0.pqozltNRex1nNVG6u5_aV2qulhVt7-jGbes5GsjqvtU',
};
