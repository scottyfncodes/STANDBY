// Temporary probe: identify the T-100 segment tables and their download form. Removed before merge.
const get = async (url) => {
  const res = await fetch(url, { redirect: "follow" });
  return { res, html: await res.text() };
};
const prezip = (await get("https://transtats.bts.gov/PREZIP/")).html;
const t100 = [...new Set([...prezip.matchAll(/[A-Za-z0-9_]+\.zip/g)].map((m) => m[0]).filter((n) => !n.startsWith("On_Time")))];
console.log("PREZIP non-on-time zips:", t100.length, t100.slice(0, 40).join(" "));
for (const id of ["GED", "GEE", "FJD", "FJE", "FMF", "FMG"]) {
  const f = await get(`https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=${id}`);
  const title = (f.html.match(/<h3[^>]*>([^<]{5,140})<\/h3>/i) || f.html.match(/Table:?\s*<\/[^>]+>\s*<[^>]+>([^<]{5,140})</i) || [])[1];
  const tblName = (f.html.match(/T_[A-Z0-9_]{6,60}/) || [])[0];
  console.log(`\n### ${id}: ${title?.trim()} | ${tblName}`);
}
const id = process.env.T100_ID || "FMF";
for (const tid of [id, "FJE"]) {
  const { res, html } = await get(`https://www.transtats.bts.gov/DL_SelectFields.asp?gnoyr_VQ=${tid}&QO_fu146_anzr=Nv4%20Pn44vr45`);
  console.log(`\n=== FORM ${tid} status ${res.status} final=${res.url} len=${html.length}`);
  const forms = [...html.matchAll(/<form[^>]*>/gi)].map((m) => m[0]);
  console.log("forms:", forms.join(" | "));
  const hidden = [...html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)].map((m) => (m[0].match(/name="([^"]+)"/) || [])[1]);
  console.log("hidden:", hidden.join(" "));
  const checks = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/gi)].map((m) => (m[0].match(/(?:name|id)="([^"]+)"/) || [])[1]);
  console.log("checkboxes:", checks.length, checks.join(" "));
  const selects = [...html.matchAll(/<select[^>]*(?:name|id)="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)].map((m) => `${m[1]}: ${[...m[2].matchAll(/value="([^"]*)"/g)].map((x) => x[1]).slice(-14).join("|")}`);
  console.log("selects:\n  " + selects.join("\n  "));
  const buttons = [...html.matchAll(/<(?:input|button)[^>]*(?:type="submit"|type="button"|onclick)[^>]*>/gi)].map((m) => m[0].slice(0, 200));
  console.log("buttons:", buttons.slice(0, 6).join("\n  "));
  const latest = (html.match(/Latest Available Data:?\s*<\/[^>]+>\s*([^<]{3,40})/i) || html.match(/Latest Available Data[^A-Za-z0-9]*([A-Za-z]+ \d{4})/i) || [])[1];
  console.log("latest:", latest);
}
