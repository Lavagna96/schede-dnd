(function () {
  /* Lancio dadi (menu laterale): schermata a tutto schermo con il d20 in 3D
     (js/dice-3d.js), le carte dei bonus e il verdetto contro la CD. I bonus
     arrivano dalle voci `parts` del motore (js/engine.js), le stesse che
     compongono i totali della scheda: qui non si ricalcola nulla.

     Regole (PHB 2024): 20 e 1 naturali contano solo sui tiri per colpire;
     l'Ispirazione Eroica ritira un dado e il nuovo risultato è obbligatorio;
     con vantaggio/svantaggio si ritira un dado solo. La cronologia resta sul
     dispositivo: tirare non scrive sul cloud, l'unico salvataggio è il
     consumo dell'Ispirazione. */

  var HISTORY_MAX = 30;
  var REVEAL_STEP_MS = 320;
  var CD_MIN = 1;
  var CD_MAX = 35;
  var CD_START = 10;
  var FRAME_W = 340;
  var FRAME_H = 416;
  var FRAME_SCALE_MAX = 1.2;
  var SHEET_CLOSE_DRAG = 80;

  var ICONS = {
    FOR: '<path d="M5 5h10l4 3.5-4 3.5H5z"/><path d="M9 12h3.4v9H9z"/>',
    DES: '<path d="M20.5 3.5C12 3.5 6 9 6 16l-2.5 4.5L8 18c7 0 12.5-6 12.5-14.5z"/>',
    COS: '<path d="M12 21C6 16 3 13 3 9a4.7 4.7 0 0 1 9-2 4.7 4.7 0 0 1 9 2c0 4-3 7-9 12z"/>',
    INT: '<path d="M3 5c3-1 6-1 8 1v14c-2-2-5-2-8-1zM21 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z"/>',
    SAG: '<path d="M2 12c3-5 6.5-7 10-7s7 2 10 7c-3 5-6.5 7-10 7s-7-2-10-7z"/><circle cx="12" cy="12" r="3.2" fill="#1a1320"/>',
    CAR: '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/>',
    prof: '<path d="M12 3 19 6v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/><path d="M8.5 10.5 12 13l3.5-2.5M8.5 14 12 16.5l3.5-2.5" fill="none" stroke="#1a1320" stroke-width="1.4"/>',
    expertise: '<circle cx="12" cy="12" r="8.5"/><path d="M12 6.5l1.6 3.6 3.9.4-2.9 2.6.8 3.9-3.4-2-3.4 2 .8-3.9-2.9-2.6 3.9-.4z" fill="#1a1320"/>',
    aura: '<circle cx="12" cy="12" r="3.4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="url(#dice-g-icon)" stroke-width="1.6" stroke-linecap="round"/>',
    other: '<path d="M12 3l7 6-7 12L5 9z"/><path d="M5 9h14M12 3v18" fill="none" stroke="#1a1320" stroke-width="1"/>',
    sword: '<path d="M18.5 3.5 20.5 5.5 10 16l-2-2z"/><path d="M6.2 12.2 11.8 17.8M7.6 16.4 4.4 19.6" stroke="url(#dice-g-icon)" stroke-width="2" stroke-linecap="round"/>',
    guida: '<path d="M12 2c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7z"/><path d="M18.5 15c.3 2.2 1 2.9 3.2 3.2-2.2.3-2.9 1-3.2 3.2-.3-2.2-1-2.9-3.2-3.2 2.2-.3 2.9-1 3.2-3.2z"/>',
    bless: '<path d="M10.5 8h3v13h-3z"/><path d="M6 11h12v3H6z"/><ellipse cx="12" cy="4.5" rx="6" ry="2" fill="none" stroke="url(#dice-g-icon)" stroke-width="1.5"/>',
    reliable: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.4l2.8 2.8L16 9.6" fill="none" stroke="#1a1320" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  var CARD_SHAPE = '<svg class="dice-card-shape" viewBox="0 0 84 112" preserveAspectRatio="none" aria-hidden="true"><path d="M1 14C18 14 32 10 42 1C52 10 66 14 83 14V104C83 108 80 111 76 111H8C4 111 1 108 1 104Z" fill="url(#dice-g-card)" stroke="#a8842c" stroke-width="1.1" vector-effect="non-scaling-stroke"/></svg>';

  var PICKER_TABS = [
    { id: 'skills', label: 'Abilità' },
    { id: 'abilities', label: 'Caratteristiche' },
    { id: 'saves', label: 'Salvezza' },
    { id: 'attacks', label: 'Attacchi' },
    { id: 'history', label: 'Cronologia' }
  ];

  var OUTCOME_TEXT = {
    crit: 'COLPO CRITICO',
    hit: 'COLPITO',
    miss: 'MANCATO',
    ok: 'SUCCESSO',
    ko: 'FALLIMENTO'
  };

  var rolls = null;       // tiri del personaggio, per scheda del foglio
  var current = null;     // tiro sul palco
  var phase = 'idle';     // idle | rolling | done
  var adv = 0;            // -1 svantaggio, 0 normale, 1 vantaggio
  var cd = null;          // null = CD non dichiarata: solo il totale, nessun verdetto
  var lastCd = null;
  var result = null;      // ultimo tiro sul palco
  var optOn = {};         // bonus facoltativi attivi (Guida, Benedizione…)
  var optCharId = null;
  var pickerTab = 'skills';
  var runToken = 0;       // invalida animazioni e timer di un tiro superato
  var isOpen = false;
  var clearArmed = false;

  function el(id) {
    return document.getElementById(id);
  }

  function fmt(n) {
    return window.AppEngine.formatMod(n);
  }

  /* Numeri casuali senza distorsione: crypto + scarto dei valori in eccesso.
     Math.random non basta: per un tiro di dado il modulo introdurrebbe bias. */
  function rollDie(sides) {
    var buf = new Uint32Array(1);
    var limit = Math.floor(4294967296 / sides) * sides;
    do {
      window.crypto.getRandomValues(buf);
    } while (buf[0] >= limit);

    return buf[0] % sides + 1;
  }

  /* ---------- tiri disponibili ---------- */

  function buildRolls(view, ch) {
    var labels = {};
    view.saves.forEach(function (s) {
      labels[s.key] = s.label;
    });
    var out = {
      labels: labels,
      optionals: {
        guida: { label: 'Guida', die: 4, icon: 'guida' },
        benedizione: { label: 'Benedizione', die: 4, icon: 'bless' },
        armaSacra: { label: 'Arma Sacra', flat: view.sacredWeaponBonus, icon: 'sword' }
      },
      halflingLuck: view.halflingLuck,
      skills: window.AppEngine.SKILLS.map(function (sk) {
        var s = view.skills[sk.id];

        return {
          id: 'skill:' + sk.id, kind: 'check', name: s.label, sub: 'Prova di ' + labels[s.abil],
          abil: s.abil, mark: s.expertise ? 'e' : (s.prof ? 'p' : ''), parts: s.parts,
          opts: ['guida'], reliable: view.reliableTalent && s.prof
        };
      }),
      abilities: [{
        id: 'init', kind: 'check', name: 'Iniziativa', sub: 'Prova di Destrezza',
        abil: 'DES', mark: '', parts: view.initiativeParts, opts: []
      }].concat(view.abilities.map(function (a) {
        return {
          id: 'abil:' + a.key, kind: 'check', name: labels[a.key], sub: 'Prova di caratteristica',
          abil: a.key, mark: '', parts: [{ type: 'ability', key: a.key, value: a.mod }], opts: []
        };
      })),
      saves: view.saves.map(function (s) {
        return {
          id: 'save:' + s.key, kind: 'save', name: labels[s.key], sub: 'Tiro salvezza',
          abil: s.key, mark: s.prof ? 'p' : '', parts: s.parts, opts: ['benedizione']
        };
      }),
      attacks: []
    };

    if (view.weapon.name) {
      out.attacks.push({
        id: 'weapon', kind: 'attack', name: view.weapon.name, sub: 'Tiro per colpire',
        abil: view.weapon.hitParts[0].key, mark: 'p', parts: view.weapon.hitParts,
        opts: view.sacredWeaponBonus > 0 ? ['benedizione', 'armaSacra'] : ['benedizione'],
        critFrom: view.weaponCritFrom
      });
    }
    var isCaster = view.resources.some(function (r) { return /^sl\d$/.test(r.key); });
    if (isCaster) {
      out.attacks.push({
        id: 'spell', kind: 'attack', name: 'Attacco con incantesimo', sub: 'Tiro per colpire',
        abil: view.spellAbility, mark: 'p', parts: view.spellAttackParts, opts: ['benedizione']
      });
    }
    // Attacchi personalizzati della scheda: il bonus è testo libero, si tira
    // solo se contiene un numero.
    (ch.customAttacks || []).forEach(function (atk, i) {
      var hit = parseInt(String(atk.hit || '').replace('−', '-').replace(/[^\d+-]/g, ''), 10);
      if (!atk.name || isNaN(hit)) {
        return;
      }
      out.attacks.push({
        id: 'custom:' + i + ':' + atk.name, kind: 'attack', name: atk.name, sub: 'Tiro per colpire',
        abil: '', mark: '', parts: [{ type: 'other', label: 'Bonus d\'attacco', value: hit }],
        opts: ['benedizione'], critFrom: view.weaponCritFrom
      });
    });

    return out;
  }

  function allRolls() {
    return rolls.skills.concat(rolls.abilities, rolls.saves, rolls.attacks);
  }

  function rollBonus(r) {
    return r.parts.reduce(function (sum, p) { return sum + p.value; }, 0);
  }

  function partCard(p) {
    if (p.type === 'ability') {
      return { label: rolls.labels[p.key], icon: p.key };
    }
    if (p.type === 'prof') {
      return { label: 'Competenza', icon: 'prof' };
    }
    if (p.type === 'expertise') {
      return { label: 'Competenza doppia', icon: 'expertise' };
    }
    if (p.type === 'aura') {
      return { label: 'Aura di Protezione', icon: 'aura' };
    }
    if (p.type === 'subclass') {
      return { label: 'Sottoclasse', icon: 'other' };
    }

    return { label: p.label || 'Oggetti e bonus', icon: 'other' };
  }

  /* ---------- memoria locale (mai sul cloud) ---------- */

  function storageKey(name) {
    return 'dice-' + name + '-' + window.AppStorage.activeCharId();
  }

  function readJson(name, fallback) {
    try {
      var raw = localStorage.getItem(storageKey(name));

      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(name, value) {
    try {
      localStorage.setItem(storageKey(name), JSON.stringify(value));
    } catch (e) { /* memoria piena o bloccata: il tiro resta valido */ }
  }

  // Un ritiro e un cambio di CD aggiornano la stessa riga, non ne creano una nuova.
  function recordHistory() {
    var history = readJson('history', []);
    var entry = {
      t: result.t,
      name: current.name,
      sub: current.sub,
      d20s: result.d20s.slice(),
      nat: keptDie(),
      adv: result.adv,
      total: computeTotal(),
      cd: cd,
      kind: current.kind,
      outcome: computeOutcome(),
      rerolled: result.rerolled
    };
    if (history.length && history[0].t === result.t) {
      history[0] = entry;
    } else {
      history.unshift(entry);
    }
    writeJson('history', history.slice(0, HISTORY_MAX));
  }

  /* ---------- calcolo del risultato ---------- */

  function keptIndex(d20s, a) {
    if (d20s.length < 2) {
      return 0;
    }
    var higher = d20s[1] > d20s[0] ? 1 : 0;

    return a > 0 ? higher : 1 - higher;
  }

  function keptDie() {
    return result.d20s[keptIndex(result.d20s, result.adv)];
  }

  // Talento Affidabile: un d20 di 9 o meno vale 10 nelle prove con competenza.
  function reliableDelta() {
    var nat = keptDie();

    return current.reliable && nat < 10 ? 10 - nat : 0;
  }

  function optValue(id) {
    var def = rolls.optionals[id];
    if (def.flat != null) {
      return def.flat;
    }

    return result && result.optRolls[id] != null ? result.optRolls[id] : null;
  }

  function computeTotal() {
    var total = keptDie() + rollBonus(current) + reliableDelta();
    current.opts.forEach(function (id) {
      if (optOn[id]) {
        total += optValue(id) || 0;
      }
    });

    return total;
  }

  /* 20 e 1 naturali decidono solo sui tiri per colpire. Senza CD dichiarata
     una prova non ha verdetto: resta il totale da dire al DM. */
  function computeOutcome() {
    var nat = keptDie();
    if (current.kind === 'attack') {
      if (nat >= (current.critFrom || 20)) {
        return 'crit';
      }
      if (nat === 1) {
        return 'miss';
      }
      if (cd == null) {
        return null;
      }

      return computeTotal() >= cd ? 'hit' : 'miss';
    }
    if (cd == null) {
      return null;
    }

    return computeTotal() >= cd ? 'ok' : 'ko';
  }

  /* ---------- palco ---------- */

  function renderCd() {
    el('dice-cd-num').textContent = cd == null ? '—' : cd;
    el('dice-cd-num').setAttribute('aria-label', cd == null ? 'CD non impostata' : 'CD ' + cd);
  }

  function setCd(value) {
    cd = value;
    if (value != null) {
      lastCd = value;
    }
    renderCd();
    if (phase === 'done') {
      showVerdict();
      recordHistory();
    }
  }

  function buildCard(cfg) {
    var card = document.createElement('div');
    card.className = 'dice-card' + (cfg.extraClass ? ' ' + cfg.extraClass : '');
    card.innerHTML = CARD_SHAPE +
      '<span class="dice-card-val"></span>' +
      '<svg class="dice-card-ic" viewBox="0 0 24 24" fill="url(#dice-g-icon)" aria-hidden="true">' + ICONS[cfg.icon] + '</svg>' +
      '<span class="dice-card-lbl"></span>';
    card.querySelector('.dice-card-val').textContent = cfg.value;
    card.querySelector('.dice-card-lbl').textContent = cfg.label;

    return card;
  }

  function optText(id) {
    var def = rolls.optionals[id];
    if (def.flat != null) {
      return fmt(def.flat);
    }
    var v = optValue(id);

    return v != null ? '+' + v : '+1d' + def.die;
  }

  function renderCards() {
    var host = el('dice-cards');
    host.innerHTML = '';
    current.parts.forEach(function (p) {
      var info = partCard(p);
      var card = buildCard({ value: fmt(p.value), label: info.label, icon: info.icon, extraClass: 'fixed' });
      host.appendChild(card);
    });
    if (result && phase === 'done' && reliableDelta() > 0) {
      host.appendChild(buildCard({ value: '+' + reliableDelta(), label: 'Talento Affidabile', icon: 'reliable' }));
    }
    current.opts.forEach(function (id, i) {
      var def = rolls.optionals[id];
      var card = buildCard({
        value: optText(id), label: def.label, icon: def.icon,
        extraClass: 'opt' + (i === 0 ? ' opt-first' : '') + (optOn[id] ? '' : ' off')
      });
      card.setAttribute('data-opt', id);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', optOn[id] ? 'true' : 'false');
      card.setAttribute('aria-label', def.label + (optOn[id] ? ', attivo' : ', non attivo'));
      var toggle = document.createElement('span');
      toggle.className = 'dice-card-toggle';
      toggle.setAttribute('aria-hidden', 'true');
      toggle.textContent = optOn[id] ? '−' : '+';
      card.appendChild(toggle);
      host.appendChild(card);
    });
    host.classList.toggle('many', host.children.length >= 5);
  }

  // Un bonus facoltativo acceso a tiro fatto (Guida dimenticata) si tira e si
  // somma subito, senza rifare il d20.
  function toggleOpt(id) {
    if (phase === 'rolling') {
      return;
    }
    optOn[id] = !optOn[id];
    var def = rolls.optionals[id];
    if (optOn[id] && result && def.die && result.optRolls[id] == null) {
      result.optRolls[id] = rollDie(def.die);
    }
    renderCards();
    if (phase === 'done') {
      showVerdict();
      recordHistory();
    }
  }

  function renderAdv() {
    [].forEach.call(el('dice-adv').children, function (b) {
      var on = parseInt(b.getAttribute('data-adv'), 10) === adv;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function clearOutcome() {
    el('dice-verdict').className = 'dice-verdict';
    el('dice-total').classList.remove('show');
    el('dice-actions').classList.remove('show');
    el('dice-status').textContent = '';
  }

  function resetStage() {
    runToken++;
    phase = 'idle';
    result = null;
    clearOutcome();
    el('dice-hint').classList.remove('off');
    renderCards();
    window.AppDice3D.setIdle(adv ? 2 : 1);
  }

  function setRoll(roll) {
    current = roll;
    adv = 0;
    cd = null;
    writeJson('last', roll.id);
    el('dice-name').textContent = roll.name;
    el('dice-sub').textContent = roll.sub;
    el('dice-cd-label').innerHTML = roll.kind === 'attack' ? 'CLASSE<br>ARMATURA' : 'CLASSE<br>DIFFICOLTÀ';
    renderCd();
    renderAdv();
    resetStage();
  }

  function hasInspiration() {
    return !!window.AppStorage.getState().inspiration;
  }

  /* ---------- il tiro ---------- */

  function throwNew() {
    if (phase === 'rolling') {
      return;
    }
    var token = ++runToken;
    phase = 'rolling';
    clearOutcome();
    el('dice-hint').classList.add('off');
    var d20s = [rollDie(20)];
    if (adv) {
      d20s.push(rollDie(20));
    }
    result = { t: Date.now(), d20s: d20s, adv: adv, optRolls: {}, luckUsed: false, rerolled: false };
    current.opts.forEach(function (id) {
      var def = rolls.optionals[id];
      if (optOn[id] && def.die) {
        result.optRolls[id] = rollDie(def.die);
      }
    });
    renderCardsDuringRoll();
    window.AppDice3D.throwDice(d20s, keptIndex(d20s, adv), function () {
      if (token === runToken) {
        reveal(token);
      }
    });
  }

  // Durante il volo i dadi facoltativi non mostrano ancora il loro valore.
  function renderCardsDuringRoll() {
    renderCards();
    current.opts.forEach(function (id) {
      var def = rolls.optionals[id];
      var card = el('dice-cards').querySelector('[data-opt="' + id + '"] .dice-card-val');
      if (card && def.die) {
        card.textContent = '+1d' + def.die;
      }
    });
  }

  /* Si ritira sempre il dado più basso: con vantaggio è l'unico che può
     migliorare, con svantaggio è quello che conta. Il nuovo risultato è
     obbligatorio; i dadi facoltativi già tirati restano. */
  function reroll(source) {
    if (phase !== 'done') {
      return;
    }
    if (source === 'inspiration') {
      var state = window.AppStorage.getState();
      if (!state.inspiration) {
        return;
      }
      state.inspiration = false;
      window.AppStorage.saveState(state, true);
      if (window.AppInspiration) {
        window.AppInspiration.render();
      }
    } else {
      result.luckUsed = true;
    }
    var token = ++runToken;
    phase = 'rolling';
    clearOutcome();
    var low = result.d20s.length > 1 && result.d20s[1] < result.d20s[0] ? 1 : 0;
    result.d20s[low] = rollDie(20);
    result.rerolled = true;
    renderCardsDuringRoll();
    window.AppDice3D.throwDice(result.d20s, keptIndex(result.d20s, result.adv), function () {
      if (token === runToken) {
        reveal(token);
      }
    }, low);
  }

  /* Le carte si accendono una alla volta e il totale cresce con loro. */
  function reveal(token) {
    var running = keptDie();
    var totalEl = el('dice-total-n');
    var steps = [];
    var fixed = el('dice-cards').querySelectorAll('.dice-card.fixed');
    current.parts.forEach(function (p, i) {
      steps.push({ card: fixed[i], add: p.value });
    });
    var delta = reliableDelta();
    if (delta > 0) {
      var relCard = buildCard({ value: '+' + delta, label: 'Talento Affidabile', icon: 'reliable' });
      var firstOpt = el('dice-cards').querySelector('.dice-card.opt');
      el('dice-cards').insertBefore(relCard, firstOpt);
      el('dice-cards').classList.toggle('many', el('dice-cards').children.length >= 5);
      steps.push({ card: relCard, add: delta });
    }
    current.opts.forEach(function (id) {
      if (optOn[id]) {
        steps.push({
          card: el('dice-cards').querySelector('[data-opt="' + id + '"]'),
          add: optValue(id) || 0,
          text: optText(id)
        });
      }
    });
    totalEl.textContent = running;
    el('dice-total').classList.add('show');

    var stepMs = window.AppDice3D.isReducedMotion() ? 0 : REVEAL_STEP_MS;
    var i = 0;
    (function next() {
      if (token !== runToken) {
        return;
      }
      if (i >= steps.length) {
        setTimeout(function () {
          if (token === runToken) {
            finish();
          }
        }, stepMs ? 200 : 0);

        return;
      }
      var step = steps[i++];
      step.card.classList.add('lit');
      if (step.text) {
        step.card.querySelector('.dice-card-val').textContent = step.text;
      }
      running += step.add;
      totalEl.textContent = running;
      setTimeout(next, stepMs);
    })();
  }

  function finish() {
    phase = 'done';
    el('dice-cards').querySelectorAll('.dice-card').forEach(function (c) {
      c.classList.remove('lit');
    });
    showVerdict();
    recordHistory();
  }

  function showVerdict() {
    var outcome = computeOutcome();
    var total = computeTotal();
    var banner = el('dice-verdict');
    el('dice-total-n').textContent = total;
    el('dice-total').classList.add('show');
    if (outcome) {
      el('dice-verdict-text').textContent = OUTCOME_TEXT[outcome];
      banner.className = 'dice-verdict show ' + outcome;
    } else {
      banner.className = 'dice-verdict';
    }
    el('dice-status').textContent = 'Totale ' + total + (outcome ? ', ' + OUTCOME_TEXT[outcome].toLowerCase() : '');

    // Un ritiro si propone quando può servire: fallimento, o CD non ancora nota.
    var canImprove = outcome === 'ko' || outcome === 'miss' || outcome === null;
    var luck = rolls.halflingLuck && !result.luckUsed && Math.min.apply(null, result.d20s) === 1;
    var insp = canImprove && hasInspiration();
    el('dice-act-luck').classList.toggle('hidden', !luck);
    el('dice-act-insp').classList.toggle('hidden', !insp);
    el('dice-act-insp').textContent = luck ? '★ Ispirazione' : '★ Ritira con Ispirazione';
    el('dice-actions').classList.add('show');
  }

  /* ---------- foglio di scelta del tiro ---------- */

  function buildRow(roll) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'dice-row dice-btn' + (current && current.id === roll.id ? ' current' : '');
    var dot = document.createElement('span');
    dot.className = 'dice-row-dot ' + roll.mark;
    var name = document.createElement('span');
    name.className = 'dice-row-name';
    name.textContent = roll.name;
    var abil = document.createElement('span');
    abil.className = 'dice-row-abil';
    abil.textContent = roll.abil;
    var bonus = document.createElement('span');
    bonus.className = 'dice-row-bonus';
    bonus.textContent = fmt(rollBonus(roll));
    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(abil);
    row.appendChild(bonus);
    row.addEventListener('click', function () {
      setRoll(roll);
      closeSheet();
    });

    return row;
  }

  function historyTime(ts) {
    var d = new Date(ts);
    var now = new Date();
    var time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) {
      return time;
    }

    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + time;
  }

  function historyDetail(h) {
    var dice = h.d20s.length > 1
      ? h.d20s.join(' e ') + (h.adv > 0 ? ' con vantaggio' : ' con svantaggio')
      : String(h.d20s[0]);
    var parts = ['d20: ' + dice];
    if (h.cd != null) {
      parts.push((h.kind === 'attack' ? 'CA ' : 'CD ') + h.cd);
    }
    if (h.rerolled) {
      parts.push('ritirato');
    }

    return parts.join(' · ');
  }

  function buildHistory(list) {
    var history = readJson('history', []);
    if (!history.length) {
      var empty = document.createElement('p');
      empty.className = 'dice-history-empty';
      empty.textContent = 'Ancora nessun tiro con questo personaggio.';
      list.appendChild(empty);

      return;
    }
    history.forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'dice-history-row ' + (h.outcome || '');
      var main = document.createElement('div');
      main.className = 'dice-history-main';
      var name = document.createElement('span');
      name.className = 'dice-history-name';
      name.textContent = h.name + ' · ' + h.sub;
      var detail = document.createElement('span');
      detail.className = 'dice-history-detail';
      detail.textContent = historyTime(h.t) + ' · ' + historyDetail(h);
      main.appendChild(name);
      main.appendChild(detail);
      var side = document.createElement('div');
      side.className = 'dice-history-side';
      var total = document.createElement('span');
      total.className = 'dice-history-total';
      total.textContent = h.total;
      side.appendChild(total);
      if (h.outcome) {
        var outcome = document.createElement('span');
        outcome.className = 'dice-history-outcome';
        outcome.textContent = OUTCOME_TEXT[h.outcome];
        side.appendChild(outcome);
      }
      row.appendChild(main);
      row.appendChild(side);
      list.appendChild(row);
    });
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'dice-history-clear dice-btn';
    clear.textContent = clearArmed ? 'Tocca ancora per confermare' : 'Svuota la cronologia';
    clear.addEventListener('click', function () {
      if (!clearArmed) {
        clearArmed = true;
      } else {
        clearArmed = false;
        writeJson('history', []);
      }
      renderPicker();
    });
    list.appendChild(clear);
  }

  function renderPicker() {
    var tabs = el('dice-picker-tabs');
    tabs.innerHTML = '';
    PICKER_TABS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dice-tab dice-btn' + (t.id === pickerTab ? ' on' : '');
      b.textContent = t.label;
      b.addEventListener('click', function () {
        pickerTab = t.id;
        clearArmed = false;
        renderPicker();
      });
      tabs.appendChild(b);
    });
    var list = el('dice-picker-list');
    list.innerHTML = '';
    list.scrollTop = 0;
    if (pickerTab === 'history') {
      buildHistory(list);

      return;
    }
    if (!rolls[pickerTab].length) {
      var empty = document.createElement('p');
      empty.className = 'dice-history-empty';
      empty.textContent = 'Nessun attacco disponibile: equipaggia un\'arma dalla scheda.';
      list.appendChild(empty);

      return;
    }
    rolls[pickerTab].forEach(function (r) {
      list.appendChild(buildRow(r));
    });
  }

  function openSheet() {
    renderPicker();
    el('dice-view').classList.add('sheet-open');
  }

  function closeSheet() {
    el('dice-view').classList.remove('sheet-open');
    el('dice-sheet').style.transform = '';
  }

  // Il foglio si richiude trascinandolo giù dalla maniglia.
  function bindSheetDrag() {
    var sheet = el('dice-sheet');
    var grab = el('dice-sheet-grab');
    var startY = 0;
    var dy = 0;
    grab.addEventListener('touchstart', function (e) {
      startY = e.touches[0].clientY;
      dy = 0;
      sheet.style.transition = 'none';
    }, { passive: true });
    grab.addEventListener('touchmove', function (e) {
      dy = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    grab.addEventListener('touchend', function () {
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > SHEET_CLOSE_DRAG) {
        closeSheet();
      }
    });
  }

  /* ---------- apertura e chiusura ---------- */

  // La cornice ha misure fisse e si scala tutta insieme sullo spazio libero,
  // dall'iPhone più piccolo ai modelli Max.
  function fitFrame() {
    var host = el('dice-frame-host');
    var scale = Math.min(host.clientWidth / FRAME_W, host.clientHeight / FRAME_H, FRAME_SCALE_MAX);
    if (scale > 0) {
      el('dice-view').style.setProperty('--dice-scale', scale.toFixed(4));
      window.AppDice3D.redraw();
    }
  }

  function applyPortrait(ch) {
    var src = ch.portrait ? (ch.portraitFull || ch.portrait) : '';
    el('dice-bg').style.backgroundImage = src ? 'url("' + String(src).replace(/"/g, '%22') + '")' : '';
  }

  function open() {
    var state = window.AppStorage.getState();
    var ch = state.character;
    var charId = window.AppStorage.activeCharId();
    if (charId !== optCharId) {
      optOn = {};
      optCharId = charId;
    }
    rolls = buildRolls(window.AppEngine.getView(), ch);
    applyPortrait(ch);
    el('dice-view').classList.add('open');
    el('dice-view').setAttribute('aria-hidden', 'false');
    isOpen = true;
    fitFrame();
    window.AppDice3D.init(el('dice-canvas'));
    window.AppDice3D.start();

    var lastId = readJson('last', null);
    var last = allRolls().filter(function (r) { return r.id === lastId; })[0];
    pickerTab = 'skills';
    setRoll(last || rolls.abilities[0]);
    // Prima volta con questo personaggio: si parte dalla scelta del tiro.
    if (!last) {
      openSheet();
    }
  }

  function close() {
    runToken++;
    phase = 'idle';
    isOpen = false;
    closeSheet();
    window.AppDice3D.stop();
    el('dice-view').classList.remove('open');
    el('dice-view').setAttribute('aria-hidden', 'true');
  }

  function init() {
    var view = el('dice-view');
    if (!view) {
      return;
    }
    el('dice-back').addEventListener('click', close);
    el('dice-title').addEventListener('click', function () {
      if (phase !== 'rolling') {
        openSheet();
      }
    });
    el('dice-canvas').addEventListener('click', throwNew);
    el('dice-canvas').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        throwNew();
      }
    });
    el('dice-act-again').addEventListener('click', throwNew);
    el('dice-act-insp').addEventListener('click', function () { reroll('inspiration'); });
    el('dice-act-luck').addEventListener('click', function () { reroll('luck'); });
    el('dice-sheet-overlay').addEventListener('click', closeSheet);
    bindSheetDrag();

    el('dice-cd-up').addEventListener('click', function () {
      setCd(cd == null ? (lastCd || CD_START) : Math.min(CD_MAX, cd + 1));
    });
    el('dice-cd-down').addEventListener('click', function () {
      setCd(cd == null ? (lastCd || CD_START) : Math.max(CD_MIN, cd - 1));
    });
    // Toccare il numero toglie la CD (il DM non l'ha dichiarata) o la rimette.
    el('dice-cd-num').addEventListener('click', function () {
      setCd(cd == null ? (lastCd || CD_START) : null);
    });

    el('dice-adv').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-adv]');
      if (!btn || phase === 'rolling') {
        return;
      }
      adv = parseInt(btn.getAttribute('data-adv'), 10);
      renderAdv();
      resetStage();
    });
    el('dice-cards').addEventListener('click', function (e) {
      var card = e.target.closest('[data-opt]');
      if (card) {
        toggleOpt(card.getAttribute('data-opt'));
      }
    });
    el('dice-cards').addEventListener('keydown', function (e) {
      var card = e.target.closest('[data-opt]');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleOpt(card.getAttribute('data-opt'));
      }
    });

    window.addEventListener('resize', function () {
      if (isOpen) {
        fitFrame();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isOpen) {
        return;
      }
      if (view.classList.contains('sheet-open')) {
        closeSheet();
      } else {
        close();
      }
    });
  }

  window.AppDice = {
    init: init,
    open: open,
    close: close,
    rollDie: rollDie,
    buildRolls: buildRolls
  };
})();
