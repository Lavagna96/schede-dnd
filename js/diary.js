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
    if (quest.status != null) {
      delete quest.status;
      changed = true;
    }

    return changed;
  }

  /* Migra dal vecchio formato (quests.active[] con campo status) al nuovo:
     una sola missione attiva alla volta (quests.active singola o null) più
     una lista "da iniziare" (quests.todo). La prima missione con
     status === 'in-corso' trovata diventa l'attiva; le altre finiscono
     tra le "da iniziare". */
  function migrateQuestsShape(quests) {
    var changed = false;
    if (Array.isArray(quests.active)) {
      var picked = null;
      var leftover = [];
      quests.active.forEach(function (q) {
        if (!picked && q.status === 'in-corso') {
          picked = q;
        } else {
          leftover.push(q);
        }
      });
      quests.todo = (quests.todo || []).concat(leftover);
      quests.active = picked || null;
      changed = true;
    }
    if (quests.active === undefined) {
      quests.active = null;
      changed = true;
    }
    if (!Array.isArray(quests.todo)) {
      quests.todo = [];
      changed = true;
    }
    if (!Array.isArray(quests.completed)) {
      quests.completed = [];
      changed = true;
    }
    if (quests.active && normalizeQuest(quests.active)) {
      changed = true;
    }
    quests.todo.forEach(function (q) {
      if (normalizeQuest(q)) {
        changed = true;
      }
    });
    quests.completed.forEach(function (q) {
      if (normalizeQuest(q)) {
        changed = true;
      }
    });

    return changed;
  }

  function buildQuestPanel(quest, opts) {
    var panel = document.createElement('div');
    panel.className = 'qpanel' + (opts.done ? ' done' : '') + (opts.activeSlot ? ' active-slot' : '');

    var head = document.createElement('div');
    head.className = 'qpanel-head';

    var check = document.createElement('button');
    check.type = 'button';
    check.className = 'quest-check' + (opts.done ? ' checked' : '');
    check.textContent = opts.done ? '✓' : '';
    check.setAttribute('aria-label', opts.done ? 'Segna da iniziare' : 'Segna completata');

    var titleInp = document.createElement('input');
    titleInp.type = 'text';
    titleInp.className = 'session-title-input';
    titleInp.value = quest.title || '';
    titleInp.setAttribute('placeholder', 'Titolo missione');
    titleInp.setAttribute('aria-label', 'Titolo missione');

    var chevron = document.createElement('span');
    chevron.className = 'qchevron';
    chevron.textContent = '▼';
    chevron.setAttribute('aria-hidden', 'true');

    head.appendChild(check);
    head.appendChild(titleInp);
    head.appendChild(chevron);

    var body = document.createElement('div');
    body.className = 'qpanel-body';
    body.innerHTML =
      '<div class="qfield"><label>Obiettivo</label><input type="text" class="q-objective" placeholder="Obiettivo della missione"></div>' +
      '<div class="qfield"><label>Descrizione</label><textarea class="q-desc" placeholder="Descrizione, indizi, sviluppi..."></textarea></div>' +
      '<div class="qfoot">' +
        (opts.showActivate ? '<button type="button" class="btn-activate">Attiva missione</button>' : '') +
        '<button type="button" class="qdel">Elimina missione</button>' +
      '</div>';
    var objectiveInp = body.querySelector('.q-objective');
    var descInp = body.querySelector('.q-desc');
    objectiveInp.value = quest.objective || '';
    descInp.value = quest.description || '';

    panel.appendChild(head);
    panel.appendChild(body);

    head.addEventListener('click', function (e) {
      if (e.target === titleInp || e.target === check) {
        return;
      }
      panel.classList.toggle('open');
    });

    check.addEventListener('click', function (e) {
      e.stopPropagation();
      opts.onToggleComplete();
    });

    titleInp.addEventListener('click', function (e) { e.stopPropagation(); });
    titleInp.addEventListener('input', function () {
      quest.title = titleInp.value;
      opts.onChange();
    });

    objectiveInp.addEventListener('input', function () {
      quest.objective = objectiveInp.value;
      opts.onChange();
    });
    descInp.addEventListener('input', function () {
      quest.description = descInp.value;
      opts.onChange();
    });
    body.querySelector('.qdel').addEventListener('click', function () {
      opts.onDelete();
    });
    if (opts.showActivate) {
      body.querySelector('.btn-activate').addEventListener('click', function (e) {
        e.stopPropagation();
        opts.onActivate();
      });
    }

    return panel;
  }

  function renderQuests() {
    var state = window.AppStorage.getState();
    var quests = state.diary.quests;
    if (migrateQuestsShape(quests)) {
      window.AppStorage.saveState(state);
    }

    function persist() {
      window.AppStorage.saveState(state);
    }

    var activeContainer = document.getElementById('quest-active');
    if (activeContainer) {
      activeContainer.innerHTML = '';
      if (!quests.active) {
        activeContainer.innerHTML = '<p class="diary-empty">Nessuna missione attiva. Attivane una da "Da iniziare".</p>';
      } else {
        activeContainer.appendChild(buildQuestPanel(quests.active, {
          done: false,
          activeSlot: true,
          showActivate: false,
          onToggleComplete: function () {
            quests.completed.push(quests.active);
            quests.active = null;
            persist();
            renderQuests();
          },
          onDelete: function () {
            quests.active = null;
            persist();
            renderQuests();
          },
          onChange: persist
        }));
      }
    }

    var todoContainer = document.getElementById('quest-todo');
    if (todoContainer) {
      todoContainer.innerHTML = '';
      if (quests.todo.length === 0) {
        todoContainer.innerHTML = '<p class="diary-empty">Nessuna missione in attesa.</p>';
      } else {
        quests.todo.forEach(function (quest, i) {
          todoContainer.appendChild(buildQuestPanel(quest, {
            done: false,
            activeSlot: false,
            showActivate: true,
            onToggleComplete: function () {
              var removed = quests.todo.splice(i, 1)[0];
              quests.completed.push(removed);
              persist();
              renderQuests();
            },
            onActivate: function () {
              var removed = quests.todo.splice(i, 1)[0];
              if (quests.active) {
                quests.todo.push(quests.active);
              }
              quests.active = removed;
              persist();
              renderQuests();
            },
            onDelete: function () {
              quests.todo.splice(i, 1);
              persist();
              renderQuests();
            },
            onChange: persist
          }));
        });
      }
    }

    var completedContainer = document.getElementById('quest-completed');
    if (completedContainer) {
      completedContainer.innerHTML = '';
      if (quests.completed.length === 0) {
        completedContainer.innerHTML = '<p class="diary-empty">Nessuna missione.</p>';
      } else {
        quests.completed.forEach(function (quest, i) {
          completedContainer.appendChild(buildQuestPanel(quest, {
            done: true,
            activeSlot: false,
            showActivate: false,
            onToggleComplete: function () {
              var removed = quests.completed.splice(i, 1)[0];
              quests.todo.push(removed);
              persist();
              renderQuests();
            },
            onDelete: function () {
              quests.completed.splice(i, 1);
              persist();
              renderQuests();
            },
            onChange: persist
          }));
        });
      }
    }
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
    state.diary.quests.todo.push({
      id: uid(),
      title: '',
      objective: '',
      description: ''
    });
    window.AppStorage.saveState(state);
    renderQuests();
    var inputs = document.querySelectorAll('#quest-todo .session-title-input');
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
