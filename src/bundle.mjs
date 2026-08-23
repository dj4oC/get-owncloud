const encoder = new TextEncoder();

export async function sha256Text(value) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function env(name, value) {
  const text = String(value ?? "");
  if (/[\r\n\0]/.test(text)) throw new Error("Unsafe environment value for " + name);
  return name + "=" + JSON.stringify(text);
}

function composeFiles(profile) {
  const files = ["docker-compose.yml", "ocis.yml"];
  if (profile.target.runtime === "podman") files.push("podman.yml");
  if (profile.features.search) files.push("tika.yml");
  if (profile.storage.mode === "s3ng") files.push("s3ng.yml");
  if (profile.office.mode === "collabora") {
    files.push(profile.office.deployment === "bundled" ? "collabora.yml" : "collabora-external.yml");
    if (profile.target.runtime === "podman") files.push("podman-collaboration.yml");
  }
  if (profile.features.clamav) files.push("clamav.yml");
  if (profile.identity.mode === "external-oidc") files.push("external-oidc.yml");
  return files;
}

function makeEnv(profile, sizing, secrets, selected) {
  const notificationServices = ["notifications"];
  const ocisUrl = `https://${profile.networking.domain}${profile.networking.httpsPort === 443 ? "" : `:${profile.networking.httpsPort}`}`;
  const collaboraUrl = profile.office.mode === "collabora" && profile.office.deployment === "external"
    ? profile.office.url.replace(/\/$/, "")
    : profile.networking.collaboraDomain
      ? `https://${profile.networking.collaboraDomain}${profile.networking.httpsPort === 443 ? "" : `:${profile.networking.httpsPort}`}`
      : "";
  if (profile.features.clamav) notificationServices.push("antivirus");
  const values = [
    ["COMPOSE_PROJECT_NAME", "get-owncloud"],
    ["COMPOSE_FILE", selected.join(":")],
    ["GET_OWNCLOUD_PURPOSE", profile.purpose],
    ["GET_OWNCLOUD_OCIS_VERSION", profile.ocisVersion],
    ["GET_OWNCLOUD_REGISTERED_USERS", profile.workload.registeredUsers],
    ["GET_OWNCLOUD_IDENTITY", profile.identity.mode],
    ["GET_OWNCLOUD_STORAGE_DRIVER", profile.storage.mode],
    ["GET_OWNCLOUD_STORAGE_FILESYSTEM", profile.storage.filesystem],
    ["GET_OWNCLOUD_NFS_VERSION", profile.storage.nfsVersion ?? ""],
    ["GET_OWNCLOUD_REQUIRED_CPU", sizing.minimum.cpu],
    ["GET_OWNCLOUD_REQUIRED_RAM_MIB", sizing.minimum.ramMiB],
    ["GET_OWNCLOUD_REQUIRED_DISK_GIB", sizing.minimum.diskGiB],
    ["GET_OWNCLOUD_RECOMMENDED_CPU", sizing.recommended.cpu],
    ["GET_OWNCLOUD_RECOMMENDED_RAM_MIB", sizing.recommended.ramMiB],
    ["GET_OWNCLOUD_RECOMMENDED_DISK_GIB", sizing.recommended.diskGiB],
    ["GET_OWNCLOUD_EULA_SHA256", "f608b0819964232648c5fb6b22a4d58310331128ad645ab158a35ef1790e2148"],
    ["LOG_DRIVER", profile.target.runtime === "podman" ? "k8s-file" : "local"],
    ["INSECURE", profile.purpose === "evaluation" ? "true" : "false"],
    ["HTTP_PORT", profile.networking.httpPort],
    ["HTTPS_PORT", profile.networking.httpsPort],
    ["DOCKER_SOCKET_PATH", profile.target.runtime === "podman" ? "/run/podman/podman.sock" : "/var/run/docker.sock"],
    ["TRAEFIK_ACME_MAIL", profile.networking.tls.email ?? "hostmaster@" + profile.networking.domain],
    ["TRAEFIK_ACME_CASERVER", profile.networking.tls.caServer ?? "https://acme-v02.api.letsencrypt.org/directory"],
    ["TRAEFIK_CERT_RESOLVER", profile.networking.tls.mode === "acme" ? "http" : ""],
    ["TRAEFIK_DASHBOARD", "false"],
    ["OCIS_DOMAIN", profile.networking.domain],
    ["OCIS_URL", ocisUrl],
    ["OCIS_IMAGE", "docker.io/owncloud/ocis@sha256:8c053ea63fc15b9788d55725b5d3abd9632dd89abfcb8a127e0c85acdd4ec2b4"],
    ["OCIS_CONFIG_DIR", profile.storage.configPath],
    ["OCIS_DATA_DIR", profile.storage.dataPath],
    ["OCIS_BIND_RO_OPTIONS", profile.target.runtime === "podman" && profile.storage.filesystem !== "nfs" ? ":ro,z" : ":ro"],
    ["OCIS_BIND_RW_OPTIONS", profile.target.runtime === "podman" && profile.storage.filesystem !== "nfs" ? ":z" : ""],
    ["ADMIN_PASSWORD", secrets.adminPassword],
    ["DEMO_USERS", profile.security.demoUsers ? "true" : "false"],
    ["PROXY_ENABLE_BASIC_AUTH", profile.security.basicAuth ? "true" : "false"],
    ["START_ADDITIONAL_SERVICES", notificationServices.join(",")],
    ["SMTP_HOST", profile.mail?.host ?? ""],
    ["SMTP_PORT", profile.mail?.port ?? ""],
    ["SMTP_SENDER", profile.mail?.sender ?? ""],
    ["SMTP_USERNAME", profile.mail?.username ?? ""],
    ["SMTP_PASSWORD", profile.mail?.username ? secrets.smtpPassword ?? "" : ""],
    ["SMTP_AUTHENTICATION", profile.mail?.authentication === "none" ? "" : profile.mail?.authentication ?? ""],
    ["SMTP_INSECURE", profile.mail?.insecure ? "true" : "false"],
    ["COLLABORA_DOMAIN", profile.networking.collaboraDomain ?? ""],
    ["COLLABORA_URL", collaboraUrl],
    ["COLLABORA_EXTERNAL_URL", profile.office.url ?? ""],
    ["COLLABORA_ADMIN_USER", "admin"],
    ["COLLABORA_ADMIN_PASSWORD", profile.office.mode === "collabora" && profile.office.deployment === "bundled" ? secrets.collaboraAdminPassword ?? "" : ""],
    ["COLLABORA_SSL_VERIFICATION", profile.purpose === "production" ? "true" : "false"],
    ["OCIS_OIDC_ISSUER", profile.identity.issuer ?? ""],
    ["OCIS_OIDC_CLIENT_ID", profile.identity.clientId ?? ""],
    ["OCIS_OIDC_USER_CLAIM", profile.identity.userClaim ?? "preferred_username"],
    ["OCIS_OIDC_CS3_CLAIM", profile.identity.cs3Claim ?? "username"],
    ["LDAP_URI", profile.identity.ldapUri ?? ""],
    ["LDAP_BIND_DN", profile.identity.ldapBindDn ?? ""],
    ["LDAP_BIND_PASSWORD", profile.identity.mode === "external-oidc" ? secrets.ldapBindPassword ?? "" : ""],
    ["LDAP_USER_BASE_DN", profile.identity.ldapUserBaseDn ?? ""],
    ["LDAP_GROUP_BASE_DN", profile.identity.ldapGroupBaseDn ?? ""],
    ["LDAP_USER_ID_ATTRIBUTE", profile.identity.ldapUserIdAttribute ?? "ownclouduuid"],
    ["LDAP_USER_NAME_ATTRIBUTE", profile.identity.ldapUserNameAttribute ?? "uid"],
    ["LDAP_GROUP_ID_ATTRIBUTE", profile.identity.ldapGroupIdAttribute ?? "ownclouduuid"],
    ["LDAP_GROUP_NAME_ATTRIBUTE", profile.identity.ldapGroupNameAttribute ?? "cn"],
    ["S3NG_ENDPOINT", profile.storage.s3?.endpoint ?? ""],
    ["S3NG_REGION", profile.storage.s3?.region ?? ""],
    ["S3NG_BUCKET", profile.storage.s3?.bucket ?? ""],
    ["S3NG_ACCESS_KEY", profile.storage.mode === "s3ng" ? secrets.s3AccessKey ?? "" : ""],
    ["S3NG_SECRET_KEY", profile.storage.mode === "s3ng" ? secrets.s3SecretKey ?? "" : ""],
    ["GET_OWNCLOUD_AUTO_SECURITY_UPDATES", profile.updates.automaticSecurityPatches ? "true" : "false"],
    ["GET_OWNCLOUD_UPDATE_DELAY_HOURS", profile.updates.observationDelayHours],
    ["GET_OWNCLOUD_BACKUP_RECIPIENT", profile.updates.backupRecipient ?? ""],
    ["GET_OWNCLOUD_RUNTIME", profile.target.runtime]
  ];
  return values.map(([name, value]) => env(name, value)).join("\n") + "\n";
}

