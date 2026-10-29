/* global document, localStorage, window */
// Sätter ljust/mörkt läge innan sidan ritas första gången, så att ingen vit blixt syns i mörkt läge.
// Ligger som egen fil eftersom innehållspolicyn inte tillåter inbyggda skript. Håll i synk med src/lib/theme.ts.
(function () {
  var pref = 'auto';
  try {
    var saved = localStorage.getItem('renoveringskollen-tema');
    if (saved === 'light' || saved === 'dark') pref = saved;
  } catch {
    // Lagringen kan vara blockerad: då följer vi enheten.
  }
  var dark =
    pref === 'dark' ||
    (pref === 'auto' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#171513' : '#f6f4f0');
})();
