// Apply the theme before first paint (see src/lib/browser/theme.ts): the saved choice, or
// Light by default. "auto" leaves data-theme unset so the system setting applies.
// A file rather than an inline script, so the Content-Security-Policy can forbid inline scripts.
(function () {
  var t = "light";
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark" || saved === "auto") t = saved;
  } catch (e) {}
  if (t !== "auto") document.documentElement.setAttribute("data-theme", t);
})();
