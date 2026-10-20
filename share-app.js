/* V115 NEW - "Share app" button placed next to the Profile icon (student mode).
   Loaded by app.js (index.html) and, on the launcher, by one script line in home.html. */
(function(){
  if (window.__shareAppLoaded) return; window.__shareAppLoaded = true;
  const SVG = '<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:STROKE;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/></svg>';
  function appUrl(){ try { return new URL('home.html', location.href).href; } catch(e){ return location.href; } }
  function toast(msg){
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#16274A;color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:9999;max-width:85%;text-align:center;';
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  async function shareApp(){
    const url = appUrl();
    const text = 'Practice Power Systems & Measurements with BALAJI sir - free GATE/ESE practice app. Open it here: ' + url;
    try {
      if (navigator.share) { await navigator.share({ title: 'EEE Practice - BALAJI sir', text, url }); return; }
    } catch(e){ if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Link copied - paste it in WhatsApp or any chat'); }
    catch(e){ window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }
  }
  function inject(){
    if (document.getElementById('shareAppBtn')) return;
    const hp = document.getElementById('headerProfileBtn');     // inside the app
    const lp = document.querySelector('.launch-profile-btn');   // launcher (home.html)
    if (hp) {
      const b = document.createElement('button');
      b.id = 'shareAppBtn'; b.className = 'icon-btn'; b.setAttribute('aria-label', 'Share app');
      b.innerHTML = SVG.replace('STROKE', '#fff'); b.onclick = shareApp;
      hp.parentNode.insertBefore(b, hp);
    } else if (lp) {
      const b = document.createElement('button');
      b.id = 'shareAppBtn'; b.className = 'launch-profile-btn'; b.setAttribute('aria-label', 'Share app');
      b.style.right = '64px';
      b.innerHTML = SVG.replace('STROKE', '#16274A').replace('width:22px;height:22px', 'width:20px;height:20px'); b.onclick = shareApp;
      document.body.appendChild(b);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
