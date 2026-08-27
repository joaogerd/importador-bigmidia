chrome.storage.local.get(['yklStateV2'], result => {
  const logo = result?.yklStateV2?.logoDataUrl || '';
  const img = document.getElementById('popup-logo-img');
  const fallback = document.getElementById('popup-logo-fallback');
  if (logo && img && fallback) {
    img.src = logo;
    img.hidden = false;
    fallback.hidden = true;
  }
});


document.getElementById('open-create')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://ligapaulistafutsal.bigmidia.com/atleta/create' });
});
