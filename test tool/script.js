"use strict";

const platforms = [
  ["Instagram", "https://www.instagram.com/", "/"],
  ["TikTok", "https://www.tiktok.com/@", ""],
  ["X", "https://x.com/", ""],
  ["Facebook", "https://www.facebook.com/", ""],
  ["YouTube", "https://www.youtube.com/@", ""],
  ["Reddit", "https://www.reddit.com/user/", "/"],
  ["LinkedIn", "https://www.linkedin.com/in/", "/"],
  ["Threads", "https://www.threads.com/@", ""],
  ["Snapchat", "https://www.snapchat.com/add/", ""],
  ["Pinterest", "https://www.pinterest.com/", "/"],
  ["Twitch", "https://www.twitch.tv/", ""],
  ["GitHub", "https://github.com/", ""],
  ["Telegram", "https://t.me/", ""],
  ["Bluesky", "https://bsky.app/profile/", ""],
  [
    "Mastodon (mastodon.social only)",
    "https://mastodon.social/@",
    ""
  ],
  [
    "Steam (custom profile ID)",
    "https://steamcommunity.com/id/",
    ""
  ],
  ["Medium", "https://medium.com/@", ""],
  ["Dev.to", "https://dev.to/", ""]
];

const $ = id => document.getElementById(id);

let report = null;

function element(tag, text, className) {
  const node = document.createElement(tag);

  if (text !== undefined) {
    node.textContent = text;
  }

  if (className) {
    node.className = className;
  }

  return node;
}

function externalLink(text, url) {
  const link = element("a", text, "open");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  return link;
}

/* Add platforms to the filter. */
for (const [name] of platforms) {
  const option = element("option", name);
  option.value = name;
  $("filter").append(option);
}

/* Validate and normalize an imported archive. */
async function readArchive(file) {
  if (!file) return [];

  if (file.size > 2000000) {
    throw new Error("Import must be smaller than 2 MB.");
  }

  let entries;

  try {
    entries = JSON.parse(await file.text());
  } catch {
    throw new Error("Import must contain valid JSON.");
  }

  if (!Array.isArray(entries) || entries.length > 5000) {
    throw new Error("Import an array of up to 5,000 entries.");
  }

  return entries.map(entry => {
    if (!entry || typeof entry.text !== "string") {
      throw new Error("Every imported entry needs a text string.");
    }

    const timestamp = entry.timestamp ?? "";

    if (
      typeof timestamp !== "string" ||
      (
        timestamp &&
        (
          !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(timestamp) ||
          Number.isNaN(Date.parse(timestamp))
        )
      )
    ) {
      throw new Error(
        "Timestamps must use ISO 8601, such as 2025-06-15T12:30:00Z."
      );
    }

    /*
      Check the calendar date itself as well:
      reject values such as February 30.
    */
    if (timestamp) {
      const datePart = timestamp.slice(0, 10);
      const calendarDate = new Date(datePart + "T00:00:00Z");

      if (
        Number.isNaN(calendarDate.getTime()) ||
        calendarDate.toISOString().slice(0, 10) !== datePart
      ) {
        throw new Error("An imported entry contains an invalid date.");
      }
    }

    const url = entry.url ?? "";

    if (typeof url !== "string") {
      throw new Error("Source URLs must be text.");
    }

    if (url) {
      let parsed;

      try {
        parsed = new URL(url);
      } catch {
        throw new Error("An imported source URL is invalid.");
      }

      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Source URLs must use HTTP or HTTPS.");
      }
    }

    return {
      text: entry.text,
      timestamp,
      url,
      platform: String(entry.platform || "Imported")
    };
  });
}

/* Build an audit from the form. */
$("audit").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("generate");
  $("error").textContent = "";
  button.disabled = true;
  button.textContent = "Preparing audit…";

  try {
    if (!$("consent").checked) {
      throw new Error("Please confirm that this audit is authorized.");
    }

    const usernames = [
      ...new Set(
        $("username").value
          .split(/[,\r\n]+/)
          .map(value => value.trim().replace(/^@/, ""))
          .filter(Boolean)
      )
    ];

    if (
      !usernames.length ||
      usernames.some(
        username => !/^[a-zA-Z0-9_.-]{1,100}$/.test(username)
      )
    ) {
      throw new Error(
        "Enter at least one valid username. Use commas or new lines " +
        "to separate handles. Do not enter profile URLs."
      );
    }

    const emails = [
      ...new Set(
        $("emails").value
          .split(",")
          .map(value => value.trim())
          .filter(Boolean)
      )
    ];

    if (
      emails.some(
        email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      )
    ) {
      throw new Error(
        "Check the email addresses and separate them with commas."
      );
    }

    const from = $("from").value;
    const to = $("to").value;

    if (from && to && from > to) {
      throw new Error(
        "The start date must be before or equal to the end date."
      );
    }

    const imported = await readArchive($("import").files[0]);

    const posts = imported.filter(post => {
      if (!from && !to) return true;
      if (!post.timestamp) return false;

      const date = post.timestamp.slice(0, 10);

      return (
        (!from || date >= from) &&
        (!to || date <= to)
      );
    });

    report = {
      created: new Date().toISOString(),

      details: {
        fullName: $("full-name").value.trim(),
        usernames,
        emails,
        phone: $("phone").value.trim()
      },

      dateRange: {
        from,
        to
      },

      note:
        "Names and contact details are report details only. " +
        "Profile links are unverified. Comments are not " +
        "automatically retrieved.",

      accounts: usernames.flatMap(username =>
        platforms.map(([platform, prefix, suffix]) => ({
          platform,
          username,
          url: prefix + encodeURIComponent(username) + suffix,
          status: "Unverified"
        }))
      ),

      posts
    };

    $("filter").value = "";
    $("post-search").value = "";

    $("export").disabled = false;
    $("print").disabled = false;

    $("summary").hidden = false;
    $("summary").textContent =
      "Audit: " +
      (report.details.fullName || usernames.join(", ")) +
      "\n" +
      usernames.length +
      " usernames · " +
      posts.length +
      " imported entries in scope\n" +
      (from || "Any start date") +
      " → " +
      (to || "Any end date");

    render();

  } catch (error) {
    $("error").textContent = error.message;

  } finally {
    button.disabled = false;
    button.textContent = "Generate audit →";
  }
});

