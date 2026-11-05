(function () {
  /* Indebolimento: controllo nella card Punti Ferita. Il livello vive in
     character.exhaustion, quindi segue il personaggio anche sul cloud; malus e
     velocità li calcola engine.js. A zero resta solo una riga discreta. */

  var MAX_LEVEL = 6;
  var DEATH_LEVEL = 6;
  var D20_PER_LEVEL = 2;
  var SPEED_M_PER_LEVEL = 1.5;

  function el(id) {
    return document.getElementById(id);
  }

  function effectText(level) {
    if (level >= DEATH_LEVEL) {
      return 'Al livello ' + DEATH_LEVEL + ' il personaggio muore';
    }

    return '−' + D20_PER_LEVEL * level + ' a tutti i tiri d20 · −' +
      (SPEED_M_PER_LEVEL * level).toLocaleString('it-IT') + ' m di velocità';
  }

  function render() {
    if (!el('exh-box')) {
      return;
    }
    var level = window.AppEngine.getView().exhaustion;
    var active = level > 0;
    el('exh-add').classList.toggle('hidden', active);
    el('exh-box').classList.toggle('hidden', !active);
    el('exh-level').textContent = level;
    el('exh-effect').textContent = active ? effectText(level) : '';
    el('exh-effect').classList.toggle('death', level >= DEATH_LEVEL);
    el('exh-up').disabled = level >= MAX_LEVEL;
    // I numeri ridotti dal malus si colorano da CSS (components/combat.css).
    el('main-content').classList.toggle('has-exhaustion', active);
  }

  // Tutto ciò che mostra un tiro di d20 o la velocità.
  function refreshSheet() {
    ['AppStats', 'AppSheet', 'AppGrimorio'].forEach(function (name) {
      if (window[name] && window[name].render) {
        window[name].render();
      }
    });
  }

  function setLevel(next) {
    var state = window.AppStorage.getState();
    state.character.exhaustion = Math.max(0, Math.min(MAX_LEVEL, next));
    window.AppStorage.saveState(state, true);
    refreshSheet();
  }

  function change(delta) {
    setLevel(window.AppEngine.getView().exhaustion + delta);
  }

  /* Riposo: chiamata prima del salvataggio. 'long' toglie sempre un livello,
     'short' solo a chi ne ha il privilegio. Dice se il livello è cambiato. */
  function applyRest(state, kind) {
    var view = window.AppEngine.getView();
    if (!view.exhaustion || (kind === 'short' && !view.exhaustionFallsOnShortRest)) {
      return false;
    }
    state.character.exhaustion = view.exhaustion - 1;

    return true;
  }

  function init() {
    el('exh-add').addEventListener('click', function () { change(1); });
    el('exh-up').addEventListener('click', function () { change(1); });
    el('exh-down').addEventListener('click', function () { change(-1); });
    render();
  }

  window.AppExhaustion = {
    init: init,
    render: render,
    applyRest: applyRest,
    refreshSheet: refreshSheet
  };
})();