function readme(profile) {
  const command = profile.target.runtime === "podman" ? "podman compose" : "docker compose";
  const privilege = profile.target.runtime === "docker" ? " --allow-sudo" : "";
  const deployCommand = profile.target.manager === "ansible"
    ? `ANSIBLE_ROLES_PATH=ansible/roles ansible-playbook -i "owncloud," -c local ansible/playbook.yml -e "get_owncloud_bundle_dir=$PWD" -e get_owncloud_accept_eula=true${profile.target.runtime === "docker" ? " -e get_owncloud_allow_sudo=true" : ""}`
    : `sh install.sh --bundle-dir . --accept-eula${privilege}`;
  return [
    "# Generated ownCloud Infinite Scale deployment",
    "",
    "This bundle was generated for oCIS " + profile.ocisVersion + " from the locked, policy-restricted ocis_full model.",
    "",
    "1. Read the pinned EULA URL in eula-acknowledgement.json.",
    "2. Inspect deployment-profile.json, deployment.lock.json, .env and every Compose fragment.",
    "3. Run: " + deployCommand,
    "4. Inspect status: " + command + " ps",
    "5. Back up before every update: sh scripts/backup.sh --recipient AGE_RECIPIENT",
    "",
    "The .env file contains generated secrets. It is mode 0600 when generated by the CLI. Do not commit it.",
    "Production capacity requires representative load testing; sizing output is a planning recommendation.",
    ""
  ].join("\n");
}

