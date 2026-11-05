(function () {
  /* d20 in 3D per il lancio dadi (js/dice.js): WebGL puro, nessuna libreria.
     Il risultato si decide PRIMA (js/dice.js) e qui si anima soltanto: il dado
     parte da rotazioni casuali che si smorzano fino a zero esatto
     sull'orientamento che porta davanti la faccia estratta, così il numero
     mostrato è sempre quello tirato. Il disegno gira solo mentre serve (dado
     in attesa o in volo): a risultato fermo non consuma batteria. */

  var FONT_TIMEOUT_MS = 2500;
  var THROW_MS = 1500;
  var THROW_MS_REDUCED = 300;
  var FADE_MS = 260;
  var CAMERA_DIST = 4.6;
  // Una sola scala per un dado, una più piccola per la coppia di vantaggio/svantaggio.
  var SINGLE = { x: 0, scale: 0.84 };
  var PAIR = [{ x: -0.72, scale: 0.62 }, { x: 0.72, scale: 0.62 }];

  var VERTEX_SHADER = [
    'attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;attribute vec3 aB;attribute float aF;',
    'uniform mat3 uR;uniform vec3 uT;uniform float uS;uniform mat4 uProj;',
    'varying vec3 vN;varying vec3 vW;varying vec3 vO;varying vec2 vU;varying vec3 vB;varying float vF;',
    'void main(){vec3 w=uR*aP*uS+uT;vN=uR*aN;vW=w;vO=aP;vU=aU;vB=aB;vF=aF;gl_Position=uProj*vec4(w,1.0);}'
  ].join('');

  /* Materiale: pietra perlacea viola-grigia con venature procedurali, luce
     principale in alto a sinistra, riflesso d'ambiente, spigoli più chiari
     e numeri incisi. uFace/uGlow accendono d'oro il numero estratto. */
  var FRAGMENT_SHADER = [
    'precision highp float;',
    'varying vec3 vN;varying vec3 vW;varying vec3 vO;varying vec2 vU;varying vec3 vB;varying float vF;',
    'uniform sampler2D uTex;uniform float uFace;uniform float uDim;uniform float uGlow;',
    'float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}',
    'float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'float fbm(vec3 p){return 0.55*n3(p)+0.3*n3(p*2.1)+0.15*n3(p*4.3);}',
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(-vW);',
    'float m=fbm(vO*3.2+fbm(vO*2.0)*1.6);',
    'vec3 base=mix(vec3(0.20,0.17,0.30),vec3(0.50,0.47,0.62),smoothstep(0.32,0.72,m));',
    'vec3 Np=normalize(N+0.05*(vec3(n3(vO*9.0),n3(vO*9.0+3.1),n3(vO*9.0+7.7))-0.5));',
    'vec3 L1=normalize(vec3(-0.45,0.75,0.75));vec3 L2=normalize(vec3(0.8,-0.15,0.5));',
    'float d1=max(dot(N,L1),0.0);float d2=max(dot(N,L2),0.0);',
    'float s1=pow(max(dot(Np,normalize(L1+V)),0.0),55.0);float s2=pow(max(dot(Np,normalize(L2+V)),0.0),28.0);',
    'vec3 R=reflect(-V,N);vec3 env=mix(vec3(0.05,0.03,0.09),vec3(0.62,0.58,0.76),smoothstep(-0.35,0.85,R.y*0.8-R.x*0.3));',
    'float fr=pow(1.0-max(dot(N,V),0.0),3.0);',
    'vec3 col=base*(0.30+0.95*d1+0.32*d2*vec3(0.75,0.62,1.0))+env*(0.20+0.55*fr)+vec3(1.0,0.97,0.92)*s1*0.8+vec3(0.72,0.6,1.0)*s2*0.2;',
    'float e=min(vB.x,min(vB.y,vB.z));float bev=1.0-smoothstep(0.012,0.05,e);float gr=1.0-smoothstep(0.0,0.012,e);',
    'col+=bev*(vec3(0.58,0.55,0.70)*(0.28+0.75*d1)+vec3(0.4)*s1);col*=1.0-gr*0.28;',
    'float a=texture2D(uTex,vU).a;float sh=texture2D(uTex,vU+vec2(0.0014,0.0020)).a;',
    'col*=1.0-0.55*max(sh-a,0.0);',
    'vec3 ink=vec3(0.97,0.95,0.90)*(0.62+0.55*d1);',
    'if(abs(vF-uFace)<0.5){ink=mix(ink,vec3(1.25,1.02,0.55),uGlow);col+=vec3(0.16,0.11,0.03)*uGlow;}',
    'col=mix(col,ink,a);col*=mix(1.0,0.38,uDim);col=pow(col,vec3(0.92));gl_FragColor=vec4(col,1.0);}'
  ].join('');

  /* ---------- vettori e quaternioni ---------- */

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]);

    return [a[0] / l, a[1] / l, a[2] / l];
  }

  function quatAxis(axis, angle) {
    var n = norm(axis);
    var s = Math.sin(angle / 2);

    return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
  }

  function quatMul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  }

  function quatLerp(a, b, t) {
    // Il segno opposto è la stessa rotazione: senza questo il raccordo
    // potrebbe prendere la strada lunga.
    var s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    var q = [0, 1, 2, 3].map(function (i) { return a[i] + (s * b[i] - a[i]) * t; });
    var l = Math.hypot(q[0], q[1], q[2], q[3]);

    return q.map(function (v) { return v / l; });
  }

  function quatToMat3(q) {
    var x = q[0], y = q[1], z = q[2], w = q[3];

    return new Float32Array([
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w),
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)
    ]);
  }

  // m: righe della matrice di rotazione.
  function mat3ToQuat(m) {
    var a = m[0][0], b = m[1][1], c = m[2][2], t = a + b + c, s;
    if (t > 0) {
      s = Math.sqrt(t + 1) * 2;

      return [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
    }
    if (a > b && a > c) {
      s = Math.sqrt(1 + a - b - c) * 2;

      return [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
    }
    if (b > c) {
      s = Math.sqrt(1 + b - a - c) * 2;

      return [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
    }
    s = Math.sqrt(1 + c - a - b) * 2;

    return [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s];
  }

  /* ---------- geometria: icosaedro con facce numerate ---------- */

  function buildGeometry() {
    var phi = (1 + Math.sqrt(5)) / 2;
    var vertices = [
      [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
      [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
      [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]
    ].map(norm);
    var edge = Math.hypot.apply(null, sub(vertices[0], vertices[1]));
    function isEdge(i, j) {
      return Math.abs(Math.hypot.apply(null, sub(vertices[i], vertices[j])) - edge) < 1e-4;
    }

    var faces = [];
    for (var i = 0; i < 12; i++) {
      for (var j = i + 1; j < 12; j++) {
        for (var k = j + 1; k < 12; k++) {
          if (isEdge(i, j) && isEdge(j, k) && isEdge(i, k)) {
            // Ordine antiorario visto da fuori: il primo vertice è la "punta"
            // sopra il numero, gli altri due la base.
            var outward = dot(cross(sub(vertices[j], vertices[i]), sub(vertices[k], vertices[i])), vertices[i]) > 0;
            faces.push({
              verts: outward ? [i, j, k] : [i, k, j],
              center: norm([
                vertices[i][0] + vertices[j][0] + vertices[k][0],
                vertices[i][1] + vertices[j][1] + vertices[k][1],
                vertices[i][2] + vertices[j][2] + vertices[k][2]
              ])
            });
          }
        }
      }
    }

    // Facce opposte sommano sempre 21, come in un d20 vero.
    var sequence = [20, 8, 14, 2, 11, 17, 5, 3, 15, 9];
    var next = 0;
    faces.forEach(function (f) {
      if (f.num) {
        return;
      }
      f.num = sequence[next++];
      faces.filter(function (g) { return dot(g.center, f.center) < -0.99; })[0].num = 21 - f.num;
    });

    var data = [];
    var uv = [[0.5, 0.06], [0.03, 0.87], [0.97, 0.87]];
    var bary = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    faces.forEach(function (f, idx) {
      var col = idx % 5, row = Math.floor(idx / 5);
      f.verts.forEach(function (v, t) {
        var p = vertices[v];
        data.push(p[0], p[1], p[2], f.center[0], f.center[1], f.center[2],
          (col + uv[t][0]) / 5, (row + uv[t][1]) / 5,
          bary[t][0], bary[t][1], bary[t][2], f.num);
      });
    });

    return { vertices: vertices, faces: faces, data: new Float32Array(data) };
  }

  /* ---------- stato del renderer ---------- */

  var geo = buildGeometry();
  var canvas = null;
  var gl = null;
  var uniforms = {};
  var fallbackEl = null;
  var atlasReady = false;
  var active = false;
  var looping = false;
  var dice = [];
  var pending = null;
  var fade = null;
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    return shader;
  }

  function buildAtlas() {
    var c = document.createElement('canvas');
    c.width = c.height = 2048;
    var x = c.getContext('2d');
    var cell = 2048 / 5;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#fff';
    geo.faces.forEach(function (f, idx) {
      var cx = (idx % 5 + 0.5) * cell;
      var cy = (Math.floor(idx / 5) + 0.60) * cell;
      x.font = '700 ' + (f.num >= 10 ? 0.27 : 0.33) * cell + 'px Cinzel, serif';
      x.fillText(String(f.num), cx, cy);
      // 6 e 9 si distinguono con una lineetta, come sui dadi veri.
      if (f.num === 6 || f.num === 9) {
        x.fillRect(cx - cell * 0.05, cy + cell * 0.15, cell * 0.1, cell * 0.016);
      }
    });
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    }
    gl.uniform1i(uniforms.uTex, 0);
    atlasReady = true;
  }

  // Le cifre sul dado sono in Cinzel: l'atlante aspetta il font, ma non per sempre.
  function buildAtlasWhenFontReady() {
    atlasReady = false;
    var done = function () {
      if (gl && !gl.isContextLost()) {
        buildAtlas();
        kick();
      }
    };
    if (document.fonts && document.fonts.load) {
      Promise.race([
        document.fonts.load('700 100px Cinzel', '0123456789'),
        new Promise(function (resolve) { setTimeout(resolve, FONT_TIMEOUT_MS); })
      ]).then(done, done);
    } else {
      done();
    }
  }

  // Tutto ciò che vive nel contesto WebGL: rifatto anche dopo una sua perdita.
  function setupContext() {
    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return false;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
    [['aP', 3, 0], ['aN', 3, 12], ['aU', 2, 24], ['aB', 3, 32], ['aF', 1, 44]].forEach(function (a) {
      var loc = gl.getAttribLocation(program, a[0]);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a[1], gl.FLOAT, false, 48, a[2]);
    });
    ['uR', 'uT', 'uS', 'uProj', 'uFace', 'uDim', 'uGlow', 'uTex'].forEach(function (name) {
      uniforms[name] = gl.getUniformLocation(program, name);
    });
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    var f = 1 / Math.tan(35 * Math.PI / 360);
    var near = 1, far = 10;
    gl.uniformMatrix4fv(uniforms.uProj, false, new Float32Array([
      f, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) / (near - far), -1,
      0, 0, 2 * far * near / (near - far), 0
    ]));
    buildAtlasWhenFontReady();

    return true;
  }

  /* Senza WebGL il tiro resta valido: al posto del dado compare il numero. */
  function showFallback(canvasEl) {
    fallbackEl = document.createElement('div');
    fallbackEl.className = 'dice-fallback';
    fallbackEl.setAttribute('aria-hidden', 'true');
    fallbackEl.textContent = '20';
    canvasEl.parentNode.insertBefore(fallbackEl, canvasEl.nextSibling);
    canvasEl.style.opacity = '0';
  }

  function init(canvasEl) {
    if (canvas) {
      return;
    }
    canvas = canvasEl;
    gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl || !setupContext()) {
      gl = null;
      showFallback(canvas);

      return;
    }
    // iOS può togliere il contesto a un'app in background: si ricostruisce al rientro.
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      atlasReady = false;
    });
    canvas.addEventListener('webglcontextrestored', function () {
      setupContext();
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        kick();
      }
    });
  }

  /* ---------- pose e animazione ---------- */

  /* Orientamento che porta davanti, dritta, la faccia col numero dato; la
     leggera inclinazione lascia vedere le facce vicine, come un dado vero. */
  function faceQuat(num) {
    var f = geo.faces.filter(function (g) { return g.num === num; })[0];
    var z = f.center;
    var top = geo.vertices[f.verts[0]];
    var along = dot(top, z);
    var y = norm(sub(top, [z[0] * along, z[1] * along, z[2] * along]));

    return quatMul(quatAxis([1, 0, 0], -0.14), quatMul(quatAxis([0, 1, 0], 0.13), mat3ToQuat([cross(y, z), y, z])));
  }

  function makeDie(num, slot) {
    return {
      num: num, target: faceQuat(num), x: slot.x, scale: slot.scale,
      pose: null, from: null, idle: false,
      t0: 0, dur: 0, axis1: [1, 0, 0], axis2: [0, 1, 0], spin1: 0, spin2: 0,
      dim: 0, glow: 0
    };
  }

  function slotFor(count, i) {
    return count > 1 ? PAIR[i] : SINGLE;
  }

  function randomAxis() {
    return norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 + 1e-3]);
  }

  function resize() {
    var side = Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2.5));
    if (side > 0 && canvas.width !== side) {
      canvas.width = canvas.height = side;
      gl.viewport(0, 0, side, side);
    }
  }

  function poseOf(d, now) {
    if (d.idle) {
      if (reducedMotion) {
        return { q: d.target, y: 0, scale: d.scale };
      }

      return {
        q: quatMul(quatAxis([0, 1, 0], now * 0.00045), quatMul(quatAxis([1, 0, 0], Math.sin(now * 0.0007) * 0.25), d.target)),
        y: Math.sin(now * 0.0016) * 0.03,
        scale: d.scale
      };
    }
    if (!d.dur) {
      return { q: d.target, y: 0, scale: d.scale };
    }
    var t = Math.min(1, Math.max(0, (now - d.t0) / d.dur));
    var tumble = quatMul(quatAxis(d.axis1, d.spin1 * Math.pow(1 - t, 3)), quatMul(quatAxis(d.axis2, d.spin2 * Math.pow(1 - t, 2.2)), d.target));
    // All'inizio si raccorda con la posa precedente, così il dado non "salta".
    var q = d.from && t < 0.1 ? quatLerp(d.from, tumble, t / 0.1) : tumble;
    if (reducedMotion) {
      return { q: q, y: 0, scale: d.scale };
    }
    // Rimbalzi smorzati: il dado sale verso chi guarda e ricade.
    var bounce = Math.abs(Math.cos(t * Math.PI * 3.5)) * Math.pow(1 - t, 2.1);

    return {
      q: q,
      y: bounce * 0.34,
      scale: d.scale * (1 + 0.26 * bounce + 0.14 * Math.pow(1 - t, 3))
    };
  }

  function draw(now) {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    dice.forEach(function (d) {
      var pose = poseOf(d, now);
      d.pose = pose.q;
      gl.uniformMatrix3fv(uniforms.uR, false, quatToMat3(pose.q));
      gl.uniform3f(uniforms.uT, d.x, pose.y, -CAMERA_DIST);
      gl.uniform1f(uniforms.uS, pose.scale);
      gl.uniform1f(uniforms.uFace, d.num);
      gl.uniform1f(uniforms.uDim, d.dim);
      gl.uniform1f(uniforms.uGlow, d.glow);
      gl.drawArrays(gl.TRIANGLES, 0, 60);
    });
  }

  function isAnimating() {
    return !!pending || !!fade || (!reducedMotion && dice.some(function (d) { return d.idle; }));
  }

  function tick(now) {
    if (!active || !gl || gl.isContextLost()) {
      looping = false;

      return;
    }
    if (atlasReady) {
      draw(now);
    }
    if (pending && now >= pending.end) {
      var finished = pending;
      pending = null;
      fade = { start: now, kept: finished.keep };
      setTimeout(finished.done, FADE_MS + 20);
    }
    if (fade) {
      var k = Math.min(1, (now - fade.start) / FADE_MS);
      dice.forEach(function (d, i) {
        d.glow = i === fade.kept ? k : 0;
        d.dim = i === fade.kept ? 0 : k;
      });
      if (k >= 1) {
        fade = null;
      }
    }
    if (isAnimating() || !atlasReady) {
      requestAnimationFrame(tick);
    } else {
      draw(now);
      looping = false;
    }
  }

  function kick() {
    if (active && gl && !looping) {
      looping = true;
      requestAnimationFrame(tick);
    }
  }

  /* ---------- API usata da js/dice.js ---------- */

  function start() {
    active = true;
    kick();
  }

  // Alla chiusura il disegno si ferma e un tiro in volo non chiama più nessuno.
  function stop() {
    active = false;
    pending = null;
    fade = null;
  }

  function setIdle(count) {
    pending = null;
    fade = null;
    dice = [];
    for (var i = 0; i < count; i++) {
      var d = makeDie(20, slotFor(count, i));
      d.idle = true;
      dice.push(d);
    }
    if (fallbackEl) {
      fallbackEl.textContent = '20';
      fallbackEl.classList.remove('dim');
    }
    kick();
  }

  /* values: i d20 estratti; keep: indice di quello che conta; only: se
     presente, si anima solo quel dado (ritiro di uno dei due). */
  function throwDice(values, keep, done, only) {
    var now = performance.now();
    var reduced = reducedMotion;
    var total = reduced ? THROW_MS_REDUCED : THROW_MS;
    var longest = 0;
    var previous = dice;
    dice = values.map(function (v, i) {
      var old = previous.length === values.length ? previous[i] : null;
      if (only != null && i !== only && old) {
        old.idle = false;
        old.glow = 0;
        old.dim = 0;

        return old;
      }
      var d = makeDie(v, slotFor(values.length, i));
      var stagger = only != null || reduced ? 0 : i;
      d.from = old ? old.pose : null;
      d.t0 = now + stagger * 90;
      d.dur = total + stagger * 120;
      d.axis1 = randomAxis();
      d.axis2 = randomAxis();
      d.spin1 = (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 6);
      d.spin2 = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
      longest = Math.max(longest, stagger * 90 + d.dur);

      return d;
    });
    if (!gl) {
      fallbackEl.textContent = String(values[keep]);
      setTimeout(done, THROW_MS_REDUCED);

      return;
    }
    fade = null;
    pending = { keep: keep, done: done, end: now + longest };
    kick();
  }

  window.AppDice3D = {
    init: init,
    start: start,
    stop: stop,
    setIdle: setIdle,
    throwDice: throwDice,
    redraw: kick,
    isReducedMotion: function () { return reducedMotion; }
  };
})();
