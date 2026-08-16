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

  // Nome corto in etichetta, nome per esteso per menu/filtri. Un solo posto
  // dove aggiungere una fonte futura: qui + il tag `source` sulle voci.
  var LABELS = {
    'heroes-faerun': { short: 'FR', name: 'Eroi di Faerûn' }
  };

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

  // Fonti opzionali (diverse dal PHB) attualmente attive: usato dai filtri
  // per incantesimi/sottoclassi, così una nuova fonte compare da sola senza
  // toccare grimorio.js.
  function activeOptional() {
    return Object.keys(LABELS).filter(isEnabled).map(function (id) {
      return { id: id, short: LABELS[id].short, name: LABELS[id].name };
    });
  }

  window.AppSources = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    label: function (sourceId) { return (LABELS[sourceId] || {}).name || sourceId; },
    activeOptional: activeOptional
  };
})();
