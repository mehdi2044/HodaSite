/* =====================================================================
   MODA4 "From the rail to you" — reference engine for M4-02
   Pure DOM + Web Animations. One master timeline per look so that
   pause / out-of-view / tab-hidden freeze every animation at once.
   Port 1:1 into components/storefront/fitting-ad-motion.tsx.
   ===================================================================== */
(function (g) {
  var SCENES = {
    wide:    { w: 1100, rail: { left: 40, width: 560 }, model: { left: 660, top: 40, w: 420, h: 560 } },
    compact: { w: 720,  rail: { left: 24, width: 300 }, model: { left: 300, top: 40, w: 420, h: 560 } }
  };
  // rack width per cutout slot (prototype values: knit 118, shirt 120, tee 116, coat 80, bag 92, trousers 72, chino 66)
  var SLOT_W = { TOP: 118, ONE_PIECE: 110, LAYER: 84, BOTTOM: 70, ACCESSORY: 90, SHOES: 70 };
  var SLOT_Z = { BOTTOM: 5, SHOES: 5, ONE_PIECE: 6, TOP: 6, LAYER: 7, ACCESSORY: 8 };
  var ORDER = ['BOTTOM', 'SHOES', 'ONE_PIECE', 'TOP', 'LAYER', 'ACCESSORY'];
  // Timeline (ms) — prototype play(): 700 lead, 1250 stagger, 1500 flight, 600 settle, 1200 scan, 900 reveal, 3600 hold
  var TL = { lead: 700, stagger: 1250, flight: 1500, hangerDelay: 500, hangerFade: 500, settle: 600, scan: 1200, revealAt: 1100, fade: 500, reveal: 900, ready: 600, readyDelay: 400, hold: 3600 };
  var EASE = 'cubic-bezier(.45,.05,.2,1)';
  var HANGER = '<svg class="hang" viewBox="0 0 64 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M32 14a5 5 0 1 1 5-5c0 3-5 4-5 8L5 36h54L32 17"/></svg>';

  /** A look is playable only if every piece has a cutout layer and the scene resolved without a reason. */
  function playable(look) { return !look.reason && look.pieces.length >= 2 && look.pieces.every(function (p) { return p.cutout && p.target; }); }

  function mount(root, data) {
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var looks = data.looks.filter(playable);
    var box = root.querySelector('.m4-scene-box');
    var state = looks.length ? 'animated' : (data.looks.some(function (l) { return l.finalPhoto; }) ? 'static' : 'copy-only');
    root.dataset.state = state;
    renderChips(root, looks, data);
    if (state !== 'animated') { renderFallback(root, data, state); return { state: state }; }

    var compact = matchMedia('(max-width:760px)').matches;
    var S = SCENES[compact ? 'compact' : 'wide'];
    box.dataset.scene = compact ? 'compact' : 'wide';
    var scene = box.querySelector('.m4-scene');
    function fit() { var k = box.clientWidth / S.w; scene.style.setProperty('--k', k > 0 ? k : 1); }
    if (g.ResizeObserver) new ResizeObserver(fit).observe(box); fit();

    var rack = scene.querySelector('.m4-rack'), model = scene.querySelector('.m4-model'), step = scene.querySelector('.m4-step');
    var scan = scene.querySelector('.m4-scan'), reveal = scene.querySelector('.m4-reveal'), ready = scene.querySelector('.m4-ready');
    var idx = 0, anims = [], master = null, paused = false, inView = false, flying = [], els = {};

    function rackItems() {
      // wide: union of every playable look's pieces (rich rack, as in the prototype); compact: active look only
      var src = compact ? looks[idx].pieces : looks.reduce(function (a, l) { return a.concat(l.pieces); }, []);
      var seen = {}, out = [];
      src.forEach(function (p) { if (!seen[p.key]) { seen[p.key] = 1; out.push(p); } });
      return out;
    }
    function buildRack() {
      [].slice.call(rack.querySelectorAll('.m4-garm')).forEach(function (n) { n.remove(); });
      els = {};
      var items = rackItems(), n = items.length, inner = S.rail.width - 20;
      var widths = items.map(function (p) { return SLOT_W[p.slot] || 90; });
      var step = n > 1 ? (inner - widths[n - 1]) / (n - 1) : 0;
      items.forEach(function (p, i) {
        var el = document.createElement('div');
        el.className = 'm4-garm' + (reduce ? '' : ' sway');
        el.style.left = Math.round(10 + i * step) + 'px'; el.style.width = widths[i] + 'px';
        el.style.animationDelay = (-(i * 0.57) % 4) + 's';
        el.innerHTML = HANGER + '<img src="' + p.cutout + '" alt="">';
        el.dataset.key = p.key; el._w = widths[i];
        rack.appendChild(el); els[p.key] = el;
      });
    }
    function sceneRect(el) {
      var sc = scene.getBoundingClientRect(), r = el.getBoundingClientRect(), k = sc.width / S.w;
      return { x: (r.left + r.width / 2 - sc.left) / k, y: (r.top - sc.top) / k, w: r.width / k };
    }
    function stop() {
      anims.forEach(function (a) { a.cancel(); }); anims = [];
      flying.forEach(function (f) { f.remove(); }); flying = [];
      if (master) { master.cancel(); master = null; }
    }
    function anim(el, frames, opt) { var a = el.animate(frames, Object.assign({ fill: 'both' }, opt)); if (paused || !inView) a.pause(); anims.push(a); return a; }
    function setStep(t) { step.textContent = t; }

    function play() {
      stop(); buildRack();
      var look = looks[idx];
      model.style.opacity = 1;
      reveal.querySelector('img').src = look.finalPhoto || look.compositePreview || '';
      reveal.style.opacity = 0; ready.style.opacity = 0;
      setStep('01 — PICK');
      var pieces = look.pieces.slice().sort(function (a, b) { return ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot); });
      if (reduce) return finalState(look, pieces);
      var t = TL.lead, labels = [[0, '01 — PICK']];
      pieces.forEach(function (p, i) {
        var src = els[p.key]; if (!src) return;
        var from = sceneRect(src);
        var tgt = { x: S.model.left + p.target.cx * S.model.w, y: S.model.top + p.target.top * S.model.h, w: p.target.w * S.model.w };
        var k = tgt.w / src._w, dx = tgt.x - from.x, dy = tgt.y - 38 * k - from.y;   // 38px = hanger height above the garment
        var fly = document.createElement('div');
        fly.className = 'm4-fly'; fly.innerHTML = HANGER + '<img src="' + p.cutout + '" alt="">';
        fly.style.left = (from.x - src._w / 2) + 'px'; fly.style.top = from.y + 'px'; fly.style.width = src._w + 'px';
        fly.style.zIndex = SLOT_Z[p.slot] || 6; fly.style.opacity = 0;
        scene.appendChild(fly); flying.push(fly);
        anim(src, [{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: t });
        anim(fly, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: t });
        anim(fly, [
          { transform: 'translate(0,0) rotateY(-24deg) scale(1)', offset: 0 },
          { transform: 'translate(0,-70px) rotateY(0deg) scale(1.08)', offset: .22 },
          { transform: 'translate(' + dx * .55 + 'px,' + (dy - 160) + 'px) rotateY(200deg) rotateZ(-6deg) scale(' + (1 + k) / 2 + ')', offset: .62 },
          { transform: 'translate(' + dx + 'px,' + dy + 'px) rotateY(360deg) scale(' + k + ')', offset: 1 }
        ], { duration: TL.flight, delay: t, easing: EASE });
        anim(fly.querySelector('.hang'), [{ opacity: 1 }, { opacity: 0 }], { duration: TL.hangerFade, delay: t + TL.hangerDelay });
        labels.push([t, '0' + (i + 1) + ' — DRESS']);
        t += TL.stagger;
      });
      t += TL.settle;
      labels.push([t, '04 — STYLE']);
      anim(scan, [{ top: '30px', opacity: 1 }, { top: '470px', opacity: 1 }], { duration: TL.scan, delay: t, easing: 'ease-in-out', fill: 'none' });
      t += TL.revealAt;
      flying.forEach(function (f) { anim(f, [{ opacity: 1 }, { opacity: 0 }], { duration: TL.fade, delay: t }); });
      anim(model, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, delay: t });
      anim(reveal, [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: TL.reveal, delay: t });
      anim(ready, [{ opacity: 0 }, { opacity: 1 }], { duration: TL.ready, delay: t + TL.readyDelay });
      labels.push([t, '05 — YOUR LOOK']);
      var total = t + TL.hold;
      master = document.body.animate([{ opacity: 1 }, { opacity: 1 }], { duration: total });   // clock only
      if (paused || !inView) master.pause();
      var raf = function () {
        if (!master) return;
        var ct = master.currentTime || 0, l = labels[0][1];
        labels.forEach(function (x) { if (ct >= x[0]) l = x[1]; });
        if (step.textContent !== l) setStep(l);
        if (master.playState !== 'finished') requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
      master.onfinish = function () { if (looks.length > 1) { idx = (idx + 1) % looks.length; syncChips(); } play(); };
    }
    function finalState(look, pieces) {
      // reduced motion: no flight, no sway, no auto-advance — show the finished look
      setStep('05 — YOUR LOOK');
      pieces.forEach(function (p) { if (els[p.key]) els[p.key].style.opacity = 0; });
      if (look.finalPhoto || look.compositePreview) { model.style.opacity = 0; reveal.style.opacity = 1; reveal.style.transform = 'none'; ready.style.opacity = 1; }
    }
    function setPaused(v) {
      paused = v; root.querySelector('[data-fit-pause]').setAttribute('aria-pressed', String(v));
      anims.concat(master ? [master] : []).forEach(function (a) { (paused || !inView) ? a.pause() : a.play(); });
    }
    function syncChips() { [].forEach.call(root.querySelectorAll('[data-look]'), function (b) { b.setAttribute('aria-pressed', String(+b.dataset.look === idx)); }); }
    [].forEach.call(root.querySelectorAll('[data-look]'), function (b) { b.addEventListener('click', function () { idx = +b.dataset.look; syncChips(); play(); }); });
    var rp = root.querySelector('[data-fit-replay]'); if (rp) rp.addEventListener('click', function () { play(); });
    var pz = root.querySelector('[data-fit-pause]'); if (pz) pz.addEventListener('click', function () { setPaused(!paused); });
    new IntersectionObserver(function (es) { inView = es.some(function (e) { return e.isIntersecting; }); setPaused(paused); }, { threshold: .35 }).observe(root);
    document.addEventListener('visibilitychange', function () { inView = !document.hidden && inView; setPaused(paused); });
    syncChips(); play();
    return { state: state, seek: function (ms) { anims.concat(master ? [master] : []).forEach(function (a) { a.pause(); a.currentTime = ms; }); }, play: play };
  }

  function renderChips(root, looks, data) {
    var sets = root.querySelector('.m4-fit-sets');
    if (!looks.length) { sets.hidden = true; return; }
    sets.innerHTML = looks.map(function (l, i) { return '<button type="button" class="chip" data-look="' + i + '" aria-pressed="' + (i === 0) + '">' + l.label + '</button>'; }).join('') +
      '<button type="button" class="chip" data-fit-replay><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/></svg>' + data.t.replay + '</button>' +
      '<button type="button" class="chip icon" data-fit-pause aria-pressed="false" aria-label="' + data.t.pause + '"><svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg></button>';
  }
  function renderFallback(root, data, state) {
    var box = root.querySelector('.m4-scene-box');
    var photo = (data.looks.find(function (l) { return l.finalPhoto; }) || {}).finalPhoto;
    box.outerHTML = state === 'static'
      ? '<figure class="m4-static" data-moda4="fitting-ad-static"><img src="' + photo + '" alt="' + data.t.staticAlt + '"><figcaption><span>' + data.t.stylingOnly + '</span></figcaption></figure>'
      : '<img class="m4-fit-sketch" data-moda4="fitting-ad-static" src="' + data.mannequin + '" alt="">';
  }
  g.MODA4FittingAd = { mount: mount, playable: playable, TL: TL };
})(window);
