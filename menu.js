/* ORO menu renderer — builds the nav strip + sections from menu.json,
   then wires up the existing scroll/nav interactions. Pure vanilla JS, no deps.
   The menu CONTENT lives in menu.json (edited via Pages CMS); this file is the
   presentation layer and rarely needs touching. */
(function () {
  'use strict';

  // --- helpers -------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // Normalise an uploaded media path to a page-relative one (strip leading slash
  // so it resolves under the /oro-menu/ project-pages base path).
  function relPath(p) { return String(p || '').replace(/^\/+/, ''); }

  function price(p) {
    return '<div class="price">' + esc(p) + '<span class="unit">LYD</span></div>';
  }

  // --- render pieces -------------------------------------------------------
  function renderItem(it) {
    var cls = 'item' + (it.featured ? ' featured' : '') + (it.twoPrice ? ' two-price' : '');
    var name = '<div class="name"><span class="ar">' + esc(it.ar) + '</span>' +
               '<span class="en">' + esc(it.en) + '</span>' +
               (it.note ? '<span class="note">' + esc(it.note) + '</span>' : '') +
               '</div>';
    var prices = it.twoPrice
      ? price(it.priceSmall) + price(it.priceLarge)
      : price(it.price);
    return '<li class="' + cls + '">' + name + prices + '</li>';
  }

  function renderGroup(g) {
    var out = '';
    if (g.subcatAr || g.subcatEn) {
      var variant = g.variant === 'en' ? ' en' : ' ar';
      var label = [g.subcatAr, g.subcatEn].filter(Boolean).join(' · ');
      out += '<div class="subcat' + variant + '">' + esc(label) + '</div>';
    }
    out += '<ul class="item-list">' + (g.items || []).map(renderItem).join('') + '</ul>';
    return out;
  }

  function renderSizeRow(sr) {
    if (!sr) return '';
    function tag(ar, en) {
      return '<span class="size-tag">' + esc(ar) +
             '<br><small style="font-size:9px;letter-spacing:.2em;">' + esc(en) + '</small></span>';
    }
    return '<div class="size-row"><span></span>' +
           tag(sr.smallAr, sr.smallEn) + tag(sr.largeAr, sr.largeEn) + '</div>';
  }

  function renderMedia(m) {
    if (m.type === 'video') {
      var poster = m.poster ? ' poster="img/' + esc(m.poster) + '.jpg"' : '';
      var dims = (m.width ? ' width="' + esc(m.width) + '"' : '') +
                 (m.height ? ' height="' + esc(m.height) + '"' : '');
      return '<video src="img/' + esc(m.base) + '.mp4"' + poster +
             ' autoplay loop muted playsinline preload="metadata"' + dims +
             ' aria-label="' + esc(m.alt) + '"></video>';
    }
    var dims2 = (m.width ? ' width="' + esc(m.width) + '"' : '') +
                (m.height ? ' height="' + esc(m.height) + '"' : '');
    // A custom uploaded image (m.image) wins; otherwise use the webp+png base pair.
    if (m.image) {
      return '<img src="' + esc(relPath(m.image)) + '" alt="' + esc(m.alt) +
             '" loading="lazy" decoding="async"' + dims2 + ' />';
    }
    return '<picture><source srcset="img/' + esc(m.base) + '.webp" type="image/webp" />' +
           '<img src="img/' + esc(m.base) + '.png" alt="' + esc(m.alt) +
           '" loading="lazy" decoding="async"' + dims2 + ' /></picture>';
  }

  function renderSection(s) {
    var cls = 'menu-section ' + esc(s.theme) + ' pattern-bg' + (s.theme === 'light' ? ' light' : '');
    var head = '';
    if (s.showHead && s.title) {
      head = '<div class="section-head">' +
               '<div class="line"></div>' +
               '<div class="title-block">' +
                 '<h2 class="ar-title">' + esc(s.title.ar) + '</h2>' +
                 '<div class="en-title">' + esc(s.title.en) + '</div>' +
               '</div>' +
               '<div class="line right"></div>' +
             '</div>';
    }
    var photo = '<div class="photo-cell">' +
                  '<div class="frame">' + renderMedia(s.media) + '</div>' +
                  '<div class="caption">' + esc(s.media.caption) + '</div>' +
                '</div>';
    var items = '<div class="items-cell">' +
                  renderSizeRow(s.sizeRow) +
                  (s.groups || []).map(renderGroup).join('') +
                '</div>';
    var grid = '<div class="menu-grid' + (s.flip ? ' flip' : '') + '">' + photo + items + '</div>';
    return '<section id="' + esc(s.id) + '" class="' + cls + '">' +
             '<div class="container">' + head + grid + '</div>' +
           '</section>';
  }

  function renderNav(n) {
    return '<a href="#' + esc(n.href) + '">' +
             '<span class="nav-ar">' + esc(n.ar) + '</span>' +
             '<span class="nav-en">' + esc(n.en) + '</span>' +
           '</a>';
  }

  function render(data) {
    var navEl = document.querySelector('.category-scroll');
    var secEl = document.getElementById('sections');
    if (navEl) navEl.innerHTML = (data.nav || []).map(renderNav).join('');
    if (secEl) secEl.innerHTML = (data.sections || []).map(renderSection).join('');
  }

  // --- interactions (run AFTER render, since they read the DOM) -------------
  function initInteractions() {
    // Smooth-scroll with sticky offset
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length < 2) return;
        var el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        var top = el.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });

    // Active category highlight in sticky strip
    var strip = document.querySelector('.category-scroll');
    var links = strip ? [].slice.call(strip.querySelectorAll('a')) : [];
    var sections = links.map(function (l) { return document.querySelector(l.getAttribute('href')); })
                        .filter(Boolean);
    var lastIdx = -1;
    var ticking = false;

    var tick = function () {
      ticking = false;
      var y = window.scrollY + 140;
      var idx = 0;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i] && sections[i].offsetTop <= y) idx = i;
      }
      if (idx === lastIdx) return;
      if (lastIdx >= 0 && links[lastIdx]) links[lastIdx].classList.remove('active');
      if (links[idx]) {
        links[idx].classList.add('active');
        var linkLeft = links[idx].offsetLeft;
        var linkRight = linkLeft + links[idx].offsetWidth;
        var view = strip.scrollLeft;
        var viewRight = view + strip.clientWidth;
        if (linkLeft < view + 40 || linkRight > viewRight - 40) {
          strip.scrollTo({ left: Math.max(0, linkLeft - 40), behavior: 'smooth' });
        }
      }
      lastIdx = idx;
    };

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(tick);
    }, { passive: true });

    tick();

    // Scroll-affordance: toggle edge fades + chevrons based on category-scroll position
    var stripWrap = document.querySelector('.category-strip');
    if (strip && stripWrap) {
      var updateAffordance = function () {
        var canLeft = strip.scrollLeft > 4;
        var canRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4;
        stripWrap.classList.toggle('can-scroll-left', canLeft);
        stripWrap.classList.toggle('can-scroll-right', canRight);
      };
      strip.addEventListener('scroll', updateAffordance, { passive: true });
      window.addEventListener('resize', updateAffordance);
      updateAffordance();

      // One-time auto-scroll hint on page load (only if there's right overflow)
      if (!sessionStorage.getItem('oroNavHinted') && strip.scrollWidth > strip.clientWidth) {
        sessionStorage.setItem('oroNavHinted', '1');
        setTimeout(function () {
          var original = strip.scrollLeft;
          strip.scrollTo({ left: original + 70, behavior: 'smooth' });
          setTimeout(function () { strip.scrollTo({ left: original, behavior: 'smooth' }); }, 650);
        }, 1000);
      }

      // Allow tapping chevrons to scroll
      document.querySelectorAll('.category-strip .chevron').forEach(function (ch) {
        ch.style.pointerEvents = 'auto';
        ch.style.cursor = 'pointer';
        ch.addEventListener('click', function () {
          var dir = ch.classList.contains('right') ? 1 : -1;
          strip.scrollBy({ left: dir * strip.clientWidth * 0.6, behavior: 'smooth' });
        });
      });
    }
  }

  // --- boot ----------------------------------------------------------------
  fetch('menu.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) { render(data); initInteractions(); })
    .catch(function (err) {
      console.error('Menu failed to load:', err);
      var s = document.getElementById('sections');
      if (s) {
        s.innerHTML = '<p style="text-align:center;padding:80px 20px;color:#ead9d6;' +
          'font-family:\'Cormorant Garamond\',serif;font-size:22px;">' +
          'Our menu is temporarily unavailable. Please refresh the page.</p>';
      }
    });
})();
