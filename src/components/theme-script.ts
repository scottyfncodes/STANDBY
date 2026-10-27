// Plain module (no "use client") so the root layout can inline the script string.

/** Same namespace as the rest of the on-device preferences (see store.tsx). */
export const THEME_KEY = "standby:v1:theme";
const THEME_COLOR = { light: "#f4f0e8", dark: "#0d1820" };

/**
 * Runs in <head> before first paint: resolves the saved preference (System follows the OS)
 * into html[data-theme], owns the theme-color meta (so the browser chrome matches the chosen
 * theme rather than the OS; Next's metadata doesn't manage it), and re-applies when the
 * OS appearance changes. Exposed as window.__standbyTheme so the setting can re-apply it.
 */
export const THEME_SCRIPT = `(function(){var K=${JSON.stringify(THEME_KEY)},C=${JSON.stringify(THEME_COLOR)},m=window.matchMedia("(prefers-color-scheme: dark)");
function pref(){try{var v=JSON.parse(localStorage.getItem(K));return v==="light"||v==="dark"?v:"system"}catch(e){return "system"}}
function apply(){var p=pref(),t=p==="system"?(m.matches?"dark":"light"):p,d=document.documentElement;d.setAttribute("data-theme",t);d.style.colorScheme=t;
var mt=document.getElementById("standby-theme-color");if(!mt){mt=document.createElement("meta");mt.name="theme-color";mt.id="standby-theme-color";document.head.appendChild(mt);}mt.setAttribute("content",C[t]);}
apply();if(m.addEventListener)m.addEventListener("change",apply);else if(m.addListener)m.addListener(apply);
window.__standbyTheme=apply;})();`;
