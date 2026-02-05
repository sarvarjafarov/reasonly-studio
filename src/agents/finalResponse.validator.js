const allowedTopLevelKeys = [
  'status',
  'objective',
  'assumptions',
  'findings',
  'actions',
  'evidence',
  'dashboard_spec',
  'exec_summary',
];

function ensureExecSummary(exec_summary) {
  const required = ['headline', 'what_changed', 'why', 'what_to_do_next'];
  required.forEach((key) => {
    if (!exec_summary || !(key in exec_summary)) {
      throw new Error(`exec_summary must include ${key}`);
    }
  });
}

function validateFinalResponse(finalResponse) {
  if (typeof finalResponse !== 'object' || finalResponse === null) {
    throw new Error('FinalResponse must be an object');
  }

  Object.keys(finalResponse).forEach((key) => {
    if (!allowedTopLevelKeys.includes(key)) {
      throw new Error(`Unexpected FinalResponse key: ${key}`);
    }
  });

  const { status, objective, findings, actions, evidence, dashboard_spec, exec_summary } = finalResponse;

  if (!['ok', 'insufficient_data'].includes(status)) {
    throw new Error('status must be "ok" or "insufficient_data"');
  }

  if (!objective || typeof objective !== 'string') {
    throw new Error('objective must be a non-empty string');
  }

  if (typeof dashboard_spec !== 'object' || dashboard_spec === null) {
    throw new Error('dashboard_spec must be an object');
  }

  if (typeof exec_summary !== 'object' || exec_summary === null) {
    throw new Error('exec_summary must be an object');
  }

  ensureExecSummary(exec_summary);

  if (!Array.isArray(findings) || !Array.isArray(actions) || !Array.isArray(evidence)) {
    throw new Error('findings/actions/evidence must be arrays');
  }

  if (status === 'ok') {
    if (!findings.length || !actions.length || !evidence.length) {
      throw new Error('findings/actions/evidence must be non-empty when status=ok');
    }
    const enforceSupporting = (items, label) => {
      items.forEach((item) => {
        const metrics = item.supporting_metrics;
        if (!Array.isArray(metrics) || metrics.length === 0) {
          throw new Error(`${label} missing supporting_metrics`);
        }
      });
    };
    enforceSupporting(findings, 'finding');
    enforceSupporting(actions, 'action');
  } else {
    const headline = (exec_summary.headline || '').toLowerCase();
    const explainsMissing =
      /(insufficient|not enough|missing)/i.test(headline) ||
      findings.some(
        (f) => typeof f.detail === 'string' && /(insufficient|not enough|missing)/i.test(f.detail)
      );
    if (!explainsMissing) {
      throw new Error('insufficient_data responses must explain missing data in headline or findings');
    }
  }

  return true;
}

function enforceEvidenceBinding(finalResponse) {
  const evidenceMetrics = new Set();
  (finalResponse.evidence || []).forEach(({ key_results }) => {
    (key_results || []).forEach((kr) => {
      const match = kr.match(/metric=([a-zA-Z0-9_]+)/i);
      if (match) {
        evidenceMetrics.add(match[1].toLowerCase());
      }
    });
  });

  const missingMetrics = [];
  const lackingSupporting = [];

  const checkItems = (items = [], label) => {
    items.forEach((item) => {
      const metrics = item.supporting_metrics || [];
      if (!metrics.length) {
        lackingSupporting.push(`${label}:${item.title || item.action || 'n/a'}`);
      }
      metrics.forEach((metric) => {
        if (!evidenceMetrics.has(metric.toLowerCase())) {
          missingMetrics.push(metric);
        }
      });
    });
  };

  checkItems(finalResponse.findings, 'finding');
  checkItems(finalResponse.actions, 'action');

  if (lackingSupporting.length || missingMetrics.length) {
    finalResponse.status = 'insufficient_data';
    finalResponse.findings = finalResponse.findings || [];
    const missingSet = [...new Set(missingMetrics)];
    const detailComponents = [];
    if (lackingSupporting.length) detailComponents.push(`Missing supporting_metrics for ${lackingSupporting.join(', ')}`);
    if (missingSet.length) detailComponents.push(`Missing evidence for metrics ${missingSet.join(', ')}`);
    finalResponse.findings.push({
      title: 'Evidence binding failed',
      detail: detailComponents.join('; '),
      impact: 'Cannot support claims without documented metrics',
      supporting_metrics: missingSet.length ? missingSet : ['evidence_binding'],
    });
  }

  return finalResponse;
}

module.exports = {
  validateFinalResponse,
  enforceEvidenceBinding,
};
