async function checkDeploy() {
  console.log("Checking deployed website source code...");
  try {
    const htmlRes = await fetch("https://creativityy.pages.dev/");
    const htmlText = await htmlRes.text();
    
    // Find all JS asset URLs
    const matches = htmlText.matchAll(/src="\/assets\/(index-[a-zA-Z0-9_-]+\.js)"/g);
    const jsFiles = Array.from(matches).map(m => m[1]);
    
    if (jsFiles.length === 0) {
      console.log("No main JS bundle found in HTML. Checking if there are other script tags...");
      console.log(htmlText.substring(0, 1000));
      return;
    }
    
    for (const file of jsFiles) {
      const jsUrl = `https://creativityy.pages.dev/assets/${file}`;
      console.log(`Checking bundle: ${jsUrl}`);
      const jsRes = await fetch(jsUrl);
      const jsText = await jsRes.text();
      
      const containsHeic = jsText.includes("convertHeicToJpeg") || jsText.includes("heic2any");
      console.log(`Contains 'heic2any' or 'convertHeicToJpeg': ${containsHeic}`);
    }
  } catch (err) {
    console.error("Check failed:", err);
  }
}

checkDeploy();
