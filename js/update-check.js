(function () {
  /*
   * PWA su iPhone (Home Screen, standalone): iOS spesso NON ricarica la
   * pagina alla riapertura, riprendendo la WebView già in memoria — anche
   * un force-quit non lo garantisce sempre (segnalato dall'utente: dopo un
   * deploy restava sui file vecchi finché non ricreava l'icona in Home).
   * Confronta la versione di cache-busting (?v=N) del bundle caricato con
   * quella pubblicata sul server e, se diversa, mostra un banner con un
   * bottone di ricarica — niente reload silenzioso, per non perdere
   * eventuali modifiche non salvate a metà.
   */

  var CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minuti
  var checking = false;
  var dismissed = false;
  var banner = null;

  function currentVersion() {
    var script = document.querySelector('script[src*="app.js"]');
    if (!script) {
      return null;
    }
    var match = script.src.match(/[?&]v=(\d+)/);

    return match ? match[1] : null;
  }

  function remoteVersion(html) {
    var match = html.match(/app\.js\?v=(\d+)/);

    return match ? match[1] : null;
  }

  function showBanner() {
    if (banner || dismissed) {
      return;
    }
    banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML =
      '<span class="update-banner-text">Nuova versione disponibile</span>' +
      '<button type="button" class="update-banner-btn">Aggiorna</button>' +
      '<button type="button" class="update-banner-close" aria-label="Ignora">✕</button>';
    document.body.appendChild(banner);

    banner.querySelector('.update-banner-btn').addEventListener('click', function () {
      window.location.reload();
    });
    banner.querySelector('.update-banner-close').addEventListener('click', function () {
      dismissed = true;
      banner.remove();
      banner = null;
    });
  }

  function check() {
    if (checking || dismissed) {
      return;
    }
    var local = currentVersion();
    if (!local) {
      return;
    }
    checking = true;
    fetch('index.html', { cache: 'no-store' })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var remote = remoteVersion(html);
        if (remote && remote !== local) {
          showBanner();
        }
      })
      .catch(function () { /* offline o rete instabile: si ricontrolla al prossimo giro */ })
      .then(function () { checking = false; });
  }

  function init() {
    setTimeout(check, 4000); // dopo il boot, non in mezzo al caricamento iniziale
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        check();
      }
    });
    setInterval(check, CHECK_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
