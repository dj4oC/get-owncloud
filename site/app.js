const form = document.querySelector("#sizing-form");
const output = document.querySelector("#sizing-output");
const eula = document.querySelector("#eula");
const generate = document.querySelector("#generate");
const status = document.querySelector("#generate-status");

const rules = await fetch("catalog/sizing.json").then((response) => {
  if (!response.ok) throw new Error("Sizing rules are unavailable");
  return response.json();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = new FormData(form);
  const users = Number(values.get("users"));
  const bundled = values.get("collabora") === "on";
  const suppliedConcurrency = Number(values.get("concurrency"));
  const concurrency = bundled
    ? (suppliedConcurrency || Math.max(1, Math.ceil(users * rules.defaults.collaboraConcurrentPercent / 100)))
    : 0;
  let cpu = rules.base.cpu;
  let ram = rules.base.ramMiB;
  if (bundled) {
    cpu += Math.max(rules.collabora.minimumCpu, Math.ceil(concurrency / rules.collabora.usersPerCpuThreadCrossCheck));
    ram += rules.collabora.baseRamMiB + concurrency * rules.collabora.ramMiBPerConcurrentUser;
  }
  const recommendedCpu = Math.ceil(cpu * 1.3);
  const recommendedRam = Math.ceil(ram * 1.3 / 256) * 256;
  const identity = users > 20 ? "External identity is required." : "Embedded identity remains eligible."
  output.textContent = `Minimum: ${cpu} CPU / ${Math.ceil(ram / 1024)} GiB RAM. Recommended: ${recommendedCpu} CPU / ${Math.ceil(recommendedRam / 1024)} GiB RAM. ${identity} Recommendation includes 30% headroom but is not guaranteed capacity; production load testing is mandatory.`;
});

eula.addEventListener("change", () => {
  generate.disabled = !eula.checked;
  status.textContent = eula.checked
    ? "Current EULA accepted locally for this browser session."
    : "Accept the current EULA to enable generation.";
});

generate.addEventListener("click", () => {
  if (!eula.checked) return;
  status.textContent = "Policy foundation is ready. Runnable target output remains gated by its compatibility status.";
});
