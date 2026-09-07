(() => {
  const langToggle = document.getElementById('langToggle');
  let lang = localStorage.getItem('pm-lang') || (navigator.language?.startsWith('zh') ? 'zh' : 'en');

  const ids = ['phi1','theta1','phi2','theta2','phi3','theta3'];
  const hasCalculator = ids.every(id => document.getElementById(id));

  function setLang(next) {
    lang = next;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-zh][data-en]').forEach(el => {
      el.textContent = el.dataset[lang];
    });
    if (langToggle) langToggle.textContent = lang === 'zh' ? 'EN' : '中文';
    localStorage.setItem('pm-lang', lang);
    if (hasCalculator) calculate();
  }
  if (langToggle) langToggle.addEventListener('click', () => setLang(lang === 'zh' ? 'en' : 'zh'));

  if (hasCalculator) ids.forEach(id => document.getElementById(id).addEventListener('input', calculate));

  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const norm = a => Math.sqrt(dot(a,a));
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const clamp = x => Math.max(-1, Math.min(1, x));
  function normal(phi, theta){
    const p=rad(phi), t=rad(theta);
    return [-Math.cos(p)*Math.sin(t), -Math.sin(p)*Math.sin(t), Math.cos(t)];
  }
  function planeAngle(n1,n2){
    let a = deg(Math.acos(clamp(dot(n1,n2)/(norm(n1)*norm(n2)))));
    return Math.min(a, 180-a);
  }
  function linePlaneAngle(line, planeNormal){
    const ln=norm(line), nn=norm(planeNormal);
    if (ln < 1e-10 || nn < 1e-10) return NaN;
    return deg(Math.asin(clamp(Math.abs(dot(line,planeNormal))/(ln*nn))));
  }
  function fmt(x){ return Number.isFinite(x) ? `${x.toFixed(2)}°` : '—'; }

  function calculate(){
    if (!hasCalculator) return;
    const v = Object.fromEntries(ids.map(id => [id, Number(document.getElementById(id).value)]));
    const warning = document.getElementById('calcWarning');
    if (Object.values(v).some(x => !Number.isFinite(x))) {
      if (warning) warning.textContent = lang === 'zh' ? '请输入有效数字。' : 'Please enter valid numbers.';
      return;
    }
    const n1=normal(v.phi1,v.theta1), n2=normal(v.phi2,v.theta2), n3=normal(v.phi3,v.theta3);
    document.getElementById('alpha12').textContent=fmt(planeAngle(n1,n2));
    document.getElementById('alpha13').textContent=fmt(planeAngle(n1,n3));
    document.getElementById('alpha23').textContent=fmt(planeAngle(n2,n3));
    const m12=cross(n1,n2), beta=linePlaneAngle(m12,n3);
    document.getElementById('beta3').textContent=fmt(beta);
    if (warning) {
      warning.textContent = norm(m12) < 1e-8
        ? (lang === 'zh' ? '裂隙 1 与裂隙 2 近似平行，交线方向不唯一，β3 无法稳定定义。' : 'Fractures 1 and 2 are nearly parallel; their intersection direction is not uniquely defined, so β3 is unstable.')
        : '';
    }
  }
  setLang(lang);
})();
