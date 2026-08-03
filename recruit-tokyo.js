let uploadedFiles = [];

function toggleDetail(id, btn) {
  const panel = document.getElementById(id);
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);

  // Chỉ thay text trong <span data-i18n>, không đụng vào SVG
  const span = btn.querySelector('span[data-i18n]');
  if (span) {
    const lang = window.CURRENT_LANG || 'JP';
    if (isOpen) {
      span.textContent = lang === 'EN' ? 'View Details' : '詳細情報を見る';
    } else {
      span.textContent = lang === 'EN' ? 'Close Details' : '詳細情報を閉じる';
    }
  }
}

function showFileName(input) {
  const newFiles = Array.from(input.files);
  newFiles.forEach(f => {
    if (!uploadedFiles.find(existing => existing.name === f.name)) {
      uploadedFiles.push(f);
    }
  });
  input.value = '';

  const el = document.getElementById('uploadName');
  el.innerHTML = uploadedFiles.length === 0 ? '' : uploadedFiles.map(f => `📎 ${f.name}`).join('<br>');
}

// Fade-up observer
const obs = new IntersectionObserver(entries => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('visible'), i * 80);
      obs.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-up').forEach(el => obs.observe(el));
setTimeout(() => document.querySelectorAll('.fade-up').forEach(el => el.classList.add('visible')), 2500);

// Form submit
document.getElementById('recruitForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const btn = this.querySelector('.form-submit');
  btn.disabled = true;
  btn.textContent = '送信中…';

  const formData = new FormData(this);
  formData.delete('resumeFile');
  uploadedFiles.forEach(f => formData.append('resumeFile', f));

  try {
    const res = await fetch('/api/recruit', {
      method: 'POST',
      body: formData
    });
    const json = await res.json();

    if (json.success) {
      this.style.display = 'none';
      document.getElementById('formSuccess').classList.add('show');
      document.getElementById('application-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      alert('送信に失敗しました。お手数ですが、お電話にてご連絡ください。\nTEL: 03-6809-3129（東京支店）');
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> 応募する';
    }
  } catch (err) {
    alert('通信エラーが発生しました。お手数ですが、お電話にてご連絡ください。\nTEL: 03-6809-3129（東京支店）');
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> 応募する';
  }
});
