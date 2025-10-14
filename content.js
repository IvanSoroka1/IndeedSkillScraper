
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "startScrape") {
    browser.storage.local.set({ scraping: true });
    const response = await fetch("http://127.0.0.1:5000/isOnline", { method: "GET" });
    if (response.status !== 200)
      console.log("🛑 Server not connected. Aborting.");
    else
      startScraping();
  }
});

// this runs when you go to a new page
(async function () {
  const state = await browser.storage.local.get("scraping");
  if (state.scraping) {
    startScraping();
  }
})();


async function startScraping() {
  console.log("🔍 content.js loaded");
  if (window.location.href.startsWith("https://ca.indeed.com/rc/clk")) { // or if the page contains the text: "Additional Verification Required"
    return;
  }
  if (window.location.href.startsWith("https://ca.indeed.com/viewjob")) {
    console.log("↩️ Detected standalone /viewjob page, going back to search results...");
    window.history.back();
    browser.storage.local.set({ redirected: true });
    return;
  }

  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  let { jobData = [], redirected = false, lastJobs = [] } = await browser.storage.local.get(["jobData", "redirected", "lastJobs"]);

  let lastTitle = '';

  console.log("📄 New page of jobs");
  const jobCards = document.querySelectorAll('li.css-1ac2h1w.eu4oa1w0');

  // Create a list of unique identifiers for comparison — e.g. job titles or links
  const currentJobs = Array.from(jobCards)
    .map(card => {
      const linkElement = card.querySelector("a");
      if (!linkElement) return null; // mark for removal if no <a>

      // let title = linkElement.innerText.trim();
      // // Remove leading "Full details of" if present
      // title = title.replace(/^full details of\s*/i, "").trim();
      // // Limit length for comparison/logging
      // return title.slice(0, 100);
      const jobId = linkElement.id?.replace(/^job_/, "") || "";
      return jobId;
    })
    .filter(jobId => jobId !== null); // remove cards without <a>



  if (!redirected) {
    // First pass — store current job identifiers
    await browser.storage.local.set({ lastJobs: currentJobs });
    console.log("🧠 Stored initial job list.");
  } else {
    // Compare current jobs with previously stored ones

    const addedJobs = currentJobs.filter(j => !lastJobs.includes(j));
    const removedJobs = lastJobs.filter(j => !currentJobs.includes(j));

    console.log("➕ Added jobs:", addedJobs.length ? addedJobs : "None");
    console.log("➖ Removed jobs:", removedJobs.length ? removedJobs : "None");

    await browser.storage.local.set({ redirected: false });
  }


  for (let i = 0; i < jobCards.length; i++) {
    const { scraping } = await browser.storage.local.get("scraping");
    if (!scraping)
      break;

    const jobCard = jobCards[i];
    const linkElement = jobCard.querySelector("a");
    if (!linkElement)
      continue;
    const jobId = linkElement.id?.replace(/^job_/, "") || "";

    if (jobData.some(job => job.Id === jobId)) {
      console.log("🧠 Skipping already-seen job:", jobId);
      continue;
    }

    jobCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const clickable = jobCard.querySelector('a');
    if (!clickable) continue;
    clickable.click();

    // The following block of code waits until the div with "Skills" appears on the page
    // it's possible there are no skills. In that case, this will wait for 5 seconds
    let retries = 0;
    while (retries < 10) {
      await delay(500);
      const div = Array.from(document.querySelectorAll('div'))
        .find(el => el.className?.startsWith('js-match-insights-provider') && el.innerText.includes('Skills'));
      if (div) {
        console.log('Found Skills div:', div);
        break;
      }
      retries++;
    }


    const showMoreBtn = Array.from(document.querySelectorAll('button'))
      .find(btn => btn.innerText.trim().toLowerCase() === "+ show more");
    if (showMoreBtn) {
      showMoreBtn.click();
      await delay(1000);
    }

    const jobTitleRaw = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')?.innerText.trim() || "Unknown Title";
    const jobTitle = jobTitleRaw.replace(/\s*- job post$/i, "").trim();

    const jobCompany = document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText.trim() || "Unknown Company";
    const [jobLocation, jobRemote] = document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText.trim().split("•");

    const headings = document.querySelectorAll('h3[class^="js-match-insights-provider-"]');
    let skillsItems = [];

    headings.forEach(h3 => {
      if (h3.innerText.trim() === "Skills") {
        const div = h3.nextElementSibling;
        if (div && div.tagName === "DIV") {
          const listItems = div.querySelectorAll('li[data-testid="list-item"][class*="js-match-insights-provider-"]');
          skillsItems = Array.from(listItems).map(li => {
            let text = li.innerText.trim();
            if (text.endsWith("(Required)")) {
              text = text.slice(0, -" (Required)".length).trim();
            }
            return text;
          });
        }
      }
    });
    if (skillsItems.length === 0) {
      console.log("⚠️ No skills found for job:", jobTitle);
    }
    jobData.push({
      Title: jobTitle,
      Company: jobCompany,
      Skills: skillsItems.join("; "),
      Id: jobId,
      Location: jobLocation,
      Remote: jobRemote
    });
    await browser.storage.local.set({ jobData }); // persist after each page

    console.log(`✅ Processed job ${jobData.length}`);

  }

  const { scraping } = await browser.storage.local.get("scraping");
  if (scraping) {
    // Try to go to next page
    const nextButton = document.querySelector('a[data-testid="pagination-page-next"]');

    // in case you want to limit the page count for testing purposes
    const stored = await browser.storage.local.get("pagecount");
    const pageCount = stored.pagecount ?? 1; // default to 1 if undefined

    if (nextButton && !nextButton.hasAttribute("aria-disabled")) {
      nextButton.click();
      browser.storage.local.set({ pagecount: pageCount + 1 });
      console.log("➡️ Moving to next page...");
      return; // stop now, will resume on next page load
    } else {
      console.log("🏁 No more pages. Scraping complete.");
    }
  }
  await browser.storage.local.set({ scraping: false });
  await browser.storage.local.remove("lastJobs");
  await browser.storage.local.remove("pagecount");
  await browser.storage.local.remove("redirected");

  console.log("🛑 Scraping finished. Sending to server...");

  try {
    const res = await fetch("http://127.0.0.1:5000/upload_jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs: jobData })
    });

    if (!res.ok) {
      throw new Error(`Server responded with status ${res.status}`);
    }

    console.log("📤 Data sent successfully to backend.");
  } catch (err) {
    console.error("❌ Failed to send data:", err);
  }

  await browser.storage.local.remove("jobData"); // clean up
}

