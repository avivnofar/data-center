/* Runbook Incident Timeline — vanilla JS port of the React TimelineDemo
 * component (agents/assets/incoming/datacenter-runbook-optimized/.../TimelineDemo-pichj-fI.js).
 * Renders a vertical, click-to-expand event timeline. Intended for "Solve a
 * Case" mode: each diagnosis step (start diagnosis / next step / mark fixed /
 * escalate / need guide) appends an entry here so the user can see progress
 * at a glance. Dependency-free — uses the app's existing CSS variables.
 */
(function (global) {
  'use strict';

  // Demo data matching the original TimelineDemo, used when no steps are
  // passed in (e.g. for a standalone preview).
  const DEMO_STEPS = [
    { time: '09:15:23', title: 'Alert: High CPU Usage', description: 'CPU utilization exceeded 85% threshold', status: 'completed',
      details: ['Threshold: 85%', 'Actual: 92%', 'Duration: 3 minutes', 'Service: web-server-01'] },
    { time: '09:16:45', title: 'Investigation Started', description: 'Agent initiated troubleshooting sequence', status: 'completed',
      details: ['Command: top -b -n 1', 'Command: ps aux | grep java', 'Command: netstat -tulpn'] },
    { time: '09:18:12', title: 'Root Cause Identified', description: 'Memory leak in application process detected', status: 'completed',
      details: ['Process: java (PID: 4521)', 'Memory: 8.2GB (was 2.1GB 1 hour ago)', 'Leak rate: ~100MB/min'] },
    { time: '09:19:30', title: 'Mitigation Applied', description: 'Service restarted and monitoring enhanced', status: 'completed',
      details: ['Command: systemctl restart web-service', 'Status: ✓ Running', 'Memory: 512MB (normalized)'] },
    { time: '09:20:15', title: 'Prevention Rule Added', description: 'Auto-restart configured for memory threshold', status: 'in-progress',
      details: ['Rule: Restart if memory > 80%', 'Check interval: 5 minutes', 'Status: Deploying...'] }
  ];

  const STATUS_LABEL = {
    completed: '✓ COMPLETED',
    'in-progress': '⟳ IN PROGRESS',
    pending: '○ PENDING'
  };
  const STATUS_CLASS = {
    completed: 'rb-status-completed',
    'in-progress': 'rb-status-progress',
    pending: 'rb-status-pending'
  };

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
      .rb-timeline { display: flex; flex-direction: column; gap: 10px; }
      .rb-timeline .rb-event {
        position: relative; border: 1px solid var(--border); border-radius: var(--card-radius);
        padding: 12px 14px 12px 28px; cursor: pointer; transition: border-color 0.2s, background 0.2s;
        background: var(--surface2);
      }
      .rb-timeline .rb-event:hover { border-color: var(--purple); }
      .rb-timeline .rb-event::before {
        content: ''; position: absolute; left: 10px; top: 16px; width: 10px; height: 10px;
        border-radius: 50%; border: 2px solid var(--surface);
      }
      .rb-timeline .rb-event.rb-status-completed::before { background: var(--accent); }
      .rb-timeline .rb-event.rb-status-progress::before { background: var(--accent3); }
      .rb-timeline .rb-event.rb-status-pending::before { background: var(--text-dim); }
      .rb-timeline .rb-event-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .rb-timeline .rb-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
      .rb-timeline .rb-time { font-family: var(--mono); font-size: 0.75rem; color: var(--text-muted); direction: ltr; }
      .rb-timeline .rb-status-label { font-size: 0.75rem; font-weight: 700; }
      .rb-timeline .rb-status-completed .rb-status-label { color: var(--accent); }
      .rb-timeline .rb-status-progress .rb-status-label { color: var(--accent3); }
      .rb-timeline .rb-status-pending .rb-status-label { color: var(--text-dim); }
      .rb-timeline .rb-title { font-weight: 600; color: var(--text); margin: 0 0 2px; }
      .rb-timeline .rb-desc { font-size: 0.85rem; color: var(--text-muted); margin: 0; }
      .rb-timeline .rb-chevron { color: var(--text-muted); font-size: 0.8rem; flex-shrink: 0; }
      .rb-timeline .rb-details {
        margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);
        display: flex; flex-direction: column; gap: 4px;
      }
      .rb-timeline .rb-details div { font-size: 0.82rem; color: var(--text-muted); }
      .rb-timeline .rb-details div::before { content: '▸ '; color: var(--accent2); }
      .rb-timeline .rb-summary {
        margin-top: 6px; border: 1px solid var(--accent-soft); background: var(--accent-soft);
        border-radius: var(--card-radius); padding: 10px 12px; font-size: 0.85rem; color: var(--text-muted);
      }
      .rb-timeline .rb-summary strong { color: var(--accent); }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // render(container, steps?, opts?)
  // steps: [{ time, title, description, status: 'completed'|'in-progress'|'pending', details: [string] }]
  // opts.summary: optional { resolutionTime, rootCause, status } strings shown at the bottom.
  function render(container, steps, opts) {
    injectStyles();
    steps = steps && steps.length ? steps : DEMO_STEPS;
    opts = opts || {};
    container.innerHTML = '';
    container.className = (container.className ? container.className + ' ' : '') + 'rb-timeline';

    let expanded = -1;
    function draw() {
      container.innerHTML = '';
      steps.forEach((step, idx) => {
        const statusClass = STATUS_CLASS[step.status] || STATUS_CLASS.pending;
        const ev = document.createElement('div');
        ev.className = 'rb-event ' + statusClass;

        const head = document.createElement('div');
        head.className = 'rb-event-head';

        const left = document.createElement('div');
        const meta = document.createElement('div');
        meta.className = 'rb-meta';
        const time = document.createElement('span');
        time.className = 'rb-time';
        time.textContent = step.time || '';
        const status = document.createElement('span');
        status.className = 'rb-status-label';
        status.textContent = STATUS_LABEL[step.status] || STATUS_LABEL.pending;
        meta.appendChild(time);
        meta.appendChild(status);

        const title = document.createElement('h4');
        title.className = 'rb-title';
        title.textContent = step.title || '';

        const desc = document.createElement('p');
        desc.className = 'rb-desc';
        desc.textContent = step.description || '';

        left.appendChild(meta);
        left.appendChild(title);
        left.appendChild(desc);

        const chevron = document.createElement('span');
        chevron.className = 'rb-chevron';
        chevron.textContent = expanded === idx ? '▲' : '▼';

        head.appendChild(left);
        if (step.details && step.details.length) head.appendChild(chevron);
        ev.appendChild(head);

        if (expanded === idx && step.details && step.details.length) {
          const details = document.createElement('div');
          details.className = 'rb-details';
          step.details.forEach(d => {
            const row = document.createElement('div');
            row.textContent = d;
            details.appendChild(row);
          });
          ev.appendChild(details);
        }

        if (step.details && step.details.length) {
          ev.addEventListener('click', () => {
            expanded = expanded === idx ? -1 : idx;
            draw();
          });
        }

        container.appendChild(ev);
      });

      if (opts.summary) {
        const summary = document.createElement('div');
        summary.className = 'rb-summary';
        const parts = [];
        if (opts.summary.resolutionTime) parts.push('<strong>Time to Resolution:</strong> ' + opts.summary.resolutionTime);
        if (opts.summary.rootCause) parts.push('<strong>Root Cause:</strong> ' + opts.summary.rootCause);
        if (opts.summary.status) parts.push('<strong>Status:</strong> ' + opts.summary.status);
        summary.innerHTML = parts.join(' | ');
        container.appendChild(summary);
      }
    }

    draw();
    return {
      // Append a new step (e.g. as the user progresses through "Solve a Case")
      // and re-render. Returns the new step count.
      addStep(step) {
        steps.push(step);
        draw();
        return steps.length;
      },
      setStatus(idx, status) {
        if (steps[idx]) steps[idx].status = status;
        draw();
      }
    };
  }

  global.RunbookIncidentTimeline = { render, DEMO_STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
