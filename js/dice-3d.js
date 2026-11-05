(function () {
  /* Dadi in 3D per il lancio dadi (js/dice.js): WebGL puro, nessuna libreria.
     Il risultato si decide PRIMA (js/dice.js) e qui si anima soltanto: ogni dado
     parte da rotazioni casuali che si smorzano fino a zero esatto
     sull'orientamento che porta davanti la faccia estratta, così il numero
     mostrato è sempre quello tirato. Il disegno gira solo mentre serve (dadi
     in attesa o in volo): a risultato fermo non consuma batteria. */

  var FONT_TIMEOUT_MS = 2500;
  var THROW_MS = 1500;
  var THROW_MS_REDUCED = 300;
  var FADE_MS = 260;
  var STAGGER_MAX = 4;
  var TWO_DIGIT_RATIO = 0.82;
  var CAMERA_DIST = 4.6;
  // Dado afferrato col dito (js/dice.js): rotazione per pixel, ingrandimento,
  // rientro morbido quando viene posato senza tirare.
  var GRAB_ROTATION = 0.011;
  var GRAB_SCALE = 1.08;
  var GRAB_BACK_MS = 280;
  // Scagliato: giri in più in base alla forza, nel verso del dito.
  var FLING_SPIN_BASE = 13;
  var FLING_SPIN_POWER = 12;
  var FLING_AXIS_TILT = 0.15;
  // Una sola scala per un dado, una più piccola per la coppia di vantaggio/svantaggio.
  var SINGLE_SLOT = { x: 0, y: 0, scale: 0.84 };
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

  /* ---------- geometria: i sette dadi ---------- */

  var PHI = (1 + Math.sqrt(5)) / 2;
  var BEVEL_K = 2.2; // spigoli della stessa larghezza su tutti i dadi

  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }

  function average(points) {
    var sum = points.reduce(add, [0, 0, 0]);

    return mul(sum, 1 / points.length);
  }

  function signs(list) {
    var out = [];
    list.forEach(function (v) {
      [1, -1].forEach(function (a) {
        [1, -1].forEach(function (b) {
          [1, -1].forEach(function (c) {
            var p = [v[0] * a, v[1] * b, v[2] * c];
            if (!out.some(function (q) { return Math.hypot.apply(null, sub(p, q)) < 1e-6; })) {
              out.push(p);
            }
          });
        });
      });
    });

    return out;
  }

  // Poligono dei vertici più lontani lungo la normale, in senso antiorario visto da fuori.
  function polygonOf(vertices, normal) {
    var n = norm(normal);
    var top = Math.max.apply(null, vertices.map(function (v) { return dot(v, n); }));
    var poly = vertices.filter(function (v) { return top - dot(v, n) < 1e-4; });
    var c = average(poly);
    var ref = norm(sub(poly[0], c));
    var side = cross(n, ref);

    return poly.slice().sort(function (p, q) {
      var dp = sub(p, c), dq = sub(q, c);

      return Math.atan2(dot(dp, side), dot(dp, ref)) - Math.atan2(dot(dq, side), dot(dq, ref));
    });
  }

  function faceFrom(points, up) {
    var c = average(points);
    var n = norm(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    if (dot(n, c) < 0) {
      n = mul(n, -1);
      points = points.slice().reverse();
    }

    return { points: points, center: c, normal: n, up: norm(sub(up || points[0], c)) };
  }

  function fromNormals(vertices, normals, upMode) {
    return normals.map(function (nrm) {
      var poly = polygonOf(vertices, nrm);

      return faceFrom(poly, upMode === 'edge' ? average([poly[0], poly[1]]) : poly[0]);
    });
  }

  // Facce opposte con la somma giusta, come sui dadi veri.
  function numberOpposite(faces, sequence, sum) {
    var next = 0;
    faces.forEach(function (f) {
      if (f.num) {
        return;
      }
      f.num = sequence[next++];
      faces.filter(function (g) { return dot(g.normal, f.normal) < -0.99; })[0].num = sum - f.num;
    });
  }

  function trapezohedron() {
    var ring = [];
    var h = (1 - Math.cos(Math.PI / 5)) / (1 + Math.cos(Math.PI / 5));
    for (var i = 0; i < 10; i++) {
      var ang = i * Math.PI / 5;
      ring.push([Math.cos(ang), Math.sin(ang), i % 2 ? -h : h]);
    }
    var faces = [];
    for (var k = 0; k < 10; k++) {
      var pole = [0, 0, k % 2 ? 1 : -1];
      faces.push(faceFrom([pole, ring[(k + 9) % 10], ring[k], ring[(k + 1) % 10]], pole));
    }

    return faces;
  }

  var FACE_MAKERS = {
    d4: function () {
      var v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(norm);
      var faces = fromNormals(v, v.map(function (p) { return mul(p, -1); }));
      faces.forEach(function (f, i) { f.num = i + 1; });

      return faces;
    },
    d6: function () {
      var v = signs([[1, 1, 1]]).map(norm);
      var faces = fromNormals(v, [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], 'edge');
      numberOpposite(faces, [1, 2, 3], 7);

      return faces;
    },
    d8: function () {
      var v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      var faces = fromNormals(v, signs([[1, 1, 1]]));
      numberOpposite(faces, [1, 2, 3, 4], 9);

      return faces;
    },
    d10: function () {
      var faces = trapezohedron();
      numberOpposite(faces, [10, 2, 8, 4, 6], 11);

      return faces;
    },
    d12: function () {
      var i = 1 / PHI;
      var v = signs([[1, 1, 1], [0, i, PHI], [i, PHI, 0], [PHI, 0, i]]).map(norm);
      var faces = fromNormals(v, signs([[0, PHI, 1], [1, 0, PHI], [PHI, 1, 0]]));
      numberOpposite(faces, [12, 2, 10, 4, 8, 6], 13);

      return faces;
    },
    d20: function () {
      var i = 1 / PHI;
      var v = signs([[0, 1, PHI], [1, PHI, 0], [PHI, 0, 1]]).map(norm);
      var faces = fromNormals(v, signs([[1, 1, 1], [0, PHI, i], [i, 0, PHI], [PHI, i, 0]]));
      numberOpposite(faces, [20, 8, 14, 2, 11, 17, 5, 3, 15, 9], 21);

      return faces;
    }
  };

  /* size: ingombro rispetto al d20; font: altezza cifra rispetto alla cella.
     I due dadi del d100 sono d10 con scritte diverse. */
  var DIE_TYPES = {
    d4: { shape: 'd4', size: 1.2, font: 0.46, atlas: 1024 },
    d6: { shape: 'd6', size: 0.9, font: 0.5, atlas: 1024 },
    d8: { shape: 'd8', size: 1.05, font: 0.42, atlas: 1024 },
    d10: { shape: 'd10', size: 1.04, font: 0.3, atlas: 1024 },
    d12: { shape: 'd12', size: 0.98, font: 0.44, atlas: 1024 },
    d20: { shape: 'd20', size: 1, font: 0.293, atlas: 2048 },
    d100t: { shape: 'd10', size: 1.04, font: 0.27, atlas: 1024, label: function (n) { return n === 10 ? '00' : n * 10; } },
    d100u: { shape: 'd10', size: 1.04, font: 0.3, atlas: 1024, label: function (n) { return n === 10 ? '0' : n; } }
  };

  function buildGeometry(kind) {
    var type = DIE_TYPES[kind];
    var faces = FACE_MAKERS[type.shape]();
    var cols = Math.ceil(Math.sqrt(faces.length));
    var data = [];
    faces.forEach(function (f, idx) {
      var col = idx % cols, row = Math.floor(idx / cols);
      f.y = f.up;
      f.x = cross(f.y, f.normal);
      var radius = Math.max.apply(null, f.points.map(function (p) { return Math.hypot.apply(null, sub(p, f.center)); }));
      function uvOf(p) {
        var d = sub(p, f.center);

        return [(col + 0.5 + 0.48 * dot(d, f.x) / radius) / cols, (row + 0.5 - 0.48 * dot(d, f.y) / radius) / cols];
      }
      var cUv = uvOf(f.center);
      f.points.forEach(function (p, i) {
        var q = f.points[(i + 1) % f.points.length];
        var edge = norm(sub(q, p));
        var along = dot(sub(f.center, p), edge);
        var apothem = Math.hypot.apply(null, sub(sub(f.center, p), mul(edge, along)));
        var pUv = uvOf(p), qUv = uvOf(q);
        data.push(p[0], p[1], p[2], f.normal[0], f.normal[1], f.normal[2], pUv[0], pUv[1], 1, 1, 0, f.num);
        data.push(q[0], q[1], q[2], f.normal[0], f.normal[1], f.normal[2], qUv[0], qUv[1], 1, 1, 0, f.num);
        data.push(f.center[0], f.center[1], f.center[2], f.normal[0], f.normal[1], f.normal[2], cUv[0], cUv[1], 1, 1, apothem * BEVEL_K, f.num);
      });
    });

    return { kind: kind, faces: faces, cols: cols, data: new Float32Array(data), count: data.length / 12 };
  }

  /* ---------- stato del renderer ---------- */

  var geos = {};
  Object.keys(DIE_TYPES).forEach(function (k) { geos[k] = buildGeometry(k); });
  var gpu = {};
  var attribs = [];
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

  // Le cifre di un dado si disegnano la prima volta che quel dado serve.
  function makeAtlas(kind) {
    var type = DIE_TYPES[kind];
    var g = geos[kind];
    var c = document.createElement('canvas');
    c.width = c.height = type.atlas;
    var x = c.getContext('2d');
    var cell = type.atlas / g.cols;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#fff';
    g.faces.forEach(function (f, idx) {
      var cx = (idx % g.cols + 0.5) * cell;
      var cy = (Math.floor(idx / g.cols) + 0.5) * cell;
      var text = String(type.label ? type.label(f.num) : f.num);
      var font = (text.length >= 2 ? type.font * TWO_DIGIT_RATIO : type.font) * cell;
      x.font = '700 ' + font + 'px Cinzel, serif';
      x.fillText(text, cx, cy);
      // 6 e 9 si distinguono con una lineetta, come sui dadi veri.
      if (!type.label && g.faces.length >= 8 && (f.num === 6 || f.num === 9)) {
        x.fillRect(cx - font * 0.15, cy + font * 0.45, font * 0.3, font * 0.05);
      }
    });
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    }

    return tex;
  }

  // Le cifre sul dado sono in Cinzel: l'atlante aspetta il font, ma non per sempre.
  function buildAtlasWhenFontReady() {
    atlasReady = false;
    var done = function () {
      if (gl && !gl.isContextLost()) {
        gl.uniform1i(uniforms.uTex, 0);
        atlasReady = true;
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
    attribs = [['aP', 3, 0], ['aN', 3, 12], ['aU', 2, 24], ['aB', 3, 32], ['aF', 1, 44]].map(function (a) {
      var loc = gl.getAttribLocation(program, a[0]);
      gl.enableVertexAttribArray(loc);

      return { loc: loc, size: a[1], offset: a[2] };
    });
    Object.keys(geos).forEach(function (kind) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, geos[kind].data, gl.STATIC_DRAW);
      gpu[kind] = { buf: buf, tex: null };
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

  /* Orientamento che porta davanti, dritta, la faccia col numero dato. Guarda
     appena in su per dare volume, ma senza pendere di lato: destra e sinistra
     restano simmetriche. */
  function faceQuat(kind, num) {
    var f = geos[kind].faces.filter(function (g) { return g.num === num; })[0];

    return quatMul(quatAxis([1, 0, 0], DIE_TYPES[kind].tilt || -0.14), mat3ToQuat([f.x, f.y, f.normal]));
  }

  function makeDie(spec, slot) {
    return {
      kind: spec.kind, num: spec.num, target: faceQuat(spec.kind, spec.num),
      x: slot.x, ty: slot.y, scale: slot.scale * DIE_TYPES[spec.kind].size,
      pose: null, from: null, idle: false, phase: Math.random() * 6.28,
      t0: 0, dur: 0, axis1: [1, 0, 0], axis2: [0, 1, 0], spin1: 0, spin2: 0,
      dim: 0, glow: 0
    };
  }

  /* Griglia centrata: da uno a molti dadi, si rimpiccioliscono per starci. */
  var AREA_W = 2.5;
  var AREA_H = 2.1;
  var AREA_Y = 0.05;

  function slotFor(count, i) {
    if (count === 1) {
      return SINGLE_SLOT;
    }
    if (count === 2) {
      return { x: PAIR[i].x, y: 0, scale: PAIR[i].scale };
    }
    var cols = Math.ceil(Math.sqrt(count * AREA_W / AREA_H));
    var rows = Math.ceil(count / cols);
    var cell = Math.min(AREA_W / cols, AREA_H / rows);
    var row = Math.floor(i / cols);
    var inRow = row < rows - 1 ? cols : count - cols * (rows - 1);
    var col = i - row * cols;

    return {
      x: (col - (inRow - 1) / 2) * cell,
      y: AREA_Y + ((rows - 1) / 2 - row) * cell,
      scale: Math.min(0.62, cell * 0.46)
    };
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
    if (d.held) {
      return { q: d.held, y: 0, scale: d.scale * GRAB_SCALE };
    }
    var pose = freePose(d, now);
    if (d.back) {
      var k = (now - d.back.t0) / GRAB_BACK_MS;
      if (k >= 1) {
        d.back = null;
      } else {
        var eased = 1 - Math.pow(1 - Math.max(0, k), 3);
        pose.q = quatLerp(d.back.from, pose.q, eased);
        pose.scale *= 1 + (GRAB_SCALE - 1) * (1 - eased);
      }
    }

    return pose;
  }

  function freePose(d, now) {
    if (d.idle) {
      if (reducedMotion) {
        return { q: d.target, y: 0, scale: d.scale };
      }

      return {
        q: quatMul(quatAxis([0, 1, 0], now * 0.00045 + d.phase), quatMul(quatAxis([1, 0, 0], Math.sin(now * 0.0007 + d.phase) * 0.25), d.target)),
        y: Math.sin(now * 0.0016 + d.phase) * 0.03,
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
      y: bounce * 0.34 * Math.min(1, d.scale / 0.5),
      scale: d.scale * (1 + 0.26 * bounce + 0.14 * Math.pow(1 - t, 3))
    };
  }

  function draw(now) {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var bound = null;
    dice.forEach(function (d) {
      var pose = poseOf(d, now);
      d.pose = pose.q;
      var res = gpu[d.kind];
      if (bound !== d.kind) {
        gl.bindBuffer(gl.ARRAY_BUFFER, res.buf);
        attribs.forEach(function (a) {
          gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, 48, a.offset);
        });
        res.tex = res.tex || makeAtlas(d.kind);
        gl.bindTexture(gl.TEXTURE_2D, res.tex);
        bound = d.kind;
      }
      gl.uniformMatrix3fv(uniforms.uR, false, quatToMat3(pose.q));
      gl.uniform3f(uniforms.uT, d.x, d.ty + pose.y, -CAMERA_DIST);
      gl.uniform1f(uniforms.uS, pose.scale);
      gl.uniform1f(uniforms.uFace, d.num);
      gl.uniform1f(uniforms.uDim, d.dim);
      gl.uniform1f(uniforms.uGlow, d.glow);
      gl.drawArrays(gl.TRIANGLES, 0, geos[d.kind].count);
    });
  }

  function isAnimating() {
    return !!pending || !!fade || dice.some(function (d) {
      return d.held || d.back || (d.idle && !reducedMotion);
    });
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
        var counts = fade.kept == null || i === fade.kept;
        d.glow = counts ? k : 0;
        d.dim = counts ? 0 : k;
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

  // specs: numero di dadi (d20) oppure elenco di { kind }.
  function setIdle(specs) {
    var list = typeof specs === 'number'
      ? new Array(specs).fill(0).map(function () { return { kind: 'd20' }; })
      : specs;
    pending = null;
    fade = null;
    dice = list.map(function (spec, i) {
      var d = makeDie({ kind: spec.kind, num: maxFace(spec.kind) }, slotFor(list.length, i));
      d.idle = true;

      return d;
    });
    if (fallbackEl) {
      fallbackEl.textContent = typeof specs === 'number' ? '20' : '';
      fallbackEl.classList.remove('dim');
    }
    kick();
  }

  function maxFace(kind) {
    return Math.max.apply(null, geos[kind].faces.map(function (f) { return f.num; }));
  }

  // Rimette i dadi fermi su un risultato già tirato, senza animazione.
  function setResult(values, keep) {
    pending = null;
    fade = null;
    dice = values.map(function (v, i) {
      var d = makeDie(typeof v === 'number' ? { kind: 'd20', num: v } : v, slotFor(values.length, i));
      var counts = keep == null || i === keep;
      d.glow = counts ? 1 : 0;
      d.dim = counts ? 0 : 1;

      return d;
    });
    if (fallbackEl) {
      fallbackEl.textContent = keep == null ? '' : String(values[keep]);
    }
    kick();
  }

  // Il dito prende il dado così com'è in quel momento.
  function grab() {
    dice.forEach(function (d) {
      d.held = d.pose || d.target;
      d.back = null;
    });
    kick();
  }

  // Trascinando, il dado rotola sotto il dito (dx, dy in pixel di schermo).
  function dragBy(dx, dy) {
    var len = Math.hypot(dx, dy);
    if (!len) {
      return;
    }
    var turn = quatAxis([dy / len, dx / len, 0], len * GRAB_ROTATION);
    dice.forEach(function (d) {
      if (d.held) {
        d.held = quatMul(turn, d.held);
      }
    });
  }

  // Il dito lascia il dado: torna morbido alla posa di prima, senza tirare.
  function release() {
    var now = performance.now();
    dice.forEach(function (d) {
      if (d.held) {
        d.back = { from: d.held, t0: now };
        d.held = null;
      }
    });
    kick();
  }

  /* values: i d20 estratti (numeri) o { kind, num } per gli altri dadi; keep:
     indice di quello che conta, null se contano tutti; only: se
     presente, si anima solo quel dado (ritiro di uno dei due); fling: se
     presente, verso e forza del gesto { vx, vy, power } cambiano solo
     l'animazione, il numero è già deciso. */
  function throwDice(values, keep, done, only, fling) {
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
      var d = makeDie(typeof v === 'number' ? { kind: 'd20', num: v } : v, slotFor(values.length, i));
      var stagger = only != null || reduced ? 0 : i * Math.min(1, STAGGER_MAX / values.length);
      d.from = old ? old.pose : null;
      d.t0 = now + stagger * 90;
      d.dur = total + stagger * 120;
      d.axis1 = randomAxis();
      d.axis2 = randomAxis();
      d.spin1 = (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 6);
      d.spin2 = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
      if (fling) {
        var speed = Math.hypot(fling.vx, fling.vy);
        d.axis1 = norm([fling.vy / speed, fling.vx / speed, FLING_AXIS_TILT]);
        // L'angolo scende verso zero: col segno negativo gira nel verso del dito.
        d.spin1 = -(FLING_SPIN_BASE + FLING_SPIN_POWER * fling.power);
      }
      longest = Math.max(longest, stagger * 90 + d.dur);

      return d;
    });
    if (!gl) {
      fallbackEl.textContent = keep == null ? '' : String(values[keep]);
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
    setResult: setResult,
    grab: grab,
    dragBy: dragBy,
    release: release,
    redraw: kick,
    isReducedMotion: function () { return reducedMotion; }
  };
})();
