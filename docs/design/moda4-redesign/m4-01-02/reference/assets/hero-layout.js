/* =====================================================================
   MODA4 Hero layout guard + audit (reference for M4-01)
   - layoutHeroSlide(slide): resolves label sides, hides pins that would
     touch the copy, positions the float in the free gutter, and turns on
     the price strip whenever any price is not visible as a label.
   - auditHero(hero): returns every rule violation for the ACTIVE slide.
     The same function is meant to be used by Playwright (page.evaluate).
   Framework-free on purpose: port 1:1 into a React client hook.
   ===================================================================== */
(function (g) {
  var GAP = { copy: 16, label: 6, edge: 8, float: 24 };
  function rect(el, base) {
    var r = el.getBoundingClientRect();
    return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top };
  }
  function grow(a, d) { return { l: a.l - d, t: a.t - d, r: a.r + d, b: a.b + d }; }
  function hit(a, b) { return !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; }
  function inside(a, W, H, m) { return a.l >= m && a.t >= m && a.r <= W - m && a.b <= H - m; }
  function visible(el) { return el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; }
  function mode() {
    var w = innerWidth, portrait = matchMedia('(orientation:portrait)').matches;
    if (w <= 760) return 'A';
    if (w <= 1099 && portrait) return 'B';
    if (w <= 1279) return 'C';
    return 'D';
  }
  function chrome(slide, base) {
    // header + announcement occupy the top of the hero (header overlays it)
    var hdr = document.querySelector('[data-moda4=header]');
    var hb = hdr ? hdr.getBoundingClientRect().bottom - base.top : 0;
    var ui = slide.closest('[data-moda4=hero]').querySelector('[data-moda4=hero-progress]');
    return { header: { l: 0, t: -9999, r: base.width, b: hb }, ui: ui && visible(ui) ? rect(ui.closest('.moda-carousel-controls') || ui.closest('.m4-ui .wrap') || ui, base) : null };
  }

  function layoutHeroSlide(slide) {
    var base = slide.getBoundingClientRect(), W = base.width, H = base.height, M = mode();
    if (!W || !H) return;
    var copyEl = slide.querySelector('[data-moda4=hero-copy]');
    var copy = grow(rect(copyEl, base), GAP.copy);
    var ch = chrome(slide, base);
    var side = slide.dataset.copySide;                         // physical: 'left' | 'right'
    var away = side === 'right' ? 'left' : 'right';
    var stacked = M === 'A' || M === 'B';
    var needStrip = stacked;
    var placed = [];                                           // occupied label rects
    var pins = [].slice.call(slide.querySelectorAll('[data-moda4=hero-pin]'));
    pins.forEach(function (pin) { pin.hidden = false; pin.dataset.label = away; pin.style.removeProperty('--nudge'); });
    var copyTop = rect(copyEl, base).t;

    pins.forEach(function (pin) {
      var dot = rect(pin.querySelector('.m4-dot'), base);
      var dotBox = grow(dot, 7);                              // 44px hit area
      var bad = hit(dotBox, copy) || hit(dotBox, ch.header) || hit(dotBox, ch.ui) || !inside(dotBox, W, H, GAP.edge) ||
                (stacked && dotBox.b > copyTop - 12);
      if (bad) { pin.hidden = true; needStrip = true; return; }
      if (stacked) { pin.dataset.label = 'none'; return; }
      var tag = pin.querySelector('.m4-tag'), ok = false;
      var tries = [[away, 0], [side, 0], [away, -34], [away, 34], [side, -34], [side, 34]];
      for (var i = 0; i < tries.length && !ok; i++) {
        pin.dataset.label = tries[i][0];
        tag.style.marginTop = tries[i][1] + 'px';
        var t = grow(rect(tag, base), GAP.label);
        ok = !hit(t, copy) && !hit(t, ch.header) && !hit(t, ch.ui) && inside(t, W, H, GAP.edge) &&
             !placed.some(function (p) { return hit(t, p); });
        if (ok) placed.push(t);
      }
      if (!ok) { pin.dataset.label = 'none'; tag.style.marginTop = '0px'; needStrip = true; }
      placed.push(grow(dot, GAP.label));
    });

    var fl = slide.querySelector('[data-moda4=hero-float]');
    if (fl) {
      fl.hidden = M !== 'D';
      if (M === 'D') {
        var subj = rect(slide.querySelector('[data-moda4=hero-subject]'), base);
        var w = fl.getBoundingClientRect().width;
        var x = side === 'right' ? subj.r - 0.2 * w : subj.l + 0.2 * w - w;  // may overlap the subject edge by 20%
        fl.style.left = Math.round(x) + 'px';
        var clash = true, ys = [0.46, 0.30, 0.58];            // preferred vertical slots (prototype: 40–46%)
        for (var k = 0; k < ys.length && clash; k++) {
          fl.style.top = Math.round(H * ys[k]) + 'px';
          var f = grow(rect(fl, base), 0), cap = fl.querySelector('figcaption');
          if (cap) { var c = rect(cap, base); f = { l: Math.min(f.l, c.l), t: f.t, r: Math.max(f.r, c.r), b: Math.max(f.b, c.b) }; }
          clash = hit(grow(f, GAP.float - GAP.copy), copy) || hit(f, ch.ui) || !inside(f, W, H, GAP.edge) ||
                  placed.some(function (p) { return hit(f, p); });
        }
        fl.hidden = clash;
      }
    }
    slide.dataset.strip = needStrip ? 'on' : 'off';
    slide.dataset.mode = M;
  }

  /* ----------------------------- audit ----------------------------- */
  function auditHero(hero) {
    hero = hero || document.querySelector('[data-moda4=hero]');
    var slide = hero.querySelector('[data-moda4=hero-slide].is-active');
    var base = slide.getBoundingClientRect(), W = base.width, H = base.height, M = mode(), out = [];
    var stacked = M === 'A' || M === 'B';
    function v(id, msg) { out.push({ id: id, mode: M, slide: slide.dataset.slide, msg: msg }); }
    var copyEl = slide.querySelector('[data-moda4=hero-copy]'), copy = rect(copyEl, base);
    var ch = chrome(slide, base);
    var subj = rect(slide.querySelector('[data-moda4=hero-subject]'), base);
    var title = slide.querySelector('[data-moda4=hero-title]');
    // H-01 copy never overlaps the person (side-by-side modes)
    if (!stacked && hit(grow(copy, GAP.copy), subj)) v('H-01', 'copy box overlaps subject');
    // H-02 copy inside the hero, below the header, above the controls
    if (!inside(copy, W, H, 0)) v('H-02', 'copy box leaves the hero');
    if (hit(copy, ch.header)) v('H-02', 'copy box under header');
    if (ch.ui && hit(copy, ch.ui)) v('H-02', 'copy box overlaps controls');
    // H-03 title not clipped, and minimum size
    if (title.scrollWidth > title.clientWidth + 1) v('H-03', 'title clipped horizontally');
    var fs = parseFloat(getComputedStyle(title).fontSize);
    if (fs < (M === 'A' ? 40 : 52)) v('H-03', 'title font-size ' + fs);
    var fw = getComputedStyle(title).fontWeight;
    if (fw !== '400') v('H-03', 'title weight ' + fw + ' (expected 400)');
    // H-04 pins: visible dots/labels never touch copy, header, controls, each other, or leave the hero
    var boxes = [], visiblePins = 0, total = 0, labelled = 0;
    [].slice.call(slide.querySelectorAll('[data-moda4=hero-pin]')).forEach(function (pin) {
      total++;
      if (pin.hidden || !visible(pin.querySelector('.m4-dot'))) return;
      visiblePins++;
      var d = rect(pin.querySelector('.m4-dot'), base);
      [['dot', d]].concat(visible(pin.querySelector('.m4-tag')) ? [['label', rect(pin.querySelector('.m4-tag'), base)]] : []).forEach(function (p) {
        if (p[0] === 'label') labelled++;
        if (hit(p[1], copy)) v('H-04', 'pin ' + pin.dataset.n + ' ' + p[0] + ' overlaps copy');
        if (hit(p[1], ch.header)) v('H-04', 'pin ' + pin.dataset.n + ' ' + p[0] + ' under header');
        if (ch.ui && hit(p[1], ch.ui)) v('H-04', 'pin ' + pin.dataset.n + ' ' + p[0] + ' overlaps controls');
        if (!inside(p[1], W, H, 0)) v('H-04', 'pin ' + pin.dataset.n + ' ' + p[0] + ' outside hero');
        boxes.forEach(function (b) { if (hit(p[1], b[1])) v('H-04', 'pin ' + pin.dataset.n + ' ' + p[0] + ' overlaps ' + b[0]); });
        boxes.push(['pin ' + pin.dataset.n + ' ' + p[0], p[1]]);
      });
    });
    // H-05 float: only in mode D, never over copy / pins / controls
    var fl = slide.querySelector('[data-moda4=hero-float]');
    if (fl && visible(fl)) {
      if (M !== 'D') v('H-05', 'float visible outside desktop mode');
      var f = rect(fl, base);
      if (hit(grow(f, GAP.float), copy)) v('H-05', 'float within 24px of copy');
      boxes.forEach(function (b) { if (hit(f, b[1])) v('H-05', 'float overlaps ' + b[0]); });
      if (ch.ui && hit(f, ch.ui)) v('H-05', 'float overlaps controls');
    }
    // H-06 every priced garment is readable somewhere on the slide (owner rule 2026-10-14)
    var strip = slide.querySelector('[data-moda4=hero-prices]');
    var stripOn = strip && visible(strip);
    if (labelled < total && !stripOn) v('H-06', (total - labelled) + ' garment price(s) not readable');
    if (stripOn) {
      if (strip.querySelectorAll('li').length !== total) v('H-06', 'price strip does not list every garment');
      if (!inside(rect(strip, base), W, H, 0) || strip.scrollWidth > strip.clientWidth + 1) v('H-06', 'price strip clipped');
      [].slice.call(strip.querySelectorAll('li')).forEach(function (li) { if (!inside(rect(li, base), W, H, 0) || li.getBoundingClientRect().right > strip.getBoundingClientRect().right + 1 || li.getBoundingClientRect().left < strip.getBoundingClientRect().left - 1) v('H-06', 'price chip clipped'); });
    }
    // H-07 CTA fully visible and ≥ 44px
    [].slice.call(copyEl.querySelectorAll('[data-moda4-cta]')).forEach(function (a) {
      var r = rect(a, base);
      if (!inside(r, W, H, 0)) v('H-07', 'CTA clipped');
      if (r.b - r.t < 44) v('H-07', 'CTA below 44px');
    });
    return { mode: M, slide: slide.dataset.slide, violations: out, stats: { pins: total, visiblePins: visiblePins, labelled: labelled, strip: !!stripOn } };
  }

  g.MODA4Hero = { layoutHeroSlide: layoutHeroSlide, auditHero: auditHero, mode: mode };
})(window);
