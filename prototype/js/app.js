/* app.js —— 原型交互：目录 → 组内诗目 → 诗页 → 笔记按需展开 + 跨组搜索。
 *
 * 设计约束（对应 CONTEXT 与内容契约 v0）：
 *   - 数据只读 dist/content.json 那个形状；本文件不解析 Markdown 源文件；
 *   - 分组只显示有内容的组，组内先按作者、再按诗名排序，佚名/未详作者排最后（显式规则）；
 *   - 正文分行/分节/空行由 DOM 结构保证（每印刷行一个元素、每段一个容器），不靠 CSS 折行；
 *   - 笔记默认折叠，没有笔记时显示真实的「空」状态；
 *   - 三个视觉方向共用这一份逻辑，只切 data-theme。
 */
'use strict';

(function () {
  var THEMES = [
    { id: 'paper', label: '宣纸' },
    { id: 'clean', label: '清爽' },
    { id: 'tech', label: '静默终端' },
  ];
  var pinyin = new Intl.Collator('zh-Hans-CN-u-co-pinyin');

  // ---------- 工具 ----------

  function el(tag, opts, children) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = String(opts.text);
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) {
        node.setAttribute(k, opts.attrs[k]);
      });
    }
    if (opts.onClick) node.addEventListener('click', opts.onClick);
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function hashLink(href, children) {
    var a = el('a', { attrs: { href: href } });
    (children || []).forEach(function (c) {
      a.appendChild(c);
    });
    return a;
  }

  /** 作者排序键：佚名 / 空 / 未详 视为「无作者」，排在该组最后（契约里的显式规则）。 */
  function authorIsUnknown(author) {
    if (!author) return true;
    var a = String(author).trim();
    return a === '' || a === '佚名' || a === '未详' || a === '无名氏';
  }

  function comparePoems(a, b) {
    var ua = authorIsUnknown(a.author);
    var ub = authorIsUnknown(b.author);
    if (ua !== ub) return ua ? 1 : -1;
    if (!ua) {
      var c = pinyin.compare(a.author, b.author);
      if (c !== 0) return c;
    }
    return pinyin.compare(a.title, b.title);
  }

  function buildGroups(doc) {
    var labels = {};
    var orders = {};
    (doc.dynasties || []).forEach(function (d) {
      labels[d.key] = d.label;
      orders[d.key] = d.order;
    });
    var byKey = new Map();
    (doc.poems || []).forEach(function (p) {
      var key = p.dynastyKey || 'unknown';
      if (!byKey.has(key)) {
        byKey.set(key, {
          key: key,
          label: p.dynastyLabel || labels[key] || key,
          order: typeof p.dynastyOrder === 'number' ? p.dynastyOrder : orders[key] != null ? orders[key] : 9999,
          poems: [],
        });
      }
      byKey.get(key).poems.push(p);
    });
    var groups = Array.from(byKey.values());
    groups.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return pinyin.compare(a.label, b.label);
    });
    groups.forEach(function (g) {
      // 契约：编译产物已按组内规则排好序，客户端不得重排（见 docs/interface-decisions.md IF-15/IF-16）。
      // 只有产物一个次序信息都没给时（早先手写的旧 fixture），才退回本地排序兜底。
      var hasOrderInfo = g.poems.some(function (p) {
        return p.orderInSource != null || p.authorSortKey != null || p.titleSortKey != null;
      });
      if (!hasOrderInfo) g.poems.sort(comparePoems);
    });
    return groups;
  }

  function highlight(text, query) {
    var frag = document.createDocumentFragment();
    if (!query) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    var hay = String(text).toLowerCase();
    var needle = query.toLowerCase();
    var i = 0;
    for (;;) {
      var at = hay.indexOf(needle, i);
      if (at < 0) {
        frag.appendChild(document.createTextNode(String(text).slice(i)));
        break;
      }
      if (at > i) frag.appendChild(document.createTextNode(String(text).slice(i, at)));
      frag.appendChild(el('mark', { text: String(text).slice(at, at + needle.length) }));
      i = at + needle.length;
    }
    return frag;
  }

  /** 极简 Markdown 渲染：只支持笔记里实际会用到的段落 / 引用 / 无序列表 / 粗体。 */
  function renderNote(markdown) {
    var wrap = el('div', { className: 'notes-body' });
    var blocks = String(markdown).replace(/\r\n/g, '\n').split(/\n{2,}/);
    blocks.forEach(function (raw) {
      var block = raw.trim();
      if (!block) return;
      var lines = block.split('\n');
      var isQuote = lines.every(function (l) {
        return /^\s*>/.test(l);
      });
      var isList = lines.every(function (l) {
        return /^\s*[-*]\s+/.test(l);
      });
      var host;
      if (isList) {
        host = el('ul');
        lines.forEach(function (l) {
          var li = el('li');
          appendInline(li, l.replace(/^\s*[-*]\s+/, ''));
          host.appendChild(li);
        });
      } else if (isQuote) {
        host = el('blockquote');
        var p = el('p');
        appendInline(
          p,
          lines
            .map(function (l) {
              return l.replace(/^\s*>\s?/, '');
            })
            .join(' ')
        );
        host.appendChild(p);
      } else {
        host = el('p');
        appendInline(host, lines.join(''));
      }
      wrap.appendChild(host);
    });
    return wrap;
  }

  function appendInline(host, text) {
    var parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    parts.forEach(function (part) {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        host.appendChild(el('strong', { text: part.slice(2, -2) }));
      } else if (part) {
        host.appendChild(document.createTextNode(part));
      }
    });
  }

  function noteIsTest(note) {
    return /测试笔记/.test(String(note || ''));
  }

  // ---------- 状态 ----------

  var state = {
    doc: null,
    source: 'fixture',
    notice: '',
    groups: [],
    theme: 'paper',
    query: '',
  };

  function poemById(id) {
    return (state.doc.poems || []).find(function (p) {
      return p.id === id;
    }) || null;
  }

  function groupByKey(key) {
    return state.groups.find(function (g) {
      return g.key === key;
    }) || null;
  }

  // ---------- 路由 ----------

  function parseHash() {
    var raw = decodeURIComponent((location.hash || '#/').replace(/^#/, ''));
    var parts = raw.split('/').filter(function (s) {
      return s.length > 0;
    });
    if (parts.length === 0) return { view: 'hub' };
    if (parts[0] === 'g' && parts[1]) return { view: 'group', key: parts[1] };
    if (parts[0] === 'p' && parts[1]) return { view: 'poem', id: parts[1] };
    return { view: 'hub' };
  }

  function setTheme(id, pushHash) {
    if (!THEMES.some(function (t) {
      return t.id === id;
    })) {
      id = 'paper';
    }
    state.theme = id;
    document.documentElement.setAttribute('data-theme', id);
    try {
      localStorage.setItem('poetry-prototype-theme', id);
    } catch (e) {
      /* file:// 或隐私模式下可能不可用，忽略即可 */
    }
    if (pushHash !== false) {
      var url = new URL(location.href);
      url.searchParams.set('theme', id);
      history.replaceState(null, '', url.pathname + url.search + (location.hash || '#/'));
    }
  }

  // ---------- 渲染 ----------

  var appRoot;

  function render() {
    var route = parseHash();
    var page = el('div', { className: 'page' });
    page.appendChild(topbar());
    if (state.source === 'fixture') {
      page.appendChild(fixtureBanner());
    }
    var body;
    if (state.query) {
      body = searchView();
    } else if (route.view === 'group') {
      body = groupView(route.key);
    } else if (route.view === 'poem') {
      body = poemView(route.id);
    } else {
      body = hubView();
    }
    page.appendChild(body);
    appRoot.textContent = '';
    appRoot.appendChild(page);
    window.scrollTo(0, 0);
  }

  function topbar() {
    var bar = el('header', { className: 'topbar' });

    var brand = el('div', {
      className: 'brand',
      attrs: { role: 'button', tabindex: '0', title: '回到目录' },
      onClick: function () {
        location.hash = '#/';
      },
    });
    brand.appendChild(document.createTextNode('索斐'));
    brand.appendChild(el('span', { className: 'brand-sub', text: '阅读原型 · 视觉待评审' }));
    bar.appendChild(brand);

    var box = el('div', { className: 'search' });
    box.appendChild(el('span', { className: 'search-icon', attrs: { 'aria-hidden': 'true' } }));
    var input = el('input', {
      attrs: {
        type: 'search',
        id: 'q',
        placeholder: '搜索诗名 / 作者（跨组）',
        'aria-label': '搜索诗名或作者',
        autocomplete: 'off',
        value: state.query,
      },
    });
    input.addEventListener('input', function () {
      state.query = input.value.trim();
      renderPreservingFocus();
    });
    box.appendChild(input);
    if (state.query) {
      box.appendChild(
        el('button', {
          className: 'search-clear',
          text: '✕',
          attrs: { 'aria-label': '清除搜索' },
          onClick: function () {
            state.query = '';
            render();
            focusSearch();
          },
        })
      );
    }
    bar.appendChild(box);

    var themes = el('div', { className: 'themes' });
    themes.appendChild(el('span', { className: 'themes-label', text: '视觉' }));
    THEMES.forEach(function (t) {
      themes.appendChild(
        el('button', {
          className: 'theme-chip',
          text: t.label,
          attrs: { 'aria-pressed': String(state.theme === t.id), title: '切换视觉方向：' + t.label },
          onClick: function () {
            setTheme(t.id);
            render();
          },
        })
      );
    });
    bar.appendChild(themes);

    return bar;
  }

  function renderPreservingFocus() {
    // 搜索框在重渲染中会被替换：把光标位置带到新输入框上，避免每敲一个字就掉焦点。
    var pos = state.query.length;
    render();
    var input = document.getElementById('q');
    if (input) {
      input.focus();
      try {
        input.setSelectionRange(pos, pos);
      } catch (e) {
        /* type=search 下部分浏览器不允许，忽略 */
      }
    }
  }

  function focusSearch() {
    var input = document.getElementById('q');
    if (input) input.focus();
  }

  function fixtureBanner() {
    return el('div', { className: 'banner', attrs: { title: state.notice + ' 带「测试数据」标记的笔记是造的测试内容，不是用户真实笔记。' } }, [
      el('b', { text: '示例数据（fixture）' }),
      document.createTextNode('：非最终校对文本，待内容线 A 核对；带「测试数据」标记的笔记是造的，不是用户笔记。'),
    ]);
  }

  function hubView() {
    var wrap = el('div');
    var head = el('div', { className: 'page-head' });
    head.appendChild(
      el('div', { className: 'summary' }, [
        statEl(String(state.groups.length), '组'),
        statEl(String(state.doc.poems.length), '首'),
        el('span', {
          className: 'stat',
          text: '数据：' + state.distLabel,
        }),
      ])
    );
    head.appendChild(
      el('p', {
        className: 'lede',
        text: '按时代分组，组内列诗题＋作者；组内先作者后诗名，佚名排在最后。点组进入。',
      })
    );
    wrap.appendChild(head);

    var list = el('div', { className: 'groups' });
    state.groups.forEach(function (g) {
      var row = hashLink('#/g/' + encodeURIComponent(g.key), [
        el('span', { className: 'gname', text: g.label }),
        el('span', { className: 'gcount' }, [el('b', { text: String(g.poems.length) }), document.createTextNode(' 首')]),
        el('span', {
          className: 'gpreview',
          text: g.poems
            .slice(0, 4)
            .map(function (p) {
              return p.title;
            })
            .join(' · '),
        }),
      ]);
      row.className = 'grouprow';
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function statEl(num, unit) {
    return el('span', { className: 'stat' }, [el('b', { text: num }), document.createTextNode(unit)]);
  }

  function groupView(key) {
    var g = groupByKey(key);
    if (!g) return notFound('找不到这个分组：' + key);
    var wrap = el('div');
    var head = el('div', { className: 'page-head' });
    head.appendChild(crumb('#/', '← 全部时代'));
    head.appendChild(
      el('div', { className: 'summary' }, [statEl(g.label, ''), statEl(String(g.poems.length), '首')])
    );
    wrap.appendChild(head);

    var list = el('div', { className: 'poemlist' });
    g.poems.forEach(function (p) {
      var kids = [el('span', { className: 'ptitle', text: p.title })];
      if (p.notes) kids.push(el('span', { className: 'pflag', text: '笔记' }));
      kids.push(el('span', { className: 'pauthor', text: p.author || '未详' }));
      var row = hashLink('#/p/' + encodeURIComponent(p.id), kids);
      row.className = 'poemrow';
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function crumb(href, text) {
    var a = hashLink(href, [el('span', { text: text })]);
    a.className = 'crumb';
    return a;
  }

  function poemView(id) {
    var p = poemById(id);
    if (!p) return notFound('找不到这首诗：' + id);
    var g = groupByKey(p.dynastyKey);
    var article = el('article', { className: 'poem' });

    var head = el('div', { className: 'poem-head' });
    head.appendChild(crumb(g ? '#/g/' + encodeURIComponent(g.key) : '#/', '← ' + (g ? g.label : '目录')));
    head.appendChild(el('h1', { text: p.title }));
    head.appendChild(el('p', { className: 'p-author', text: p.author || '未详' }));
    head.appendChild(
      el('p', {
        className: 'p-meta',
        text: [p.dynastyLabel, p.era, p.genre].filter(Boolean).join(' · '),
      })
    );
    article.appendChild(head);

    var body = el('div', { className: 'poem-body' });
    (p.stanzas || []).forEach(function (stanza) {
      var s = el('div', { className: 'stanza' });
      stanza.forEach(function (line) {
        s.appendChild(el('span', { className: 'line', text: line }));
      });
      body.appendChild(s);
    });
    article.appendChild(body);

    article.appendChild(notesSection(p));
    article.appendChild(poemFoot(p));
    return article;
  }

  function notesSection(p) {
    var section = el('section', { className: 'notes', attrs: { id: 'notes' } });
    var hasNote = typeof p.notes === 'string' && p.notes.trim() !== '';

    var head = el('button', {
      className: 'notes-head',
      attrs: { 'aria-expanded': 'false', type: 'button' },
    });
    head.appendChild(el('span', { className: 'n-title', text: '我的笔记' }));
    if (hasNote && noteIsTest(p.notes)) {
      head.appendChild(el('span', { className: 'n-badge', text: '测试数据' }));
    }
    head.appendChild(
      el('span', { className: 'n-toggle', text: hasNote ? '展开 ▾' : '暂无笔记' })
    );
    section.appendChild(head);

    if (!hasNote) {
      var empty = el('div', { className: 'notes-empty' });
      empty.appendChild(document.createTextNode('这首诗还没有笔记。'));
      empty.appendChild(
        el('span', {
          className: 'hint',
          text: '空的就显示为空 —— 应用不代写笔记，也不显示别人的笔记。',
        })
      );
      section.appendChild(empty);
      head.disabled = true;
      head.style.cursor = 'default';
      return section;
    }

    var bodyHost = el('div', { attrs: { hidden: 'hidden' } });
    bodyHost.appendChild(renderNote(p.notes));

    head.addEventListener('click', function () {
      var willOpen = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) {
        bodyHost.removeAttribute('hidden');
        head.querySelector('.n-toggle').textContent = '收起 ▴';
      } else {
        bodyHost.setAttribute('hidden', 'hidden');
        head.querySelector('.n-toggle').textContent = '展开 ▾';
        head.scrollIntoView({ block: 'nearest' });
      }
    });

    section.appendChild(head);
    section.appendChild(bodyHost);
    return section;
  }

  function poemFoot(p) {
    var foot = el('footer', { className: 'poem-foot' });
    if (p.variants && p.variants.length) {
      var vb = el('div', { className: 'foot-block' });
      vb.appendChild(el('span', { className: 'foot-label', text: '异文（不进正文）' }));
      var ul = el('ul');
      p.variants.forEach(function (v) {
        ul.appendChild(el('li', { text: v.text + ' —— ' + v.note }));
      });
      vb.appendChild(ul);
      foot.appendChild(vb);
    }
    var sb = el('div', { className: 'foot-block' });
    sb.appendChild(el('span', { className: 'foot-label', text: '来源' }));
    sb.appendChild(el('div', { text: p.source || '（未记录）' }));
    foot.appendChild(sb);
    return foot;
  }

  function searchView() {
    var q = state.query;
    var needle = q.toLowerCase();
    var hits = [];
    state.groups.forEach(function (g) {
      g.poems.forEach(function (p) {
        var inTitle = String(p.title).toLowerCase().indexOf(needle) >= 0;
        var inAuthor = String(p.author || '').toLowerCase().indexOf(needle) >= 0;
        if (inTitle || inAuthor) hits.push({ poem: p, group: g, inTitle: inTitle, inAuthor: inAuthor });
      });
    });

    var wrap = el('div');
    var head = el('div', { className: 'results-head' });
    head.appendChild(
      el('span', {
        text:
          '「' + q + '」命中 ' + hits.length + ' 首，跨 ' + countGroups(hits) + ' 个时代分组' +
          '（匹配诗名或作者，前端子串匹配）',
      })
    );
    wrap.appendChild(head);

    if (hits.length === 0) {
      var blank = el('div', { className: 'blank' });
      blank.appendChild(document.createTextNode('没有匹配的诗题或作者。'));
      blank.appendChild(el('br'));
      blank.appendChild(
        document.createTextNode('试试「佚名」「李白」「行行」；本原型按 v0 契约只做子串匹配，拼音搜索尚未做。')
      );
      wrap.appendChild(blank);
      return wrap;
    }

    var list = el('div');
    hits.forEach(function (h) {
      var kids = [el('span', { className: 'r-title' }, [highlight(h.poem.title, q)])];
      kids.push(el('span', { className: 'r-dyn', text: h.group.label + ' · ' + h.group.poems.length + '首' }));
      kids.push(
        el('span', {
          className: 'r-sub',
          text: h.inTitle ? '诗题命中 · 作者：' + (h.poem.author || '未详') : '作者命中 · ' + h.group.label + '组内按作者、诗名排序',
        })
      );
      var row = hashLink('#/p/' + encodeURIComponent(h.poem.id), kids);
      row.className = 'resultrow';
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function countGroups(hits) {
    var seen = {};
    var n = 0;
    hits.forEach(function (h) {
      if (!seen[h.group.key]) {
        seen[h.group.key] = true;
        n++;
      }
    });
    return n;
  }

  function notFound(msg) {
    var wrap = el('div');
    wrap.appendChild(crumb('#/', '← 回到目录'));
    wrap.appendChild(el('div', { className: 'blank', text: msg }));
    return wrap;
  }

  // ---------- 启动 ----------

  function readTheme() {
    var fromUrl = new URLSearchParams(location.search).get('theme');
    if (fromUrl) return fromUrl;
    try {
      var saved = localStorage.getItem('poetry-prototype-theme');
      if (saved) return saved;
    } catch (e) {
      /* 忽略 */
    }
    return 'paper';
  }

  function adoptFixture(reason) {
    var fx = window.POETRY_FIXTURE;
    if (!fx || !fx.doc) throw new Error('fixture-data.js 没加载到');
    state.doc = fx.doc;
    state.notice = fx.notice;
    state.source = 'fixture';
    state.distLabel = 'fixture（示例数据）';
    if (reason) console.info('[prototype] 使用 fixture 数据：' + reason);
  }

  function start() {
    appRoot = document.getElementById('app');
    setTheme(readTheme(), false);

    var params = new URLSearchParams(location.search);
    if (params.get('data') === 'fixture') {
      adoptFixture('显式指定 ?data=fixture');
      boot();
      return;
    }

    // 默认读编译线产物 ../dist/content.json；?dist=别的路径 可以指向任何同形状的 JSON。
    var distParam = params.get('dist');
    state.distLabel = distParam || 'dist/content.json';
    var url = distParam
      ? new URL(distParam, location.href).href
      : new URL('../dist/content.json', location.href).href;
    fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (doc) {
        if (!doc || !Array.isArray(doc.poems)) throw new Error('content.json 形状不对');
        state.doc = doc;
        state.source = 'dist';
        state.distUrl = url;
        state.notice = '';
        console.info('[prototype] 使用 ' + url);
      })
      .catch(function (err) {
        adoptFixture('读不到 ' + url + '（' + err.message + '）');
      })
      .then(boot);
  }

  function boot() {
    state.groups = buildGroups(state.doc);
    window.addEventListener('hashchange', render);
    render();
    if (new URLSearchParams(location.search).get('debug') === '1') boot.debugDump();
  }

  /* 评审/截图用的自检：?debug=1 时把实测尺寸写进 DOM，方便确认没有横向溢出。 */
  boot.debugDump = function () {
    var d = el('div', { className: 'foot-block', attrs: { id: 'debug' } });
    d.style.padding = '1rem';
    d.style.fontFamily = 'monospace';
    d.style.fontSize = '11px';
    d.textContent =
      'innerWidth=' + window.innerWidth +
      ' scrollWidth=' + document.documentElement.scrollWidth +
      ' appWidth=' + Math.round(document.getElementById('app').getBoundingClientRect().width) +
      ' bodyFont=' + getComputedStyle(document.body).fontFamily +
      ' poemFont=' + getComputedStyle(document.body).getPropertyValue('--font-poem') +
      ' lines=' + document.querySelectorAll('.line').length +
      ' stanzas=' + document.querySelectorAll('.stanza').length +
      ' groups=' + document.querySelectorAll('.grouprow').length;
    document.body.appendChild(d);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
