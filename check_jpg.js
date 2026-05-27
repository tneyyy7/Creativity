async function checkJpg() {
  const url = 'https://mutrphgzoczcitnmpxsm.supabase.co/storage/v1/object/public/paintings/8d138341-8dd6-4204-9809-501a1bfa235b/1779878964088-IMG8011.jpg';
  console.log("Fetching new JPG URL:", url);
  try {
    const res = await fetch(url);
    console.log("Status:", res.status, res.statusText);
    console.log("Content-Type:", res.headers.get("content-type"));
    console.log("Content-Length:", res.headers.get("content-length"));
    
    if (res.status === 200) {
      const buf = await res.arrayBuffer();
      console.log("Actual file size in bytes:", buf.byteLength);
      // Let's print the first few bytes to check the magic numbers
      const view = new Uint8Array(buf.slice(0, 4));
      console.log("Magic bytes:", Array.from(view).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // For JPEG, magic bytes are: ff d8 ff
      if (view[0] === 0xff && view[1] === 0xd8) {
        console.log("Verified: It is a valid JPEG file!");
      } else {
        console.log("WARNING: Magic bytes do NOT match JPEG (FF D8)!");
      }
    } else {
      const txt = await res.text();
      console.log("Error response:", txt);
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

checkJpg();