export function requiredTemplatePaths(profile) {
  const paths = composeFiles(profile).map((name) => "deploy/compose/template/" + name);
  const suffix = profile.office.mode === "collabora" ? "collabora" : "none";
  paths.push("deploy/compose/template/config/app-registry-" + suffix + ".yaml");
  paths.push("deploy/compose/template/config/csp-" + suffix + ".yaml");
  paths.push("deploy/compose/template/config/banned-password-list.txt");
  for (const name of ["install.sh", "runtime-common.sh", "healthcheck.sh", "backup.sh", "restore.sh", "update-service.sh"]) {
    paths.push("scripts/" + name);
  }
  if (profile.target.manager === "ansible") {
    paths.push(
      "ansible/playbook.yml",
      "ansible/requirements.yml",
      "ansible/inventory.example.yml",
      "ansible/roles/get_owncloud/defaults/main.yml",
      "ansible/roles/get_owncloud/meta/main.yml",
      "ansible/roles/get_owncloud/tasks/main.yml"
    );
  }
  return paths;
}

export async function buildSingleHostBundle({ profile, sizing, templates, secrets, legal, sources, acceptance }) {
  const selected = composeFiles(profile);
  const files = {};
  for (const name of selected) files[name] = templates["deploy/compose/template/" + name];
  const suffix = profile.office.mode === "collabora" ? "collabora" : "none";
  files["config/ocis/app-registry.yaml"] = templates["deploy/compose/template/config/app-registry-" + suffix + ".yaml"];
  files["config/ocis/csp.yaml"] = templates["deploy/compose/template/config/csp-" + suffix + ".yaml"];
  files["config/ocis/banned-password-list.txt"] = templates["deploy/compose/template/config/banned-password-list.txt"];
  files["install.sh"] = templates["scripts/install.sh"];
  for (const name of ["runtime-common.sh", "healthcheck.sh", "backup.sh", "restore.sh", "update-service.sh"]) {
    files["scripts/" + name] = templates["scripts/" + name];
  }
  if (profile.target.manager === "ansible") {
    for (const path of [
      "ansible/playbook.yml",
      "ansible/requirements.yml",
      "ansible/inventory.example.yml",
      "ansible/roles/get_owncloud/defaults/main.yml",
      "ansible/roles/get_owncloud/meta/main.yml",
      "ansible/roles/get_owncloud/tasks/main.yml"
    ]) files[path] = templates[path];
  }
  files[".env"] = makeEnv(profile, sizing, secrets, selected);
  files["deployment-profile.json"] = JSON.stringify(profile, null, 2) + "\n";
  files["sizing-report.json"] = JSON.stringify(sizing, null, 2) + "\n";
  files["eula-acknowledgement.json"] = JSON.stringify({
    accepted: true,
    acceptedAt: acceptance.acceptedAt,
    acceptedBy: acceptance.acceptedBy,
    eulaVersion: legal.version,
    eulaUrl: legal.url,
    eulaSha256: legal.sha256,
    acknowledgedSections: legal.requiredSections,
    runtimeAcceptanceStillRequired: true
  }, null, 2) + "\n";
  const profileSha256 = await sha256Text(files["deployment-profile.json"]);
  files["deployment.lock.json"] = JSON.stringify({
    formatVersion: 1,
    profileSha256,
    rendererVersion: "0.2.0",
    ocisVersion: profile.ocisVersion,
    composeSource: sources.sources.ocisCompose,
    eulaSha256: legal.sha256,
    images: {
      ocis: "docker.io/owncloud/ocis@sha256:8c053ea63fc15b9788d55725b5d3abd9632dd89abfcb8a127e0c85acdd4ec2b4",
      traefik: "docker.io/library/traefik@sha256:c549d482c55d7a797398562064f35428cc53e748d84d7190997930e7b31bcc32",
      collabora: profile.office.deployment === "bundled" ? "docker.io/collabora/code@sha256:0011be3edac909b390e6f297093bb82f61f9f3ce5476a3bdd4f3ce6b12f74ec3" : null,
      tika: profile.features.search ? "docker.io/apache/tika@sha256:21d8052de04e491ccf66e8680ade4da6f3d453a56d59f740b4167e54167219b7" : null,
      clamav: profile.features.clamav ? "docker.io/clamav/clamav@sha256:75fb5fd95fcbe1d7e6d240c369c1572b686ee2c95949d1042b5148de8eddebb4" : null
    },
    selectedComposeFiles: selected,
    maturity: profile.target.runtime === "podman" ? "community-preview" : "production"
  }, null, 2) + "\n";
  files["README.md"] = readme(profile);
  const hashes = [];
  for (const path of Object.keys(files).sort()) hashes.push((await sha256Text(files[path])) + "  " + path);
  files["manifest.sha256"] = hashes.join("\n") + "\n";
  return files;
}
