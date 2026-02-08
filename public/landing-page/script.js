const downloadTargets = {
  mac: {
    href: "https://drive.google.com/file/d/1iHZPjz7qWxKqEQNJA1o3zMm6FFmKp7CV/view?usp=sharing",
    label: "Download for macOS (ARM64)"
  },
  win: {
    href: "https://drive.google.com/file/d/1BIlRBqmRvXV14aS1dmQMw6MCgO6WuLo_/view?usp=sharing",
    label: "Download for Windows (x64)"
  },
  linux: {
    href: "https://drive.google.com/file/d/1r3XW17rCorFOoKzF7yXPEsSESyKi780J/view?usp=sharing",
    label: "Download for Linux (DEB x64)"
  },
  fallback: {
    href: "#download",
    label: "See download options"
  }
};

function detectPlatform() {
  const userAgent = String(navigator.userAgent || "").toLowerCase();
  const platform = String(navigator.platform || "").toLowerCase();
  const base = `${userAgent} ${platform}`;

  if (base.includes("mac")) return "mac";
  if (base.includes("win")) return "win";
  if (base.includes("linux")) return "linux";
  return "fallback";
}

function applyDownloadCta() {
  const cta = document.getElementById("downloadNowBtn");
  if (!cta) return;
  const platform = detectPlatform();
  const target = downloadTargets[platform] || downloadTargets.fallback;
  cta.href = target.href;
  cta.textContent = target.label;
}

function applyDownloadCards() {
  const platform = detectPlatform();
  const detected = document.getElementById("downloadDetected");
  const platformLabelByKey = {
    mac: "Detected platform: macOS",
    win: "Detected platform: Windows",
    linux: "Detected platform: Linux",
    fallback: "Detected platform: unknown"
  };

  if (detected) {
    detected.textContent = platformLabelByKey[platform] || platformLabelByKey.fallback;
  }

  const cards = document.querySelectorAll(".download-card");
  cards.forEach((card) => {
    if (!card || !card.dataset) return;
    const isDetected = card.dataset.platform === platform;
    card.classList.toggle("is-detected", isDetected);
  });
}

function applyYear() {
  const year = document.getElementById("year");
  if (!year) return;
  year.textContent = String(new Date().getFullYear());
}

applyDownloadCta();
applyDownloadCards();
applyYear();
