
import pg from "pg";
import fs from "node:fs";

const envText = fs.readFileSync("../../.env", "utf8");

for (const line of envText.split(/\r?\n/)) {
  const match = line.match(
    /^\s*(DATABASE_URL_POOLED|DATABASE_URL)\s*=\s*(.*?)\s*$/
  );

  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const connectionString =
  process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Database URL not found in the root .env file.");
}

const pool = new pg.Pool({ connectionString });

const sampleDevices = [
  ["Front porch camera", "Camera", "demo-cam-01", "192.168.1.24", "Entryway", "v2.1.4", "quarantined", "online"],
  ["Home gateway", "Network", "demo-hub-01", "192.168.1.1", "Utility room", "v6.8.2", "trusted", "online"],
  ["Front door lock", "Smart lock", "demo-lock-01", "192.168.1.31", "Entryway", "v4.3.0", "trusted", "online"],
  ["Living room thermostat", "Climate", "demo-therm-01", "192.168.1.46", "Hallway", "v5.12.1", "trusted", "online"],
  ["Kitchen speaker", "Speaker", "demo-speaker-01", "192.168.1.58", "Kitchen", "v1.9.7", "untrusted", "offline"],
  ["Back door sensor", "Sensor", "demo-sensor-01", "192.168.1.63", "Back door", "v3.0.6", "trusted", "online"]
];

try {
  await pool.query("BEGIN");

  // Refuse to seed if records already exist, avoiding accidental duplicates.
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM homes) AS homes,
      (SELECT COUNT(*) FROM devices) AS devices
  `);

  const existing = counts.rows[0];

  if (
    Number(existing.users) !== 0 ||
    Number(existing.homes) !== 0 ||
    Number(existing.devices) !== 0
  ) {
    throw new Error(
      `Expected empty tables; found users=${existing.users}, homes=${existing.homes}, devices=${existing.devices}. No records were added.`
    );
  }

  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, account_status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      "demo-owner@smarthome.test",
      "DEMO_ACCOUNT_NO_LOGIN",
      "Demo Home Owner",
      "active"
    ]
  );

  const userId = userResult.rows[0].id;

  const homeResult = await pool.query(
    `INSERT INTO homes (name, owner_user_id)
     VALUES ($1, $2)
     RETURNING id`,
    ["Demo Smart Home", userId]
  );

  const homeId = homeResult.rows[0].id;

  for (const [name, type, identifier, ip, room, firmware, trust, status] of sampleDevices) {
    await pool.query(
      `INSERT INTO devices (
        home_id, device_name, device_type, device_identifier,
        ip_address, room, firmware_version, trust_status,
        connection_status, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [homeId, name, type, identifier, ip, room, firmware, trust, status]
    );
  }

  await pool.query("COMMIT");

  console.log("Demo data created successfully.");
  console.log({
    userId,
    homeId,
    devicesInserted: sampleDevices.length
  });
} catch (error) {
  await pool.query("ROLLBACK");
  console.error("Demo data was not committed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
