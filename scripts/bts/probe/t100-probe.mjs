// Temporary probe: discover the TranStats T-100 download form structure. Removed before merge.
const tables = { FIL: "T-100 Domestic Segment (U.S. Carriers)?", FIM: "T-100 Domestic Segment (All Carriers)?", FJE: "?", FJD: "?", FIH: "?" };
for (const id of Object.keys(tables)) {
  const url = `https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=${id}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    const html = await res.text();
    const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
    const h = [...html.matchAll(/id="lblTableName"[^>]*>([^<]*)</gi)].map((m) => m[1]);
    const names = [...new Set([...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]))];
    const selects = [...html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)].map((m) => `${m[1]}: ${[...m[2].matchAll(/value="([^"]*)"/g)].map((x) => x[1]).slice(0, 15).join("|")}`);
    console.log(`\n=== ${id} status ${res.status} len ${html.length} title=${title} table=${h.join(",")}`);
    console.log("inputs:", names.slice(0, 160).join(" "));
    console.log("selects:\n  " + selects.join("\n  "));
    const desc = [...html.matchAll(/<td[^>]*class="dataTDRight"[^>]*>([^<]{3,80})</gi)].map((m) => m[1]).slice(0, 5);
    console.log("desc:", desc.join(" / "));
  } catch (e) {
    console.log(`=== ${id} ERROR ${e.message}`);
  }
}
