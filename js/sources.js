(function () {
  /*
   * Fonti opzionali del manuale (es. "Heroes of Faerûn"), disattivabili
   * dall'utente: il PHB 2024 resta la fonte di default e non passa mai da
   * qui (le voci senza `source` sono sempre incluse). Ogni fonte è un
   * semplice interruttore in localStorage, chiave per chiave.
   *
   * Nessuno stato di default scritto: se la chiave non c'è, la fonte è
   * considerata disattivata (stesso comportamento di prima che esistesse
   * questa funzionalità).
   */

  var LS_PREFIX = 'app-source-';

  function isEnabled(sourceId) {
    return localStorage.getItem(LS_PREFIX + sourceId) === '1';
  }

  function setEnabled(sourceId, value) {
    if (value) {
      localStorage.setItem(LS_PREFIX + sourceId, '1');
    } else {
      localStorage.removeItem(LS_PREFIX + sourceId);
    }
  }

  window.AppSources = {
    isEnabled: isEnabled,
    setEnabled: setEnabled
  };
})();
