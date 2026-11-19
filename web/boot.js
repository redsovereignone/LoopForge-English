// Set the document language before the first paint, including when storage is disabled.
document.documentElement.lang = 'en';
document.documentElement.dataset.lang = 'en';
window.lfT = (source, english) => english ?? source;
