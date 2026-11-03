'use strict';
document.documentElement.classList.remove('no-js');
const form = document.getElementById('availability-form');
const fields = Array.from(form.querySelectorAll('.availability-select'));
const status = document.getElementById('save-status');
const savedValues = JSON.parse(form.dataset.baseline);
const baseline = fields.map(field => {
  const [, date, block] = field.name.match(/^values\[([^\]]+)\]\[([^\]]+)\]$/);
  return savedValues[date]?.[block] ?? 'not_submitted';
}).join('|');
let saving = false;
function updateAvailability() {
  const available = fields.filter(field => field.value === 'available').length;
  document.getElementById('available-count').textContent = String(available);
  const dirty = baseline !== fields.map(field => field.value).join('|');
  status.textContent = form.dataset.conflict === 'true'
    ? 'Your choices were not saved. Reload the saved week to resolve this conflict.'
    : dirty ? 'You have unsaved changes' : form.dataset.saveError === 'true'
      ? 'Your choices were not saved. Review the error above.' : 'All choices match your saved availability';
  form.dataset.dirty = String(dirty);
  fields.forEach(field => { field.closest('.availability-cell').dataset.state = field.value; });
}
function fillFields(selected, value) {
  const editable = selected.filter(field => !field.disabled);
  if (editable.some(field => field.value !== 'not_submitted' && field.value !== value) &&
      !window.confirm('Replace your existing choices for these future blocks?')) return;
  editable.forEach(field => { field.value = value; });
  updateAvailability();
}
fields.forEach(field => field.addEventListener('change', updateAvailability));
form.querySelectorAll('[data-fill]').forEach(button => button.addEventListener('click', () => fillFields(fields, button.dataset.fill)));
form.querySelectorAll('[data-fill-day]').forEach(button => button.addEventListener('click', () => {
  fillFields(Array.from(button.closest('fieldset').querySelectorAll('select')), 'available');
}));
form.addEventListener('submit', event => {
  if (saving) { event.preventDefault(); return; }
  if (!form.checkValidity()) { event.preventDefault(); form.reportValidity(); return; }
  saving = true;
  document.getElementById('save-availability').disabled = true;
  status.textContent = 'Saving your availability…';
});
window.addEventListener('beforeunload', event => {
  if (!saving && form.dataset.dirty === 'true') { event.preventDefault(); event.returnValue = ''; }
});
updateAvailability();
