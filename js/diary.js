(function () {
  function uid() {
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  function renderSessions() {
    var container = document.getElementById('sessions-accordion');
    if (!container) {
      return;
    }
    var state = window.AppStorage.getState();
    var sessions = state.diary.sessions;
    container.innerHTML = '';
    if (sessions.length === 0) {
      container.innerHTML = '<p class="diary-empty">Nessuna cronaca. Tocca + per aggiungere una sessione.</p>';

      return;
    }
    sessions.forEach(function (session, i) {
      var item = document.createElement('div');
      item.className = 'accordion-item' + (i === 0 ? ' open' : '');
      item.innerHTML =
        '<div class="accordion-header">' +
          '<input class="session-title-input" value="' + escapeAttr(session.title || 'Sessione') + '" aria-label="Titolo sessione">' +
          '<span class="accordion-chevron">▼</span>' +
        '</div>' +
        '<div class="accordion-body">' +
          '<textarea class="session-textarea" aria-label="Note sessione">' + escapeHtml(session.body || '') + '</textarea>' +
        '</div>';

      var header = item.querySelector('.accordion-header');
      header.addEventListener('click', function (e) {
        if (e.target.classList.contains('session-title-input')) {
          return;
        }
        item.classList.toggle('open');
      });

      var titleInp = item.querySelector('.session-title-input');
      titleInp.addEventListener('input', function () {
        session.title = titleInp.value;
        window.AppStorage.saveState(state);
      });
      titleInp.addEventListener('click', function (e) { e.stopPropagation(); });

      var textarea = item.querySelector('.session-textarea');
      textarea.addEventListener('input', function () {
        session.body = textarea.value;
        window.AppStorage.saveState(state);
      });

      container.appendChild(item);
    });
  }

  function renderPng() {
    var container = document.getElementById('png-list');
    if (!container) {
      return;
    }
    var state = window.AppStorage.getState();
    var list = state.diary.png.slice().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '', 'it');
    });
    container.innerHTML = '';
    if (list.length === 0) {
      container.innerHTML = '<p class="diary-empty">Nessun PNG registrato.</p>';

      return;
    }
    list.forEach(function (entry) {
      var idx = state.diary.png.indexOf(entry);
      var row = document.createElement('div');
      row.className = 'edit-row';
      var main = document.createElement('div');
      main.className = 'edit-main';
      var nameEl = document.createElement('div');
      nameEl.className = 'edit-name';
      nameEl.contentEditable = 'true';
      nameEl.setAttribute('data-ph', 'Nome');
      nameEl.textContent = entry.name || '';
      var noteEl = document.createElement('div');
      noteEl.className = 'edit-desc';
      noteEl.contentEditable = 'true';
      noteEl.setAttribute('data-ph', 'Note');
      noteEl.textContent = entry.notes || '';
      var meta = document.createElement('div');
      meta.className = 'edit-meta';
      var typeSel = document.createElement('select');
      typeSel.className = 'png-type';
      ['PNG', 'Fazione', 'Città'].forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (entry.type === t) {
          opt.selected = true;
        }
        typeSel.appendChild(opt);
      });
      meta.appendChild(typeSel);
      main.appendChild(nameEl);
      main.appendChild(noteEl);
      main.appendChild(meta);

      var del = document.createElement('button');
      del.className = 'edit-del';
      del.type = 'button';
      del.innerHTML = '✕';
      del.setAttribute('aria-label', 'Elimina');

      typeSel.addEventListener('change', function () {
        entry.type = typeSel.value;
        window.AppStorage.saveState(state);
      });
      nameEl.addEventListener('input', function () {
        entry.name = nameEl.textContent;
        window.AppStorage.saveState(state);
      });
      noteEl.addEventListener('input', function () {
        entry.notes = noteEl.textContent;
        window.AppStorage.saveState(state);
      });
      del.addEventListener('click', function () {
        state.diary.png.splice(idx, 1);
        window.AppStorage.saveState(state);
        renderPng();
      });

      row.appendChild(main);
      row.appendChild(del);
      container.appendChild(row);
    });
  }

  var QUEST_STATUSES = [
    { key: 'da-iniziare', label: 'Da iniziare' },
    { key: 'in-corso', label: 'In corso' },
    { key: 'in-pausa', label: 'In pausa' }
  ];

  function statusLabel(key) {
    for (var i = 0; i < QUEST_STATUSES.length; i++) {
      if (QUEST_STATUSES[i].key === key) {
        return QUEST_STATUSES[i].label;
      }
    }

    return QUEST_STATUSES[0].label;
  }

  function normalizeQuest(quest) {
    var changed = false;
    if (quest.title == null) {
      quest.title = quest.text || '';
      changed = true;
    }
    if (quest.text != null) {
      delete quest.text;
      changed = true;
    }
    if (quest.objective == null) {
      quest.objective = '';
      changed = true;
    }
    if (quest.description == null) {
      quest.description = '';
      changed = true;
    }
    if (quest.status == null || !statusLabel(quest.status)) {
      quest.status = 'da-iniziare';
      changed = true;
    }

    return changed;
  }

  function renderQuestList(containerId, arr, completed) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }
    container.innerHTML = '';
    if (arr.length === 0) {
      container.innerHTML = '<p class="diary-empty">Nessuna missione.</p>';

      return;
    }
    var state = window.AppStorage.getState();
    arr.forEach(function (quest, i) {
      var panel = document.createElement('div');
      panel.className = 'qpanel' + (completed ? ' done' : '');

      var head = document.createElement('div');
      head.className = 'qpanel-head';

      var check = document.createElement('button');
      check.type = 'button';
      check.className = 'quest-check' + (completed ? ' checked' : '');
      check.textContent = completed ? '✓' : '';
      check.setAttribute('aria-label', completed ? 'Segna attiva' : 'Segna completata');

      var titleInp = document.createElement('input');
      titleInp.type = 'text';
      titleInp.className = 'session-title-input';
      titleInp.value = quest.title || '';
      titleInp.setAttribute('placeholder', 'Titolo missione');
      titleInp.setAttribute('aria-label', 'Titolo missione');

      var pill = null;
      if (!completed) {
        pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'qstatus qpill-cycle stato-' + quest.status;
        pill.textContent = statusLabel(quest.status);
        pill.setAttribute('aria-label', 'Cambia stato avanzamento');
      }

      var chevron = document.createElement('span');
      chevron.className = 'qchevron';
      chevron.textContent = '▼';
      chevron.setAttribute('aria-hidden', 'true');

      head.appendChild(check);
      head.appendChild(titleInp);
      if (pill) {
        head.appendChild(pill);
      }
      head.appendChild(chevron);

      var body = document.createElement('div');
      body.className = 'qpanel-body';
      body.innerHTML =
        '<div class="qfield"><label>Obiettivo</label><input type="text" class="q-objective" placeholder="Obiettivo della missione"></div>' +
        '<div class="qfield"><label>Descrizione</label><textarea class="q-desc" placeholder="Descrizione, indizi, sviluppi..."></textarea></div>' +
        '<div class="qfoot"><button type="button" class="qdel">Elimina missione</button></div>';
      var objectiveInp = body.querySelector('.q-objective');
      var descInp = body.querySelector('.q-desc');
      objectiveInp.value = quest.objective || '';
      descInp.value = quest.description || '';

      panel.appendChild(head);
      panel.appendChild(body);

      head.addEventListener('click', function (e) {
        if (e.target === titleInp || e.target === check || e.target === pill) {
          return;
        }
        panel.classList.toggle('open');
      });

      check.addEventListener('click', function (e) {
        e.stopPropagation();
        var removed = arr.splice(i, 1)[0];
        if (completed) {
          state.diary.quests.active.push(removed);
        } else {
          state.diary.quests.completed.push(removed);
        }
        window.AppStorage.saveState(state);
        renderQuests();
      });

      titleInp.addEventListener('click', function (e) { e.stopPropagation(); });
      titleInp.addEventListener('input', function () {
        quest.title = titleInp.value;
        window.AppStorage.saveState(state);
      });

      if (pill) {
        pill.addEventListener('click', function (e) {
          e.stopPropagation();
          var idx = 0;
          for (var s = 0; s < QUEST_STATUSES.length; s++) {
            if (QUEST_STATUSES[s].key === quest.status) {
              idx = s;
              break;
            }
          }
          var next = QUEST_STATUSES[(idx + 1) % QUEST_STATUSES.length];
          quest.status = next.key;
          pill.className = 'qstatus qpill-cycle stato-' + next.key;
          pill.textContent = next.label;
          window.AppStorage.saveState(state);
        });
      }

      objectiveInp.addEventListener('input', function () {
        quest.objective = objectiveInp.value;
        window.AppStorage.saveState(state);
      });
      descInp.addEventListener('input', function () {
        quest.description = descInp.value;
        window.AppStorage.saveState(state);
      });
      body.querySelector('.qdel').addEventListener('click', function () {
        arr.splice(i, 1);
        window.AppStorage.saveState(state);
        renderQuests();
      });

      container.appendChild(panel);
    });
  }

  function renderQuests() {
    var state = window.AppStorage.getState();
    var changed = false;
    state.diary.quests.active.forEach(function (q) {
      if (normalizeQuest(q)) {
        changed = true;
      }
    });
    state.diary.quests.completed.forEach(function (q) {
      if (normalizeQuest(q)) {
        changed = true;
      }
    });
    if (changed) {
      window.AppStorage.saveState(state);
    }
    renderQuestList('quest-active', state.diary.quests.active, false);
    renderQuestList('quest-completed', state.diary.quests.completed, true);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }

  function addSession() {
    var state = window.AppStorage.getState();
    state.diary.sessions.unshift({
      id: uid(),
      title: 'Sessione ' + (state.diary.sessions.length + 1),
      body: ''
    });
    window.AppStorage.saveState(state);
    renderSessions();
  }

  function addPng() {
    var state = window.AppStorage.getState();
    state.diary.png.push({ name: '', type: 'PNG', notes: '' });
    window.AppStorage.saveState(state);
    renderPng();
    var rows = document.querySelectorAll('#png-list .edit-name');
    var last = rows[rows.length - 1];
    if (last) {
      last.focus();
    }
  }

  function addQuest() {
    var state = window.AppStorage.getState();
    state.diary.quests.active.push({
      id: uid(),
      title: '',
      objective: '',
      description: '',
      status: 'da-iniziare'
    });
    window.AppStorage.saveState(state);
    renderQuests();
    var inputs = document.querySelectorAll('#quest-active .session-title-input');
    var last = inputs[inputs.length - 1];
    if (last) {
      var panel = last.closest('.qpanel');
      if (panel) {
        panel.classList.add('open');
      }
      last.focus();
    }
  }

  function render() {
    renderSessions();
    renderPng();
    renderQuests();
  }

  function init() {
    render();
  }

  window.AppDiary = {
    init: init,
    render: render,
    addSession: addSession,
    addPng: addPng,
    addQuest: addQuest
  };
})();
