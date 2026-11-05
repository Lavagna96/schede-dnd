(function () {
  /* Tiro libero del Lancio dadi: quali dadi tirare, quanti e con quale bonus
     (es. 8d6 per una Palla di Fuoco). Qui stanno la scelta, i recenti e il
     conteggio; palco, gesto e fasi del tiro restano in js/dice.js, che passa
     da `host` ciò che serve. La scelta resta sul dispositivo, mai sul cloud.

     Da qui passano anche i danni di attacchi e incantesimi: stessi dadi, ma con
     una scelta temporanea che non tocca né quella salvata né i recenti. */

  var TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
  var SIDES = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
  var MAX_DICE = 40;
  var BONUS_MIN = -30;
  var BONUS_MAX = 30;
  var RECENTS_MAX = 6;
  var D100_TENS_FACE = 10; // la faccia "00" del dado delle decine

  var SHAPES = {
    d4: '<path class="s" d="M12 2.5 22 21H2z"/>',
    d6: '<rect class="s" x="3.5" y="3.5" width="17" height="17" rx="2"/>',
    d8: '<path class="s" d="M12 1.5 22 12 12 22.5 2 12z"/><path class="l" d="M2 12h20"/>',
    d10: '<path class="s" d="M12 1.5 22 10.5 12 22.5 2 10.5z"/><path class="l" d="M2 10.5 12 14l10-3.5M12 14v8.5"/>',
    d12: '<path class="s" d="M12 1.5 22.3 9 18.4 21.2H5.600L1.700 9z"/><path class="l" d="M12 6.5 17 10.200 15.100 16H8.900L7 10.200z"/>',
    d20: '<path class="s" d="M12 1.500 21.500 7v10L12 22.500 2.500 17V7z"/><path class="l" d="M12 6.500 17 16H7zM2.500 7 12 6.500 21.500 7M2.500 17 7 16M21.500 17 17 16M12 1.500v5M12 22.500 7 16M12 22.500 17 16"/>',
    d100: '<path class="s" d="M8 3 15 9.500 8 19 1 9.500z"/><path class="s" d="M16 5 23 11.500 16 21 9 11.500z"/>'
  };

  var host = null;
  var counts = {};
  var bonus = 0;
  var recents = [];
  var temporary = false;

  /* Parole dopo i dadi nel testo di un incantesimo. */
  var DAMAGE_WORD = /\b(fuoco|freddo|acido|tuono|fulmine|forza|necrotici|necrotico|radiosi|radioso|psichici|psichico|veleno|contundenti|perforanti|taglienti|danni)\b/;
  var HEAL_WORD = /recuper|\bcura\b/;
  var CANTRIP_TIERS = [5, 11, 17];
  var MAX_SLOT_LEVEL = 9;

  function el(id) {
    return document.getElementById(id);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function emptyCounts() {
    var out = {};
    TYPES.forEach(function (t) {
      out[t] = 0;
    });

    return out;
  }

  function diceIn(c) {
    return TYPES.reduce(function (sum, t) {
      return sum + (c[t] || 0) * (t === 'd100' ? 2 : 1);
    }, 0);
  }

  // Dalla memoria del dispositivo può arrivare di tutto: si tiene solo ciò che ha senso.
  function cleanCounts(raw) {
    var out = emptyCounts();
    TYPES.forEach(function (t) {
      var n = parseInt(raw && raw[t], 10);
      out[t] = n > 0 ? Math.min(n, MAX_DICE) : 0;
    });

    return diceIn(out) > MAX_DICE ? emptyCounts() : out;
  }

  function cleanBonus(raw) {
    return clamp(parseInt(raw, 10) || 0, BONUS_MIN, BONUS_MAX);
  }

  function save() {
    if (temporary) {
      return;
    }
    host.writeJson('free', { counts: counts, bonus: bonus, recents: recents });
  }

  function load() {
    temporary = false;
    var saved = host.readJson('free', null) || {};
    counts = cleanCounts(saved.counts);
    bonus = cleanBonus(saved.bonus);
    recents = (Array.isArray(saved.recents) ? saved.recents : [])
      .map(function (r) {
        return { counts: cleanCounts(r && r.counts), bonus: cleanBonus(r && r.bonus) };
      })
      .filter(function (r) { return diceIn(r.counts) > 0; })
      .slice(0, RECENTS_MAX);
  }

  function formulaOf(c, b) {
    var text = TYPES.filter(function (t) { return c[t]; }).map(function (t) {
      return c[t] + t;
    }).join(' + ');
    if (b) {
      text += (b > 0 ? ' + ' : ' − ') + Math.abs(b);
    }

    return text;
  }

  function formula() {
    return formulaOf(counts, bonus) || 'Scegli i dadi';
  }

  function isEmpty() {
    return diceIn(counts) === 0;
  }

  // Il d100 sono due dadi veri: decine e unità.
  function specs() {
    var out = [];
    TYPES.forEach(function (t) {
      for (var i = 0; i < counts[t]; i++) {
        if (t === 'd100') {
          out.push({ kind: 'd100t' }, { kind: 'd100u' });
        } else {
          out.push({ kind: t });
        }
      }
    });

    return out;
  }

  function roll() {
    var values = [];
    var groups = [];
    var total = bonus;
    TYPES.forEach(function (t) {
      if (!counts[t]) {
        return;
      }
      var results = [];
      for (var i = 0; i < counts[t]; i++) {
        var value;
        if (t === 'd100') {
          var tens = host.rollDie(D100_TENS_FACE);
          var units = host.rollDie(D100_TENS_FACE);
          values.push({ kind: 'd100t', num: tens }, { kind: 'd100u', num: units });
          // 00 + 0 vale 100.
          value = (tens % D100_TENS_FACE) * D100_TENS_FACE + (units % D100_TENS_FACE) || 100;
        } else {
          value = host.rollDie(SIDES[t]);
          values.push({ kind: t, num: value });
        }
        results.push(value);
        total += value;
      }
      groups.push({ label: counts[t] + t, results: results });
    });

    return { values: values, groups: groups, bonus: bonus, total: total };
  }

  function detailText(r) {
    var parts = r.groups.map(function (g) {
      return g.label + ': ' + g.results.join(' · ');
    });
    if (r.bonus) {
      parts.push('bonus ' + window.AppEngine.formatMod(r.bonus));
    }

    return parts.join(' | ');
  }

  // Dopo un tiro riuscito la combinazione va in cima ai recenti, senza doppioni.
  function remember() {
    if (temporary) {
      return;
    }
    var key = formulaOf(counts, bonus);
    recents = recents.filter(function (r) { return formulaOf(r.counts, r.bonus) !== key; });
    recents.unshift({ counts: Object.assign({}, counts), bonus: bonus });
    recents = recents.slice(0, RECENTS_MAX);
    save();
  }

  function applyRecent(index) {
    var r = recents[index];
    counts = Object.assign({}, r.counts);
    bonus = r.bonus;
    save();
  }

  function clearAll() {
    counts = emptyCounts();
    bonus = 0;
    save();
  }

  function changeCount(t, delta) {
    var next = Object.assign({}, counts);
    next[t] = Math.max(0, next[t] + delta);
    if (diceIn(next) > MAX_DICE) {
      return false;
    }
    counts = next;
    save();

    return true;
  }

  function changeBonus(delta) {
    bonus = clamp(bonus + delta, BONUS_MIN, BONUS_MAX);
    save();
  }

  /* ---------- danni: dai testi della scheda e del manuale ai dadi ---------- */

  function useTemporary(cfg) {
    temporary = true;
    counts = cleanCounts(cfg.counts);
    bonus = cleanBonus(cfg.bonus);
  }

  function typeOfSides(sides) {
    var t = 'd' + sides;

    return TYPES.indexOf(t) !== -1 ? t : null;
  }

  /* "1d8+6 tagl." → { counts, bonus, type }. Null se non ci sono dadi che
     sappiamo tirare: gli attacchi sono testo libero. */
  function parseDamage(text) {
    var source = String(text || '').replace(/−/g, '-');
    var parsed = emptyCounts();
    var found = false;
    var valid = true;
    var rest = source.replace(/(\d+)\s*d\s*(\d+)/gi, function (m, n, sides) {
      var t = typeOfSides(sides);
      if (t) {
        parsed[t] += parseInt(n, 10);
        found = true;
      } else {
        valid = false;
      }

      return ' ';
    });
    if (!found || !valid || diceIn(parsed) > MAX_DICE) {
      return null;
    }
    var flat = 0;
    rest = rest.replace(/([+-])\s*(\d+)/g, function (m, sign, n) {
      flat += (sign === '-' ? -1 : 1) * parseInt(n, 10);

      return ' ';
    });

    return { counts: parsed, bonus: cleanBonus(flat), type: rest.replace(/[+-]/g, ' ').replace(/\s+/g, ' ').trim() };
  }

  // Critico: si raddoppiano i dadi, non i modificatori. Null se non ci stanno.
  function criticalOf(damage) {
    var out = emptyCounts();
    TYPES.forEach(function (t) {
      out[t] = damage.counts[t] * 2;
    });

    return diceIn(out) > MAX_DICE ? null : { counts: out, bonus: damage.bonus, type: damage.type };
  }

  function formulaText(cfg) {
    return formulaOf(cfg.counts, cfg.bonus);
  }

  function currentFormula() {
    return formulaOf(counts, bonus);
  }

  /* Dadi di un incantesimo dal suo testo: la prima formula è la base, "+1d6 per
     ogni slot oltre il 3°" la fa salire. A volte non è quella giusta: per
     questo sul palco c'è sempre "Modifica dadi". */
  function spellRoll(spell, view) {
    var desc = spell.desc || '';
    var first = /(\d+)d(\d+)(?:\s*\+\s*(\d+)(?!\s*d))?/.exec(desc);
    if (!first || !typeOfSides(first[2])) {
      return null;
    }
    var up = /(\d+)d(\d+)(?:(?!\d+d\d)[^.]){0,30}per ogni slot oltre il (\d)°/.exec(desc);
    if (up && (up.index <= first.index || !typeOfSides(up[2]))) {
      return null;
    }
    var after = desc.slice(first.index + first[0].length, first.index + first[0].length + 40).toLowerCase();
    var before = desc.slice(Math.max(0, first.index - 40), first.index).toLowerCase();
    var base = parseInt(first[1], 10);
    var flat = first[3] ? parseInt(first[3], 10) : 0;
    if (/^\s*\+\s*mod/.test(after)) {
      flat += view.mods[view.spellAbility] || 0;
    }
    if (spell.level === 0 && /sale a \d+d\d+/.test(desc)) {
      base *= 1 + CANTRIP_TIERS.filter(function (l) { return view.level >= l; }).length;
    }

    var slots = [spell.level];
    if (up) {
      var owned = [];
      for (var lvl = spell.level; lvl <= MAX_SLOT_LEVEL; lvl++) {
        if (view.resources.some(function (r) { return r.key === 'sl' + lvl && r.max > 0; })) {
          owned.push(lvl);
        }
      }
      slots = owned.length ? owned : slots;
    }
    var word = DAMAGE_WORD.exec(after);
    var isHeal = !word && HEAL_WORD.test(before + after);

    return {
      slots: slots,
      label: isHeal ? 'CURA' : (word ? 'DANNI' : 'TOTALE'),
      type: word && word[1] !== 'danni' ? word[1] : '',
      half: !!word && desc.indexOf('metà') !== -1,
      configFor: function (slot) {
        var cfg = { counts: emptyCounts(), bonus: flat };
        cfg.counts[typeOfSides(first[2])] = base;
        if (up) {
          var steps = Math.max(0, slot - parseInt(up[3], 10));
          cfg.counts[typeOfSides(up[2])] += parseInt(up[1], 10) * steps;
        }

        return diceIn(cfg.counts) > MAX_DICE ? null : cfg;
      }
    };
  }

  /* Riquadro nel dettaglio dell'incantesimo: slot usato (se fa salire i dadi)
     e pulsante del tiro. Null se dal testo non si ricavano dadi. */
  function spellBlock(spell, view, onRoll) {
    var info = spellRoll(spell, view);
    if (!info || !info.configFor(info.slots[0])) {
      return null;
    }
    var box = document.createElement('div');
    box.className = 'sheet-roll';
    var index = 0;

    function render() {
      var slot = info.slots[index];
      var cfg = info.configFor(slot);
      box.textContent = '';
      if (info.slots.length > 1) {
        var label = document.createElement('span');
        label.className = 'dice-free-lab';
        label.textContent = 'Slot usato';
        box.appendChild(buildRow(label, stepper('slot', slot + '°', index < info.slots.length - 1 && !!info.configFor(info.slots[index + 1]), index > 0, function (delta) {
          index += delta;
          render();
        })));
      }
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'dice-free-main dice-btn';
      go.textContent = 'Tira ' + formulaText(cfg);
      go.addEventListener('click', function () {
        onRoll(info, slot, cfg);
      });
      box.appendChild(go);
    }
    render();

    return box;
  }

  /* ---------- pannello sul palco ---------- */

  function recentButton(r, index) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dice-free-chip dice-btn';
    b.textContent = formulaOf(r.counts, r.bonus).replace(/ /g, '');
    b.setAttribute('aria-label', 'Tira ' + formulaOf(r.counts, r.bonus));
    b.addEventListener('click', function () {
      host.onRecent(index);
    });

    return b;
  }

  function renderRecents(target) {
    target.textContent = '';
    recents.forEach(function (r, i) {
      target.appendChild(recentButton(r, i));
    });
  }

  // note: riga in più sotto i dadi (es. la metà per chi supera il tiro salvezza).
  function showBreakdown(r, note) {
    var box = el('dice-free-break');
    box.textContent = '';
    box.classList.remove('hint');
    r.groups.forEach(function (g, i) {
      if (i) {
        box.appendChild(document.createTextNode('  |  '));
      }
      var label = document.createElement('b');
      label.textContent = g.label;
      box.appendChild(label);
      box.appendChild(document.createTextNode(': ' + g.results.join(' · ')));
    });
    if (r.bonus) {
      box.appendChild(document.createTextNode('  |  '));
      var b = document.createElement('b');
      b.textContent = 'bonus';
      box.appendChild(b);
      box.appendChild(document.createTextNode(' ' + window.AppEngine.formatMod(r.bonus)));
    }
    if (note) {
      var line = document.createElement('b');
      line.className = 'dice-free-note';
      line.textContent = note;
      box.appendChild(line);
    }
  }

  function showHint(text) {
    var box = el('dice-free-break');
    box.textContent = text;
    box.classList.add('hint');
  }

  function renderPanel() {
    showHint(isEmpty() ? 'Scegli i dadi da tirare' : 'Tocca un dado o scaglialo');
    el('dice-free-recent-wrap').classList.toggle('hidden', !recents.length);
    renderRecents(el('dice-free-recent'));
    el('dice-free-roll').disabled = isEmpty();
  }

  /* ---------- scheda "Dadi" del foglio di scelta ---------- */

  function dieLabel(t) {
    var box = document.createElement('span');
    box.className = 'dice-free-die';
    box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + SHAPES[t] + '</svg>';
    var name = document.createElement('span');
    name.textContent = t;
    box.appendChild(name);

    return box;
  }

  function stepper(what, text, canUp, canDown, onStep) {
    var box = document.createElement('div');
    box.className = 'dice-free-step';
    [[-1, '−', canDown], [1, '+', canUp]].forEach(function (cfg, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dice-btn';
      b.textContent = cfg[1];
      b.disabled = !cfg[2];
      b.setAttribute('aria-label', (cfg[0] > 0 ? 'Aumenta ' : 'Diminuisci ') + what);
      b.addEventListener('click', function () {
        onStep(cfg[0]);
      });
      box.appendChild(b);
      if (i === 0) {
        var value = document.createElement('b');
        value.textContent = text;
        box.appendChild(value);
      }
    });

    return box;
  }

  function buildRow(labelNode, stepNode) {
    var row = document.createElement('div');
    row.className = 'dice-free-row';
    row.appendChild(labelNode);
    row.appendChild(stepNode);

    return row;
  }

  function buildPicker(list) {
    if (recents.length) {
      var title = document.createElement('div');
      title.className = 'dice-free-title';
      title.textContent = 'Recenti';
      list.appendChild(title);
      var chips = document.createElement('div');
      chips.className = 'dice-free-recent';
      renderRecents(chips);
      list.appendChild(chips);
    }
    var free = MAX_DICE - diceIn(counts);
    TYPES.forEach(function (t) {
      list.appendChild(buildRow(
        dieLabel(t),
        stepper(t, String(counts[t]), free >= (t === 'd100' ? 2 : 1), counts[t] > 0, function (delta) {
          if (changeCount(t, delta)) {
            host.onChange();
          }
        })
      ));
    });
    var bonusLabel = document.createElement('span');
    bonusLabel.className = 'dice-free-lab';
    bonusLabel.textContent = 'Bonus';
    list.appendChild(buildRow(
      bonusLabel,
      stepper('bonus', bonus ? window.AppEngine.formatMod(bonus) : '0', bonus < BONUS_MAX, bonus > BONUS_MIN, function (delta) {
        changeBonus(delta);
        host.onChange();
      })
    ));

    var actions = document.createElement('div');
    actions.className = 'dice-free-actions';
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'dice-free-second dice-btn';
    clear.textContent = 'Azzera';
    clear.addEventListener('click', function () {
      clearAll();
      host.onChange();
    });
    var done = document.createElement('button');
    done.type = 'button';
    done.className = 'dice-free-main dice-btn';
    done.textContent = 'Fatto';
    done.addEventListener('click', function () {
      host.onDone();
    });
    actions.appendChild(clear);
    actions.appendChild(done);
    list.appendChild(actions);
  }

  window.AppDiceFree = {
    init: function (hostApi) {
      host = hostApi;
      counts = emptyCounts();
    },
    load: load,
    formula: formula,
    currentFormula: currentFormula,
    formulaText: formulaText,
    useTemporary: useTemporary,
    parseDamage: parseDamage,
    criticalOf: criticalOf,
    spellRoll: spellRoll,
    spellBlock: spellBlock,
    isEmpty: isEmpty,
    specs: specs,
    roll: roll,
    detailText: detailText,
    remember: remember,
    applyRecent: applyRecent,
    renderPanel: renderPanel,
    showBreakdown: showBreakdown,
    showHint: showHint,
    buildPicker: buildPicker
  };
})();
