// Navigation and public download-count display. No invented totals.
const menu = document.getElementById('menu');
const nav = document.getElementById('nav');
if (menu && nav) {
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));
}
async function loadCounts() {
  const nodes = [...document.querySelectorAll('[data-download-count]')];
  if (!nodes.length) return;
  const slugs = [...new Set(nodes.map(node => node.dataset.downloadCount))];
  await Promise.all(slugs.map(async slug => {
    try {
      const response = await fetch('/api/count?script=' + encodeURIComponent(slug), { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      if (!Number.isSafeInteger(result.count) || result.count < 0) return;
      nodes.filter(node => node.dataset.downloadCount === slug).forEach(node => {
        node.textContent = new Intl.NumberFormat('en-US').format(result.count) + ' downloads';
      });
    } catch { /* The static site remains usable even without a D1 binding. */ }
  }));
}
loadCounts();
// Refresh the visible count after clicking a download. The server increments on a valid request.
document.querySelectorAll('a[href^="/api/download?"]').forEach(link => {
  link.addEventListener('click', () => setTimeout(loadCounts, 1200));
});
