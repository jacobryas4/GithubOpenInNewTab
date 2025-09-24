// Config: set to true if you want only off-site links to open new tabs
const ONLY_EXTERNAL = true;

// Helper: is a "normal" anchor we should modify?
function isGoodAnchor(a) {
  if (!a || a.tagName !== 'A') return false;
  const href = a.getAttribute('href') || '';
  // Ignore empty, hash, javascript:, downloads, and anchors with explicit target already
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
  if (a.hasAttribute('download')) return false;
  // If ONLY_EXTERNAL, only modify anchors that go off github.com/gist.github.com
  if (ONLY_EXTERNAL) {
    try {
      const url = new URL(href, location.href);
      const sameHost = url.host === location.host;
      if (sameHost) return false;
    } catch (_) {
      // If URL parsing fails, skip
      return false;
    }
  }
  return true;
}

function patchAnchor(a) {
  if (!isGoodAnchor(a)) return;
  a.setAttribute('target', '_blank');
  // security: prevent window.opener hijacking
  const existingRel = (a.getAttribute('rel') || '').split(/\s+/);
  const needed = new Set(['noopener', 'noreferrer']);
  const merged = Array.from(new Set([...existingRel, ...needed])).filter(Boolean).join(' ');
  a.setAttribute('rel', merged);
}

// Initial sweep
function sweep(root = document) {
  root.querySelectorAll('a[href]').forEach(patchAnchor);
}

// Observe DOM changes (GitHub updates pages dynamically)
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.tagName === 'A') {
        patchAnchor(node);
      } else {
        // Check descendants
        node.querySelectorAll?.('a[href]').forEach(patchAnchor);
      }
    }
    // Attributes changed
    if (m.type === 'attributes' && m.target?.tagName === 'A' && m.attributeName === 'href') {
      patchAnchor(m.target);
    }
  }
});

// Start as early as possible
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['href']
});

// Just in case the page booted before our observer
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => sweep());
} else {
  sweep();
}

// Fallback: capture normal left-clicks before GitHub’s PJAX/turbo handlers
// This ensures new-tab even if GitHub intercepts clicks.
document.addEventListener('click', (e) => {
  // Ignore modified clicks or non-left clicks
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // Ignore clicks from editable areas
  const path = e.composedPath?.() || [];
  if (path.some(n => n && n.isContentEditable)) return;

  // Find nearest anchor
  let el = e.target;
  while (el && el !== document && el.tagName !== 'A') el = el.parentElement;
  if (!el || el.tagName !== 'A') return;

  if (!isGoodAnchor(el)) return;

  // If the observer already set target=_blank, default behavior is fine
  if (el.getAttribute('target') === '_blank') return;

  // Otherwise, open manually and stop GitHub’s in-page nav
  const href = el.getAttribute('href');
  try {
    const url = new URL(href, location.href);
    window.open(url.href, '_blank', 'noopener,noreferrer');
    e.preventDefault();
    e.stopPropagation();
  } catch (_) {
    // If URL parsing fails, let it behave normally
  }
}, { capture: true, passive: false });
