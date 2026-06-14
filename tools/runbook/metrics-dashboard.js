/* Runbook Metrics Dashboard — vanilla JS port of the React MetricsDashboard
 * component (agents/assets/incoming/datacenter-runbook-optimized/.../MetricsDashboard-BJAkVbm_.js).
 * Renders four animated "count-up" metric cards plus a stats strip. Intended
 * for the admin/Office tab. Dependency-free — uses the app's existing CSS
 * variables.
 */
(function (global) {
  'use strict';

  const METRICS = [
    { key: 'resolution', value: 85, suffix: '%', label: 'Faster Incident Resolution', caption: 'vs. traditional approach', color: 'cyan' },
    { key: 'success', value: 92, suffix: '%', label: 'Command Success Rate', caption: 'validated before production', color: 'green' },
    { key: 'growth', value: 3.2, suffix: 'x', label: 'Knowledge Base Growth', caption: 'through continuous learning', color: 'purple', decimals: 1 },
    { key: 'timeReduction', value: 75, suffix: '%', label: 'Time Spent on Troubleshooting', caption: 'reduction in manual effort', color: 'orange' }
  ];

  const STATS = [
    { value: '5-10 min', label: 'Average incident resolution', color: 'cyan' },
    { value: '100%', label: 'Automated knowledge capture', color: 'purple' },
    { value: 'Real-time', label: 'Feedback integration', color: 'pink' }
  ];

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
      .rb-metrics { display: flex; flex-direction: column; gap: 16px; }
      .rb-metrics .rb-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;
      }
      .rb-metrics .rb-card {
        border: 1px solid var(--border); border-radius: var(--card-radius); padding: 18px;
        background: var(--surface2); transition: border-color 0.2s;
      }
      .rb-metrics .rb-card.rb-cyan { border-color: rgba(88,166,255,0.3); }
      .rb-metrics .rb-card.rb-green { border-color: rgba(57,211,83,0.3); }
      .rb-metrics .rb-card.rb-purple { border-color: rgba(188,140,255,0.3); }
      .rb-metrics .rb-card.rb-orange { border-color: rgba(227,179,65,0.3); }
      .rb-metrics .rb-card-label { font-size: 0.85rem; color: var(--text-muted); margin: 0 0 6px; }
      .rb-metrics .rb-card-value { display: flex; align-items: baseline; gap: 4px; }
      .rb-metrics .rb-card-num { font-size: 2.4rem; font-weight: 700; font-family: var(--mono); }
      .rb-metrics .rb-card-suffix { font-size: 1.2rem; font-weight: 600; }
      .rb-metrics .rb-cyan .rb-card-num, .rb-metrics .rb-cyan .rb-card-suffix { color: var(--accent2); }
      .rb-metrics .rb-green .rb-card-num, .rb-metrics .rb-green .rb-card-suffix { color: var(--accent); }
      .rb-metrics .rb-purple .rb-card-num, .rb-metrics .rb-purple .rb-card-suffix { color: var(--purple); }
      .rb-metrics .rb-orange .rb-card-num, .rb-metrics .rb-orange .rb-card-suffix { color: var(--accent3); }
      .rb-metrics .rb-bar { width: 100%; height: 6px; border-radius: 3px; overflow: hidden; margin: 10px 0 6px; background: rgba(255,255,255,0.06); }
      .rb-metrics .rb-bar-fill { height: 100%; border-radius: 3px; transition: width 0.1s linear; }
      .rb-metrics .rb-cyan .rb-bar-fill { background: var(--accent2); }
      .rb-metrics .rb-green .rb-bar-fill { background: var(--accent); }
      .rb-metrics .rb-purple .rb-bar-fill { background: var(--purple); }
      .rb-metrics .rb-orange .rb-bar-fill { background: var(--accent3); }
      .rb-metrics .rb-card-caption { font-size: 0.75rem; color: var(--text-dim); margin: 0; }
      .rb-metrics .rb-stats {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px;
        border: 1px solid var(--border2); border-radius: var(--card-radius); padding: 20px;
        background: var(--surface2); text-align: center;
      }
      .rb-metrics .rb-stat-value { font-size: 1.6rem; font-weight: 700; margin: 0 0 4px; }
      .rb-metrics .rb-stat-label { font-size: 0.85rem; color: var(--text-muted); margin: 0; }
      .rb-metrics .rb-pink { color: #ff7eb6; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // mount(container, opts?) — opts.durationMs (default 2000) controls the count-up speed.
  function mount(container, opts) {
    injectStyles();
    opts = opts || {};
    const duration = opts.durationMs || 2000;
    container.innerHTML = '';
    container.className = (container.className ? container.className + ' ' : '') + 'rb-metrics';

    const grid = document.createElement('div');
    grid.className = 'rb-grid';

    const cardEls = {};
    METRICS.forEach(m => {
      const card = document.createElement('div');
      card.className = 'rb-card rb-' + m.color;

      const label = document.createElement('p');
      label.className = 'rb-card-label';
      label.textContent = m.label;

      const valueRow = document.createElement('div');
      valueRow.className = 'rb-card-value';
      const num = document.createElement('span');
      num.className = 'rb-card-num';
      num.textContent = '0';
      const suffix = document.createElement('span');
      suffix.className = 'rb-card-suffix';
      suffix.textContent = m.suffix;
      valueRow.appendChild(num);
      valueRow.appendChild(suffix);

      const bar = document.createElement('div');
      bar.className = 'rb-bar';
      const barFill = document.createElement('div');
      barFill.className = 'rb-bar-fill';
      barFill.style.width = '0%';
      bar.appendChild(barFill);

      const caption = document.createElement('p');
      caption.className = 'rb-card-caption';
      caption.textContent = m.caption;

      card.appendChild(label);
      card.appendChild(valueRow);
      card.appendChild(bar);
      card.appendChild(caption);
      grid.appendChild(card);

      cardEls[m.key] = { num, barFill };
    });

    const stats = document.createElement('div');
    stats.className = 'rb-stats';
    STATS.forEach(s => {
      const cell = document.createElement('div');
      const value = document.createElement('p');
      value.className = 'rb-stat-value rb-' + s.color;
      value.textContent = s.value;
      const label = document.createElement('p');
      label.className = 'rb-stat-label';
      label.textContent = s.label;
      cell.appendChild(value);
      cell.appendChild(label);
      stats.appendChild(cell);
    });

    container.appendChild(grid);
    container.appendChild(stats);

    const start = Date.now();
    function tick() {
      const progress = Math.min((Date.now() - start) / duration, 1);
      METRICS.forEach(m => {
        const decimals = m.decimals || 0;
        const current = (m.value * progress).toFixed(decimals);
        cardEls[m.key].num.textContent = current;
        cardEls[m.key].barFill.style.width = (m.value * progress / m.value * 100) + '%';
      });
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  global.RunbookMetrics = { mount, METRICS, STATS };
})(typeof window !== 'undefined' ? window : globalThis);
