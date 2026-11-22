const form = document.getElementById('accessForm');
const notice = document.getElementById('notice');
const button = form.querySelector('button');
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  notice.textContent = '認証しています…';
  try {
    const response = await fetch('/spra/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('password').value })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      notice.textContent = result.error || '認証に失敗しました。';
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    const suffix = code && /^[a-z0-9]{6}$/i.test(code) ?
      '?room=' + encodeURIComponent(code) : '';
    window.location.replace('/spra/' + suffix);
  } catch {
    notice.textContent = '接続に失敗しました。サーバーが起動中か確認してください。';
  } finally {
    button.disabled = false;
  }
});