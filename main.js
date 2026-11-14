// Bureaucracy Meme's page: start the runtime, draw the window, hand over.
(async function startBureaucracyMeme() {
  "use strict";
  await window.BureaucracyRuntime.start({ appId: "bureaucracyMeme", window: "bureaucracyMeme" });
  translateWithin(document);
  const app = window.BureaucracyMeme;
  app.attach();
  window.BureaucracyRuntime.lifecycle(app.lifecycle());
  window.BureaucracyRuntime.menu(app.menu);
  window.BureaucracyRuntime.onLanguage(() => app.renderLanguage());
  await app.render();
  window.BureaucracyRuntime.snapshots(document.getElementById("app"));
  window.BureaucracyRuntime.ready();
})();
