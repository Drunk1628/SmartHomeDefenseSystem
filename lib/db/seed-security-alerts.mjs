
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(currentDirectory, "../../.env"),
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from the root .env file.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT COUNT(*)::int AS count FROM security_alerts",
    );

    if (existing.rows[0].count > 0) {
      console.log(
        `Skipped: security_alerts already contains ${existing.rows[0].count} record(s).`,
      );
      await client.query("ROLLBACK");
      return;
    }

    const devicesResult = await client.query(
      "SELECT id, device_name FROM devices",
    );

    const deviceId = (name) => {
      const device = devicesResult.rows.find(
        (row) => row.device_name === name,
      );

      if (!device) {
        throw new Error(`Device not found: ${name}`);
      }

      return device.id;
    };

    const alerts = [
      {
        deviceId: deviceId("Front porch camera"),
        alertType: "Unusual outbound traffic",
        severity: "critical",
        description:
          "Demo scenario: the camera appears to contact an unfamiliar server.",
        alertStatus: "open",
        age: "4 minutes",
      },
      {
        deviceId: deviceId("Kitchen speaker"),
        alertType: "Firmware update overdue",
        severity: "high",
        description:
          "Demo scenario: a security update has been available for this device for 18 days.",
        alertStatus: "open",
        age: "37 minutes",
      },
      {
        deviceId: null,
        alertType: "New device joined network",
        severity: "medium",
        description:
          "Demo scenario: an unfamiliar device appeared at 192.168.1.88.",
        alertStatus: "investigating",
        age: "2 hours",
      },
      {
        deviceId: deviceId("Home gateway"),
        alertType: "Login from new location",
        severity: "medium",
        description:
          "Demo scenario: admin access was detected from a new local address.",
        alertStatus: "resolved",
        age: "1 day",
      },
    ];

    for (const alert of alerts) {
      await client.query(
  `INSERT INTO security_alerts
    (device_id, alert_type, severity, description, alert_status,
     detection_source, detected_at, resolved_at)
   VALUES
    ($1, $2, $3, $4, $5::varchar, 'demo',
     NOW() - $6::interval,
     CASE WHEN $7::boolean THEN NOW() ELSE NULL END)`,
  [
    alert.deviceId,
    alert.alertType,
    alert.severity,
    alert.description,
    alert.alertStatus,
    alert.age,
    alert.alertStatus === "resolved",
  ],
);
    }

    await client.query("COMMIT");
    console.log(`Inserted ${alerts.length} demo security alerts.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Failed to seed security alerts:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