/* Return accounts matching the platform filter. */
function selectedAccounts() {
  const platform = $("filter").value;

  return report.accounts.filter(account =>
    !platform || account.platform === platform
  );
}

/* Refresh all result sections. */
function render() {
  if (!report) return;

  renderProfiles();
  renderCommentLinks();
  renderPosts();
}

/* Show ordinary profile links. */
function renderProfiles() {
  const accounts = selectedAccounts();

  $("profile-panel").hidden = false;
  $("results").replaceChildren();

  $("count").textContent =
    accounts.length +
    " unverified links · " +
    report.details.usernames.length +
    " usernames";

  let previousUsername = null;

  for (const account of accounts) {
    /* Add a divider before the next username's results. */
    if (
      previousUsername !== null &&
      account.username !== previousUsername
    ) {
      const divider = document.createElement("div");
      divider.className = "username-divider";
      divider.setAttribute("role", "separator");

      $("results").append(divider);
    }

    const card = element("article");

    card.append(
      element("h2", account.platform),
      element(
        "span",
        "UNVERIFIED · @" + account.username,
        "badge"
      ),
      element("p", account.url, "url"),
      externalLink("Open profile ↗", account.url)
    );

    $("results").append(card);
    previousUsername = account.username;
  }
}

/*
  Reddit has a public comment-history route.
  Other supported platforms get clearly labeled profile links.
*/
function renderCommentLinks() {
  $("comment-panel").hidden = false;
  $("comment-links").replaceChildren();

  const fragment = document.createDocumentFragment();

  for (const account of selectedAccounts()) {
    const hasCommentHistory = account.platform === "Reddit";
    const card = element("article");

    const description = hasCommentHistory
      ? "Public comment history · username not verified."
      : "No public comment-history link is available here. " +
        "Opening the profile does not list all comments.";

    const url = hasCommentHistory
      ? "https://www.reddit.com/user/" +
        encodeURIComponent(account.username) +
        "/comments/"
      : account.url;

    const text = hasCommentHistory
      ? "View public comments ↗"
      : "Open profile ↗";

    card.append(
      element(
        "h2",
        account.platform + " · @" + account.username
      ),
      element("p", description, "hint"),
      externalLink(text, url)
    );

    fragment.append(card);
  }

  $("comment-links").append(fragment);
}

/* Search and display imported entries. */
function renderPosts() {
  $("post-panel").hidden = false;
  $("posts").replaceChildren();

  const query = $("post-search").value.toLowerCase();
  const selectedPlatform = $("filter").value;

  const posts = report.posts
    .filter(post =>
      post.text.toLowerCase().includes(query) &&
      (
        !selectedPlatform ||
        post.platform.toLowerCase() === selectedPlatform.toLowerCase()
      )
    )
    .sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp)
    );

  if (!posts.length) {
    $("posts").append(
      element(
        "p",
        "No imported posts or comments match this scope.",
        "description"
      )
    );

    return;
  }

  const fragment = document.createDocumentFragment();

  for (const post of posts) {
    const row = element("div", undefined, "post");

    row.append(
      element(
        "small",
        post.platform + " · " + (post.timestamp || "Undated")
      ),
      element("p", post.text)
    );

    if (post.url) {
      row.append(externalLink("Open source ↗", post.url));
    }

    fragment.append(row);
  }

  $("posts").append(fragment);
}

$("filter").addEventListener("change", render);

$("post-search").addEventListener("input", () => {
  if (report) renderPosts();
});

/* Export the audit, including entered details and scoped imports. */
$("export").addEventListener("click", () => {
  if (!report) return;

  const blob = new Blob(
    [JSON.stringify(report, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "omnis-eyes-audit.json";

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* Use the browser's print / Save as PDF dialog. */
$("print").addEventListener("click", () => {
  if (report) window.print();
});