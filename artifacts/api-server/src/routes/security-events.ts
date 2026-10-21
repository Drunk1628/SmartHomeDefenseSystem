
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  devices,
  securityAlerts,
  auditLogs,
} from "@workspace/db";

const router: IRouter = Router();

function toUiAlert(alert: {
  id: number;
  alertType: string;
  severity: string;
  description: string;
  alertStatus: string;
  detectedAt: Date;
  deviceName: string | null;
}) {
  const elapsed = Math.max(
    0,
    Date.now() - new Date(alert.detectedAt).getTime(),
  );
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const time =
    minutes < 1 ? "Just now" :
    minutes < 60 ? `${minutes} min ago` :
    hours < 24 ? `${hours} hr ago` :
    days === 1 ? "Yesterday" :
    `${days} days ago`;

  return {
    id: String(alert.id),
    severity:
      alert.severity.charAt(0).toUpperCase() +
      alert.severity.slice(1),
    title: alert.alertType,
    device: alert.deviceName ?? "Unknown device",
    description: alert.description,
    time,
    resolved: alert.alertStatus === "resolved",
    acknowledged:
      alert.alertStatus === "investigating" ||
      alert.alertStatus === "resolved",
  };
}

router.get("/security-events", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: securityAlerts.id,
        alertType: securityAlerts.alertType,
        severity: securityAlerts.severity,
        description: securityAlerts.description,
        alertStatus: securityAlerts.alertStatus,
        detectedAt: securityAlerts.detectedAt,
        deviceName: devices.deviceName,
      })
      .from(securityAlerts)
      .leftJoin(
        devices,
        eq(securityAlerts.deviceId, devices.id),
      )
      .orderBy(desc(securityAlerts.detectedAt));

    res.json(rows.map(toUiAlert));
  } catch (error) {
    next(error);
  }
});


router.post("/security-events/simulate", async (req, res, next) => {
  try {
    const deviceId = Number(req.body?.deviceId);
    const scenario = req.body?.scenario;

    if (!Number.isSafeInteger(deviceId) || deviceId <= 0) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }

    if (scenario !== "suspicious_traffic") {
      res.status(400).json({ error: "Unsupported simulation scenario" });
      return;
    }

    const [device] = await db
      .select()
      .from(devices)
      .where(eq(devices.id, deviceId));

    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [alert] = await tx
        .insert(securityAlerts)
        .values({
          deviceId: device.id,
          alertType: "Unusual outbound traffic",
          severity: "critical",
          description:
            `SIMULATION: Unusual outbound traffic detected for ${device.deviceName}. No real network traffic was inspected.`,
          alertStatus: "open",
          detectionSource: "demo_simulator",
          detectedAt: new Date(),
        })
        .returning();

      await tx.insert(auditLogs).values({
        action: "security_alert.simulated",
        resourceType: "security_alert",
        resourceId: String(alert.id),
        outcome: "success",
        details: {
          scenario: "suspicious_traffic",
          deviceId: device.id,
          deviceName: device.deviceName,
          simulated: true,
        },
      });

      return alert;
    });

    res.status(201).json({
      message: "Simulated security event created",
      alert: {
        id: String(result.id),
        device: device.deviceName,
        title: result.alertType,
        severity: result.severity,
        status: result.alertStatus,
        simulated: true,
      },
    });
  } catch (error) {
    next(error);
  }
});


async function changeAlertStatus(
  id: number,
  status: "investigating" | "resolved",
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(securityAlerts)
      .where(eq(securityAlerts.id, id));

    if (!existing) {
      return null;
    }

    // A resolved alert must not become active again by accident.
    if (existing.alertStatus === "resolved") {
      return existing;
    }

    const now = new Date();

    const [updated] = await tx
      .update(securityAlerts)
      .set(
        status === "resolved"
          ? {
              alertStatus: "resolved",
              resolvedAt: now,
            }
          : {
              alertStatus: "investigating",
            },
      )
      .where(eq(securityAlerts.id, id))
      .returning();

    await tx.insert(auditLogs).values({
      action:
        status === "resolved"
          ? "security_alert.resolved"
          : "security_alert.acknowledged",
      resourceType: "security_alert",
      resourceId: String(id),
      outcome: "success",
      details: {
        previousStatus: existing.alertStatus,
        newStatus: updated.alertStatus,
      },
    });

    return updated;
  });
}

router.patch(
  "/security-events/:id/acknowledge",
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid alert ID" });
        return;
      }

      const updated = await changeAlertStatus(id, "investigating");

      if (!updated) {
        res.status(404).json({ error: "Security event not found" });
        return;
      }

      res.json({ message: "Security event acknowledged" });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/security-events/:id/resolve",
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid alert ID" });
        return;
      }

      const updated = await changeAlertStatus(id, "resolved");

      if (!updated) {
        res.status(404).json({ error: "Security event not found" });
        return;
      }

      res.json({ message: "Security event resolved" });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
