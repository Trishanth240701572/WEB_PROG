'use strict';
window.SHIFTSYNC = JSON.parse(document.getElementById('root').dataset.shiftsync);
// A PHP shell skip link must focus the landmark without changing the React hash route.
document.querySelector('.skip-link')?.addEventListener('click', event => {
  const main = document.getElementById('main');
  if (main) { event.preventDefault(); main.focus(); }
});
