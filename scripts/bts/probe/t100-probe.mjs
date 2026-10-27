// Temporary probe: locate a reproducible download for BTS T-100 segment data. Removed before merge.
const show = async (label, url, re) => {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const body = await res.text();
    const hits = [...new Set([...body.matchAll(re)].map((m) => m[0]))];
    console.log(`\n=== ${label} ${res.status} final=${res.url} len=${body.length} hits=${hits.length}`);
    console.log(hits.slice(0, 80).join("\n"));
  } catch (e) {
    console.log(`=== ${label} ERROR ${e.message}`);
  }
};
await show("PREZIP listing (T100|Segment|Market)", "https://transtats.bts.gov/PREZIP/", /[A-Za-z0-9_]*(T100|T_100|Segment|SEGMENT|Market)[A-Za-z0-9_]*\.zip/g);
await show("PREZIP listing (sample names)", "https://transtats.bts.gov/PREZIP/", /href="[^"]{0,120}"/g);
await show("Tables EEE", "https://www.transtats.bts.gov/Tables.asp?QO_VQ=EEE", /href="[^"]*(DL_SelectFields|gnoyr|Fields)[^"]*"/gi);
await show("Data Elements T100", "https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE", /href="[^"]*"/gi);
